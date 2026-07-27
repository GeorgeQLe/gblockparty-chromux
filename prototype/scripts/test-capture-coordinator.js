'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CaptureArtifactStore } = require('../capture/artifact-store');
const { CaptureCoordinator } = require('../capture/coordinator');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-coordinator-'));
let nowMs = Date.parse('2026-07-27T12:00:00.000Z');
let random = 0;
let stopRequest = null;
let startApproved = true;
const store = new CaptureArtifactStore({
  root,
  now: () => new Date(nowMs),
  randomBytes: () => Buffer.from(String(++random).padStart(12, '0'), 'hex'),
});
const targets = [
  {
    targetId: 'chromux-window:1',
    kind: 'window',
    label: 'Chromux window',
    supportsScreenshot: true,
    supportsRecording: true,
    privateUrl: 'file:///must-not-leak',
  },
  {
    targetId: 'browser:s1',
    kind: 'browser',
    label: 'Browser for Session 1',
    supportsScreenshot: true,
    supportsRecording: false,
    privateUrl: 'https://secret.example/',
  },
];
const callerA = { clientId: 'agent:a', displayName: 'Agent A', pid: 10 };
const callerB = { clientId: 'agent:b', displayName: 'Agent B', pid: 11 };
const coordinator = new CaptureCoordinator({
  platform: 'darwin',
  store,
  targetsProvider: async () => targets,
  screenshotProvider: async ({ target }) => ({
    approved: true,
    png: Buffer.from(`png:${target.targetId}`),
    payload: target.kind === 'browser' ? { page: { url: target.privateUrl } } : null,
    dimensions: { width: 800, height: 600 },
    result: target.kind === 'browser'
      ? { pageUrl: target.privateUrl, title: 'Approved title', visibleText: 'Approved text' }
      : {},
  }),
  recordApprover: async () => ({
    approved: startApproved,
    reason: startApproved ? null : 'denied for test',
  }),
  recordStarter: async () => ({
    approved: true,
    startedAt: new Date(nowMs).toISOString(),
    audio: 'unavailable',
    dimensions: { width: 1280, height: 720 },
    mimeType: 'video/webm;codecs=vp9',
    codec: 'vp9',
  }),
  recordStopper: async (request) => { stopRequest = request; },
  now: () => new Date(nowMs),
  randomBytes: () => Buffer.from(String(++random).padStart(12, '0'), 'hex'),
  recordingLimitMs: 60,
  stopWaitMs: 200,
});

