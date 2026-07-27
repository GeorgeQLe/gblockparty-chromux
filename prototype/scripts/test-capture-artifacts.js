'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CaptureArtifactStore,
  artifactResourceUri,
} = require('../capture/artifact-store');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-artifacts-'));
let random = 0;
const store = new CaptureArtifactStore({
  root,
  now: () => new Date('2026-07-27T12:34:56.000Z'),
  randomBytes: () => Buffer.from(String(++random).padStart(12, '0'), 'hex'),
});

try {
  const screenshot = store.createScreenshot({
    kind: 'browser-screenshot',
    png: Buffer.from('png-data'),
    payload: { page: { url: 'https://example.test/' } },
    metadata: { targetId: 'browser:s1' },
  });
  assert.match(screenshot.artifactId, /^capture-20260727t123456-[a-f0-9]{12}$/);
  assert.deepEqual(
    screenshot.resources.map((resource) => resource.name).sort(),
    ['manifest.json', 'payload.yaml', 'screenshot.png'],
  );
  const png = store.readResource(
    artifactResourceUri(screenshot.artifactId, 'screenshot.png'),
  );
  assert.equal(png.mimeType, 'image/png');
  assert.equal(png.bytes.toString(), 'png-data');
  const payload = store.readResource(
    artifactResourceUri(screenshot.artifactId, 'payload.yaml'),
  );
  assert.match(payload.bytes.toString(), /https:\/\/example\.test\//);
  assert.match(
    payload.bytes.toString(),
    new RegExp(`chromux://capture/${screenshot.artifactId}/screenshot\\.png`),
  );
  const screenshotManifest = store.readManifest(screenshot.artifactId);
  assert.equal(
    screenshotManifest.files.find((file) => file.name === 'manifest.json').bytes,
    fs.statSync(path.join(root, screenshot.artifactId, 'manifest.json')).size,
  );

  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(root).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(root, screenshot.artifactId)).mode & 0o777, 0o700);
    assert.equal(
      fs.statSync(path.join(root, screenshot.artifactId, 'screenshot.png')).mode & 0o777,
      0o600,
    );
    const linkedArtifactId = 'capture-20260727t123456-ffffffffffff';
    fs.symlinkSync(
      path.join(root, screenshot.artifactId),
      path.join(root, linkedArtifactId),
      'dir',
    );
    assert.throws(
      () => store.readManifest(linkedArtifactId),
      /invalid capture artifact directory/,
    );
    fs.unlinkSync(path.join(root, linkedArtifactId));
  }

  for (const uri of [
    `chromux://capture/${screenshot.artifactId}/../manifest.json`,
    `chromux://capture/${screenshot.artifactId}/%2e%2e%2fmanifest.json`,
    'file:///etc/passwd',
    'chromux://capture/not-an-artifact/screenshot.png',
    `chromux://capture/${screenshot.artifactId}/missing.png`,
  ]) {
    assert.throws(() => store.readResource(uri), /invalid|not found|not in the artifact manifest/);
  }
  assert.throws(
    () => store.readResource(artifactResourceUri(screenshot.artifactId, 'screenshot.png'), { maxBytes: 2 }),
    /exceeds 2 bytes/,
  );

  const started = store.beginRecording({
    recordingId: 'recording-1',
    metadata: { targetId: 'chromux-window:1', requester: 'Agent A' },
  });
  store.appendRecordingChunk('recording-1', Buffer.from('chunk-1'));
  store.appendRecordingChunk('recording-1', Buffer.from('chunk-2'));
  const completed = store.finalizeRecording('recording-1', {
    contactSheet: Buffer.from('sheet'),
    metadata: {
      startedAt: '2026-07-27T12:34:56.000Z',
      stoppedAt: '2026-07-27T12:35:04.000Z',
      durationMs: 8000,
      dimensions: { width: 1280, height: 720 },
      mimeType: 'video/webm;codecs=vp9,opus',
      codec: 'vp9/opus',
      audio: 'available',
    },
  });
  assert.equal(completed.artifactId, started.artifactId);
  assert.equal(completed.metadata.durationMs, 8000);
  assert.deepEqual(
    completed.resources.map((resource) => resource.name).sort(),
    ['contact-sheet.png', 'manifest.json', 'recording.webm'],
  );
  assert.equal(
    store.readResource(artifactResourceUri(completed.artifactId, 'recording.webm')).bytes.toString(),
    'chunk-1chunk-2',
  );
  assert.equal(store.finalizeRecording('recording-1').artifactId, completed.artifactId);

  console.log('capture artifact tests: ok');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
