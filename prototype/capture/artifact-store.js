'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ARTIFACT_ID_RE = /^capture-[0-9]{8}t[0-9]{6}-[a-f0-9]{12}$/;
const FILE_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,100}$/;
const DEFAULT_RESOURCE_MAX_BYTES = 64 * 1024 * 1024;

function isoCompact(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').toLowerCase();
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch { /* best effort on non-POSIX hosts */ }
}

function writePrivateFile(filePath, data, options = {}) {
  fs.writeFileSync(filePath, data, { ...options, mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort on non-POSIX hosts */ }
}

function artifactResourceUri(artifactId, fileName) {
  if (!ARTIFACT_ID_RE.test(String(artifactId)) || !FILE_NAME_RE.test(String(fileName))) {
    throw new Error('invalid capture artifact resource');
  }
  return `chromux://capture/${artifactId}/${fileName}`;
}

function resourceLink(artifactId, fileName, mimeType, description) {
  return {
    uri: artifactResourceUri(artifactId, fileName),
    name: fileName,
    mimeType,
    description,
  };
}

function publicArtifact(manifest) {
  return {
    artifactId: manifest.artifactId,
    kind: manifest.kind,
    createdAt: manifest.createdAt,
    completedAt: manifest.completedAt || null,
    resources: (manifest.files || []).map((file) => resourceLink(
      manifest.artifactId,
      file.name,
      file.mimeType,
      file.description,
    )),
  };
}

class CaptureArtifactStore {
  constructor(options = {}) {
    this.root = path.resolve(options.root);
    this.now = options.now || (() => new Date());
    this.randomBytes = options.randomBytes || crypto.randomBytes;
    this.maxResourceBytes = options.maxResourceBytes || DEFAULT_RESOURCE_MAX_BYTES;
    this.openRecordings = new Map();
    ensurePrivateDirectory(this.root);
  }

  newArtifact(kind, metadata = {}) {
    ensurePrivateDirectory(this.root);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const createdAt = this.now();
      const artifactId = `capture-${isoCompact(createdAt)}-${this.randomBytes(6).toString('hex')}`;
      const directory = path.join(this.root, artifactId);
      try {
        fs.mkdirSync(directory, { mode: 0o700 });
        return {
          artifactId,
          directory,
          manifest: {
            artifactId,
            kind,
            createdAt: createdAt.toISOString(),
            metadata,
            files: [],
          },
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    throw new Error('could not allocate a unique capture artifact');
  }

  addFile(artifact, name, data, mimeType, description) {
    if (!FILE_NAME_RE.test(name)) throw new Error('invalid capture file name');
    const filePath = path.join(artifact.directory, name);
    writePrivateFile(filePath, data);
    const record = { name, mimeType, description, bytes: fs.statSync(filePath).size };
    artifact.manifest.files = artifact.manifest.files.filter((file) => file.name !== name);
    artifact.manifest.files.push(record);
    return record;
  }

  writeManifest(artifact) {
    const manifestPath = path.join(artifact.directory, 'manifest.json');
    const files = artifact.manifest.files.filter((file) => file.name !== 'manifest.json');
    artifact.manifest.files = files;
    const manifestRecord = {
      name: 'manifest.json',
      mimeType: 'application/json',
      description: 'Capture manifest',
      bytes: 0,
    };
    artifact.manifest.files.push(manifestRecord);
    let serialized = '';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      serialized = `${JSON.stringify(artifact.manifest, null, 2)}\n`;
      const bytes = Buffer.byteLength(serialized);
      if (manifestRecord.bytes === bytes) break;
      manifestRecord.bytes = bytes;
    }
    serialized = `${JSON.stringify(artifact.manifest, null, 2)}\n`;
    writePrivateFile(manifestPath, serialized, { encoding: 'utf8' });
    return manifestPath;
  }

  createScreenshot({ kind, png, payload = null, metadata = {} }) {
    if (!Buffer.isBuffer(png) || !png.length) throw new Error('capture screenshot is empty');
    const artifact = this.newArtifact(kind, metadata);
    this.addFile(artifact, 'screenshot.png', png, 'image/png', 'Approved capture screenshot');
    if (payload) {
      const persistedPayload = {
        ...payload,
        screenshot: {
          ...(payload.screenshot || {}),
          path: artifactResourceUri(artifact.artifactId, 'screenshot.png'),
          mode: payload.screenshot?.mode || 'visible-viewport',
        },
      };
      const yamlText = yaml.dump(persistedPayload, { lineWidth: 120, noRefs: true });
      this.addFile(artifact, 'payload.yaml', yamlText, 'application/yaml', 'Browser evidence payload');
    }
    artifact.manifest.completedAt = this.now().toISOString();
    this.writeManifest(artifact);
    return {
      ...publicArtifact(artifact.manifest),
      metadata: artifact.manifest.metadata,
      manifest: artifact.manifest,
    };
  }

  beginRecording({ recordingId, metadata = {} }) {
    if (!recordingId || this.openRecordings.has(recordingId)) throw new Error('invalid or duplicate recording id');
    const artifact = this.newArtifact('recording', metadata);
    const videoPath = path.join(artifact.directory, 'recording.webm');
    const descriptor = fs.openSync(videoPath, 'wx', 0o600);
    const recording = { recordingId, artifact, videoPath, descriptor, bytes: 0, closed: false };
    this.openRecordings.set(recordingId, recording);
    return {
      recordingId,
      artifactId: artifact.artifactId,
      createdAt: artifact.manifest.createdAt,
    };
  }

  appendRecordingChunk(recordingId, chunk) {
    const recording = this.openRecordings.get(recordingId);
    if (!recording || recording.closed) throw new Error('recording is not writable');
    if (!Buffer.isBuffer(chunk) || !chunk.length) return recording.bytes;
    fs.writeSync(recording.descriptor, chunk);
    recording.bytes += chunk.length;
    return recording.bytes;
  }

  finalizeRecording(recordingId, { contactSheet = null, metadata = {} } = {}) {
    const recording = this.openRecordings.get(recordingId);
    if (!recording) return this.readRecordingResult(recordingId);
    if (!recording.closed) {
      fs.closeSync(recording.descriptor);
      recording.closed = true;
    }
    const { artifact } = recording;
    const videoBytes = fs.statSync(recording.videoPath).size;
    artifact.manifest.files.push({
      name: 'recording.webm',
      mimeType: metadata.mimeType || 'video/webm',
      description: 'Approved Chromux window recording',
      bytes: videoBytes,
    });
    if (Buffer.isBuffer(contactSheet) && contactSheet.length) {
      this.addFile(
        artifact,
        'contact-sheet.png',
        contactSheet,
        'image/png',
        'Timestamped recording contact sheet',
      );
    }
    artifact.manifest.metadata = { ...artifact.manifest.metadata, ...metadata, recordingId };
    artifact.manifest.completedAt = metadata.stoppedAt || this.now().toISOString();
    this.writeManifest(artifact);
    this.openRecordings.delete(recordingId);
    return this.recordingResultFromManifest(artifact.manifest);
  }

  readRecordingResult(recordingId) {
    const entries = fs.readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && ARTIFACT_ID_RE.test(entry.name));
    for (const entry of entries) {
      const manifest = this.readManifest(entry.name);
      if (manifest?.kind === 'recording' && manifest.metadata?.recordingId === recordingId) {
        return this.recordingResultFromManifest(manifest);
      }
    }
    throw new Error('unknown recording id');
  }

  recordingResultFromManifest(manifest) {
    return {
      recordingId: manifest.metadata.recordingId,
      ...publicArtifact(manifest),
      metadata: manifest.metadata,
      manifest,
    };
  }

  readManifest(artifactId) {
    if (!ARTIFACT_ID_RE.test(String(artifactId))) throw new Error('invalid capture artifact id');
    const artifactDirectory = path.join(this.root, artifactId);
    let directoryStat;
    try { directoryStat = fs.lstatSync(artifactDirectory); } catch { throw new Error('capture artifact not found'); }
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error('invalid capture artifact directory');
    }
    const manifestPath = path.join(artifactDirectory, 'manifest.json');
    let stat;
    try { stat = fs.lstatSync(manifestPath); } catch { throw new Error('capture artifact not found'); }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
      throw new Error('invalid capture manifest');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.artifactId !== artifactId || !Array.isArray(manifest.files)) {
      throw new Error('invalid capture manifest');
    }
    return manifest;
  }

  readResource(uri, options = {}) {
    let parsed;
    try { parsed = new URL(uri); } catch { throw new Error('invalid capture resource URI'); }
    if (parsed.protocol !== 'chromux:' || parsed.hostname !== 'capture'
      || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
      throw new Error('invalid capture resource URI');
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 2) throw new Error('invalid capture resource URI');
    const [artifactId, fileName] = segments.map((segment) => decodeURIComponent(segment));
    if (!ARTIFACT_ID_RE.test(artifactId) || !FILE_NAME_RE.test(fileName)) {
      throw new Error('invalid capture resource URI');
    }
    const manifest = this.readManifest(artifactId);
    const record = manifest.files.find((file) => file?.name === fileName);
    if (!record) throw new Error('capture resource is not in the artifact manifest');
    const artifactDirectory = path.resolve(this.root, artifactId);
    const filePath = path.resolve(artifactDirectory, fileName);
    if (!filePath.startsWith(`${artifactDirectory}${path.sep}`)) throw new Error('invalid capture resource path');
    const stat = fs.lstatSync(filePath);
    const maxBytes = options.maxBytes || this.maxResourceBytes;
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid capture resource file');
    if (stat.size > maxBytes) throw new Error(`capture resource exceeds ${maxBytes} bytes`);
    return {
      uri: artifactResourceUri(artifactId, fileName),
      artifactId,
      fileName,
      mimeType: record.mimeType || 'application/octet-stream',
      bytes: fs.readFileSync(filePath),
    };
  }
}

module.exports = {
  ARTIFACT_ID_RE,
  DEFAULT_RESOURCE_MAX_BYTES,
  CaptureArtifactStore,
  artifactResourceUri,
  publicArtifact,
  resourceLink,
};