(async () => {
  try {
    const listed = await coordinator.targets();
    assert.equal(listed.supported, true);
    assert.equal(listed.targets.length, 2);
    assert(!JSON.stringify(listed).includes('secret.example'), 'target listing must not expose page URLs');

    await assert.rejects(
      () => coordinator.screenshot({ targetId: 'browser:missing' }, callerA),
      /no longer available/,
    );
    await assert.rejects(
      () => coordinator.screenshot({ targetId: 'x'.repeat(257) }, callerA),
      /invalid capture target id/,
    );
    await assert.rejects(
      () => coordinator.stop({ recordingId: '../not-a-recording' }, callerA),
      /invalid recording id/,
    );
    const screenshot = await coordinator.screenshot({ targetId: 'browser:s1' }, callerA);
    assert.equal(screenshot.pageUrl, 'https://secret.example/');
    assert(screenshot.resources.some((resource) => resource.name === 'payload.yaml'));
    assert(screenshot.resources.some((resource) => resource.name === 'screenshot.png'));

    const directoriesBeforeDenial = fs.readdirSync(root).length;
    startApproved = false;
    await assert.rejects(
      () => coordinator.start({ targetId: 'chromux-window:1' }, callerA),
      /denied for test/,
    );
    assert.equal(
      fs.readdirSync(root).length,
      directoriesBeforeDenial,
      'denied recordings must not create an artifact',
    );
    startApproved = true;

    const started = await coordinator.start({ targetId: 'chromux-window:1' }, callerA);
    assert.equal(started.audio, 'unavailable');
    assert.equal(new Date(started.deadline).getTime() - new Date(started.startedAt).getTime(), 60);
    await assert.rejects(
      () => coordinator.start({ targetId: 'chromux-window:1' }, callerB),
      /recording already active/,
    );
    await assert.rejects(
      () => coordinator.stop({ recordingId: started.recordingId }, callerB),
      /only the requesting MCP client/,
    );
    coordinator.appendChunk(started.recordingId, Buffer.from('video'));
    const stopping = coordinator.stop({ recordingId: started.recordingId }, callerA);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopRequest.reason, 'requester');
    nowMs += 5000;
    const completed = coordinator.complete(started.recordingId, {
      contactSheet: Buffer.from('sheet'),
      metadata: {
        stoppedAt: new Date(nowMs).toISOString(),
        audio: 'unavailable',
        codec: 'vp9',
        mimeType: 'video/webm;codecs=vp9',
        dimensions: { width: 1280, height: 720 },
      },
    });
    assert.equal((await stopping).artifactId, completed.artifactId);
    assert.equal((await coordinator.stop({ recordingId: started.recordingId }, callerA)).artifactId, completed.artifactId);

    stopRequest = null;
    const disconnected = await coordinator.start({ targetId: 'chromux-window:1' }, callerA);
    const disconnectStop = coordinator.disconnect(callerA);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopRequest.reason, 'requester-disconnect');
    coordinator.appendChunk(disconnected.recordingId, Buffer.from('video-2'));
    coordinator.complete(disconnected.recordingId, { metadata: { stopReason: 'requester-disconnect' } });
    await disconnectStop;

    stopRequest = null;
    const automatic = await coordinator.start({ targetId: 'chromux-window:1' }, callerA);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(stopRequest.reason, 'deadline');
    coordinator.appendChunk(automatic.recordingId, Buffer.from('video-3'));
    const automaticResult = coordinator.complete(automatic.recordingId, {
      metadata: { stopReason: 'deadline' },
    });
    assert.equal(automaticResult.metadata.stopReason, 'deadline');

    let resolvePendingStart;
    let pendingStopReason = null;
    const pendingCoordinator = new CaptureCoordinator({
      platform: 'darwin',
      store,
      targetsProvider: async () => targets,
      recordApprover: async () => new Promise((resolve) => { resolvePendingStart = resolve; }),
      recordStarter: async () => ({ approved: true }),
      recordStopper: async ({ reason }) => {
        pendingStopReason = reason;
        resolvePendingStart({ approved: false, reason: 'cancelled while awaiting approval' });
      },
      now: () => new Date(nowMs),
      randomBytes: () => Buffer.from(String(++random).padStart(12, '0'), 'hex'),
    });
    const directoriesBeforePending = fs.readdirSync(root).length;
    const pendingStart = pendingCoordinator.start({ targetId: 'chromux-window:1' }, callerA);
    await new Promise((resolve) => setImmediate(resolve));
    const pendingDisconnect = pendingCoordinator.disconnect(callerA);
    await assert.rejects(() => pendingStart, /cancelled while awaiting approval/);
    assert.equal(await pendingDisconnect, null);
    assert.equal(pendingStopReason, 'requester-disconnect');
    assert.equal(
      fs.readdirSync(root).length,
      directoriesBeforePending,
      'cancelled pending approvals must not create artifacts',
    );

    let immediateCoordinator;
    immediateCoordinator = new CaptureCoordinator({
      platform: 'darwin',
      store,
      targetsProvider: async () => targets,
      recordStarter: async ({ recordingId }) => {
        immediateCoordinator.appendChunk(recordingId, Buffer.from('instant-video'));
        immediateCoordinator.complete(recordingId, {
          contactSheet: Buffer.from('instant-sheet'),
          metadata: { stopReason: 'user', durationMs: 1 },
        });
        return {
          approved: true,
          startedAt: new Date(nowMs).toISOString(),
          audio: 'unavailable',
        };
      },
      recordStopper: async () => {},
      now: () => new Date(nowMs),
      randomBytes: () => Buffer.from(String(++random).padStart(12, '0'), 'hex'),
    });
    const instant = await immediateCoordinator.start({ targetId: 'chromux-window:1' }, callerA);
    assert.equal(
      (await immediateCoordinator.stop({ recordingId: instant.recordingId }, callerA)).metadata.stopReason,
      'user',
      'a user stop racing the start response must remain completed and idempotent',
    );

    const unsupportedCoordinator = new CaptureCoordinator({
      platform: 'linux',
      store,
      targetsProvider: async () => targets,
    });
    const unsupported = await unsupportedCoordinator.screenshot({ targetId: 'browser:s1' }, callerA);
    assert.equal(unsupported.unsupportedPlatform, true);

    console.log('capture coordinator tests: ok');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
