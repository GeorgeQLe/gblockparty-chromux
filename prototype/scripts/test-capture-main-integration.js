#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { CaptureControlClient } = require('../capture/control');
const { captureControlSocketPath } = require('../capture/paths');

function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error('timed out waiting for capture integration state'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

(async () => {
  if (process.platform !== 'darwin') {
    console.log(`CAPTURE_MAIN_INTEGRATION_SKIPPED_${process.platform.toUpperCase()}`);
    return;
  }
  const appDir = path.resolve(__dirname, '..');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-main-'));
  const homeDir = path.join(tmpDir, 'home');
  const chromuxHome = path.join(tmpDir, 'chromux-home');
  const e2ePath = path.join(tmpDir, 'capture-main-e2e.js');
  const e2eOutPath = path.join(tmpDir, 'e2e.out');
  fs.mkdirSync(homeDir, { recursive: true });

  fs.writeFileSync(e2ePath, `
(async () => {
  const api = window.chromuxTestCaptureControl;
  if (!api) throw new Error('Missing capture control test API');
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const completions = [];

  class FakeTrack {
    constructor(kind) {
      this.kind = kind;
      this.readyState = 'live';
      this.muted = false;
      this.listeners = new Map();
    }
    getSettings() { return this.kind === 'video' ? { width: 960, height: 540, frameRate: 15 } : {}; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    stop() { this.readyState = 'ended'; }
  }
  class FakeStream {
    constructor() {
      this.video = new FakeTrack('video');
      this.audio = new FakeTrack('audio');
    }
    getTracks() { return [this.video, this.audio].filter(Boolean); }
    getVideoTracks() { return [this.video]; }
    getAudioTracks() { return this.audio ? [this.audio] : []; }
    removeTrack(track) { if (track === this.audio) this.audio = null; }
  }
  class FakeRecorder {
    static isTypeSupported(type) { return type.startsWith('video/webm'); }
    constructor(_stream, options) {
      this.mimeType = options.mimeType || 'video/webm';
      this.state = 'inactive';
      this.listeners = new Map();
    }
    addEventListener(name, callback, options = {}) {
      const listeners = this.listeners.get(name) || [];
      listeners.push({ callback, once: Boolean(options.once) });
      this.listeners.set(name, listeners);
    }
    emit(name, value = {}) {
      const listeners = this.listeners.get(name) || [];
      this.listeners.set(name, listeners.filter((listener) => !listener.once));
      for (const listener of listeners) listener.callback(value);
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.emit('dataavailable', { data: new Blob(['main-integration-webm'], { type: this.mimeType }) });
      this.emit('stop');
    }
  }
  api.setMediaMocks({
    mediaDevices: { getDisplayMedia: async () => new FakeStream() },
    MediaRecorder: FakeRecorder,
    createVideo: () => ({
      muted: false,
      playsInline: false,
      srcObject: null,
      videoWidth: 960,
      videoHeight: 540,
      play: async () => {},
      pause: () => {},
    }),
    onComplete: (message) => completions.push(message),
  });

  let approvals = 0;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (api.approval()?.visible) {
      api.allow();
      approvals += 1;
    }
    if (approvals >= 3 && completions.length >= 2) {
      return JSON.stringify({
        ok: true,
        approvals,
        completions: completions.map((completion) => completion.metadata.stopReason),
      });
    }
    await wait(10);
  }
  throw new Error('capture integration E2E timed out');
})()
`);

  const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
  const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
    cwd: appDir,
    env: {
      ...process.env,
      HOME: homeDir,
      PATH: '/usr/bin:/bin',
      CHROMUX_HOME_DIR: chromuxHome,
      CHROMUX_CAPTURE_CONTROL_SMOKE: '1',
      CHROMUX_E2E: e2ePath,
      CHROMUX_E2E_OUT: e2eOutPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const socketPath = captureControlSocketPath(chromuxHome);
  const caller = { clientId: 'test:main-integration', displayName: 'Main integration test', pid: process.pid };
  const client = new CaptureControlClient({ chromuxHome, caller, timeoutMs: 10_000 });
  try {
    await waitFor(() => fs.existsSync(socketPath));
    const listed = await client.request('targets.list');
    assert.equal(listed.supported, true);
    const windowTarget = listed.targets.find((target) => target.kind === 'window');
    assert(windowTarget?.supportsScreenshot && windowTarget?.supportsRecording);
    assert(!JSON.stringify(listed).includes('file://'), 'target listing must not expose a page URL');

    const screenshot = await client.request('capture.screenshot', { targetId: windowTarget.targetId });
    assert.equal(screenshot.ok, true);
    assert(screenshot.resources.some((resource) => resource.name === 'screenshot.png'));

    const first = await client.request('record.start', { targetId: windowTarget.targetId });
    assert.equal(first.audio, 'available');
    const firstStopped = await client.request('record.stop', { recordingId: first.recordingId });
    assert.equal(firstStopped.metadata.stopReason, 'requester');
    assert(firstStopped.resources.some((resource) => resource.name === 'recording.webm'));
    assert(firstStopped.resources.some((resource) => resource.name === 'contact-sheet.png'));
    assert.equal(
      (await client.request('record.stop', { recordingId: first.recordingId })).artifactId,
      firstStopped.artifactId,
    );

    const second = await client.request('record.start', { targetId: windowTarget.targetId });
    assert(second.recordingId);
    client.close();

    await waitFor(() => fs.existsSync(e2eOutPath), 20_000);
    const e2e = fs.readFileSync(e2eOutPath, 'utf8');
    assert(e2e.includes('"ok":true'), e2e);
    assert(e2e.includes('requester-disconnect'), e2e);

    const captureRoot = path.join(chromuxHome, 'captures');
    const manifests = fs.readdirSync(captureRoot)
      .map((entry) => path.join(captureRoot, entry, 'manifest.json'))
      .filter((file) => fs.existsSync(file))
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
    assert.equal(manifests.filter((manifest) => manifest.kind === 'window-screenshot').length, 1);
    const recordings = manifests.filter((manifest) => manifest.kind === 'recording');
    assert.equal(recordings.length, 2);
    assert(recordings.some((manifest) => manifest.metadata.stopReason === 'requester-disconnect'));
  } catch (error) {
    console.error(error.stack);
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    throw error;
  } finally {
    client.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('close', resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log('capture main integration tests: ok');
})().catch(() => {
  process.exitCode = 1;
});
