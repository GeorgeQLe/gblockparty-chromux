#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-control-renderer-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'capture-control-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const api = window.chromuxTestCaptureControl;
  if (!api) throw new Error('Missing capture control test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const requester = {
    clientId: 'test:capture:renderer',
    displayName: 'Renderer capture test',
    sessionId: 'test-session',
    pid: 4312,
  };
  const target = { targetId: 'chromux-window:1', kind: 'window', label: 'Chromux window' };

  const allowed = api.requestApproval({ requester, target, captureType: 'screenshot' });
  await wait(10);
  expect(api.approval()?.visible, 'approval dialog should be visible');
  expect(api.approval().requester.includes('Renderer capture test'), 'approval should identify requester');
  api.allow();
  expect((await allowed).approved === true, 'allow once should approve only the pending request');
  expect(api.approval() === null, 'approval should close after allow');

  const denied = api.requestApproval({ requester, target, captureType: 'recording' });
  await wait(10);
  api.deny('test denial');
  const denial = await denied;
  expect(denial.approved === false && denial.reason === 'test denial', 'deny should return the visible reason');

  const timedOut = await api.requestApproval({ requester, target, captureType: 'screenshot' }, 20);
  expect(
    timedOut.approved === false && timedOut.reason.includes('timed out'),
    'unanswered approval should time out as denied',
  );

  class FakeTrack {
    constructor(kind, { muted = false } = {}) {
      this.kind = kind;
      this.muted = muted;
      this.readyState = 'live';
      this.listeners = new Map();
    }
    getSettings() { return this.kind === 'video' ? { width: 1280, height: 720, frameRate: 15 } : {}; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    stop() { this.readyState = 'ended'; }
  }
  class FakeStream {
    constructor({ audio = true } = {}) {
      this.video = new FakeTrack('video');
      this.audio = audio ? new FakeTrack('audio') : null;
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
      this.emit('dataavailable', { data: new Blob(['mock-webm-chunk'], { type: this.mimeType }) });
      this.emit('stop');
    }
  }
  const createVideo = () => ({
    muted: false,
    playsInline: false,
    srcObject: null,
    videoWidth: 1280,
    videoHeight: 720,
    play: async () => {},
    pause: () => {},
  });

  api.setMediaMocks({
    mediaDevices: {
      getDisplayMedia: async () => {
        const error = new Error('loopback unavailable');
        error.name = 'NotAllowedError';
        throw error;
      },
    },
    MediaRecorder: FakeRecorder,
    createVideo,
  });
  let retryError = null;
  try {
    await api.start({
      recordingId: 'recording-audio-retry',
      requester,
      deadlineMs: 1000,
      audio: true,
    });
  } catch (error) {
    retryError = error;
  }
  expect(retryError?.code === 'CAPTURE_AUDIO_RETRY', 'audio failure should request video-only retry');

  const chunks = [];
  const completions = [];
  api.setMediaMocks({
    mediaDevices: { getDisplayMedia: async () => new FakeStream({ audio: true }) },
    MediaRecorder: FakeRecorder,
    createVideo,
    onChunk: (message) => chunks.push(message),
    onComplete: (message) => completions.push(message),
  });
  const started = await api.start({
    recordingId: 'recording-audio',
    requester,
    deadlineMs: 1000,
    audio: true,
  });
  expect(started.audio === 'available', 'live loopback track should be reported available');
  expect(started.dimensions.width === 1280 && started.dimensions.height === 720, 'dimensions should be reported');
  expect(api.recording()?.visible, 'recording state should be visible');
  expect(api.hud().requester.includes('Renderer capture test'), 'HUD should keep requester visible');
  expect(api.hud().audio === 'AUDIO: SYSTEM', 'HUD should expose system audio state');
  const stopped = await api.stop('user');
  expect(stopped.stopReason === 'user', 'user stop reason should persist');
  expect(chunks.length === 1 && chunks[0].chunkBase64, 'recording chunks should stream incrementally');
  expect(completions.length === 1, 'recording completion should be sent once');
  expect(completions[0].contactSheetBase64, 'recording should include a PNG contact sheet');
  expect(!api.hud().visible, 'HUD should hide after persistence completes');
  expect((await api.stop('user')).alreadyStopped === true, 'renderer stop should be idempotent');

  api.setMediaMocks({
    mediaDevices: { getDisplayMedia: async () => new FakeStream({ audio: false }) },
    MediaRecorder: FakeRecorder,
    createVideo,
    onChunk: (message) => chunks.push(message),
    onComplete: (message) => completions.push(message),
  });
  const fallback = await api.start({
    recordingId: 'recording-video-only',
    requester,
    deadlineMs: 30,
    audio: false,
  });
  expect(fallback.audio === 'unavailable', 'video-only fallback should report audio unavailable');
  expect(api.hud().audio === 'AUDIO: UNAVAILABLE', 'HUD should show video-only fallback');
  await wait(100);
  expect(api.recording() === null, 'deadline should automatically stop the recording');
  expect(completions.at(-1).metadata.stopReason === 'deadline', 'automatic stop reason should persist');

  return JSON.stringify({
    ok: true,
    chunks: chunks.length,
    completions: completions.length,
    codec: started.codec,
  });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: homeDir,
    PATH: '/usr/bin:/bin',
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: e2eOutPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const timeout = setTimeout(() => child.kill('SIGTERM'), 30_000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('CAPTURE_CONTROL_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', output || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('CAPTURE_CONTROL_RENDERER_OK');
});
