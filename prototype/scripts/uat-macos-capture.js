#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { CaptureControlClient } = require('../capture/control');
const { captureControlSocketPath } = require('../capture/paths');

function waitFor(predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error('macOS capture UAT timed out'));
      setTimeout(poll, 25);
    };
    poll();
  });
}

(async () => {
  if (process.platform !== 'darwin') throw new Error('Real capture UAT is macOS-only');
  const appDir = path.resolve(__dirname, '..');
  const executable = process.argv[2] || path.join(
    appDir,
    'dist',
    'Chromux-darwin-arm64',
    'Chromux.app',
    'Contents',
    'MacOS',
    'Chromux',
  );
  if (!fs.existsSync(executable)) throw new Error(`Packaged Chromux not found: ${executable}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-real-capture-uat-'));
  const homeDir = path.join(tmpDir, 'home');
  const chromuxHome = path.join(tmpDir, 'chromux-home');
  const profile = path.join(tmpDir, 'profile');
  const e2ePath = path.join(tmpDir, 'capture-real-uat-e2e.js');
  const e2eOutPath = path.join(tmpDir, 'e2e.out');
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(e2ePath, `
(async () => {
  const api = window.chromuxTestCaptureControl;
  if (!api) throw new Error('Missing capture control test API');
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const completions = [];
  api.setMediaMocks({ onComplete: (message) => completions.push(message) });
  let approvals = 0;
  const deadline = Date.now() + 110000;
  while (Date.now() < deadline) {
    if (api.approval()?.visible) {
      api.allow();
      approvals += 1;
    }
    if (approvals >= 2 && completions.length >= 1) {
      return JSON.stringify({
        ok: true,
        approvals,
        audio: completions[0].metadata.audio,
        dimensions: completions[0].metadata.dimensions,
      });
    }
    await wait(25);
  }
  throw new Error('real capture renderer UAT timed out');
})()
`);

  const child = spawn(executable, [
    '--smoke',
    '--dev-mode',
    `--user-data-dir=${profile}`,
  ], {
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

  const caller = {
    clientId: 'uat:packaged-capture',
    displayName: 'Packaged capture UAT',
    pid: process.pid,
  };
  const client = new CaptureControlClient({ chromuxHome, caller, timeoutMs: 90_000 });
  try {
    await waitFor(() => fs.existsSync(captureControlSocketPath(chromuxHome)));
    const targets = await client.request('targets.list');
    const windowTarget = targets.targets.find((target) => target.kind === 'window');
    assert(windowTarget?.supportsScreenshot && windowTarget?.supportsRecording);

    const screenshot = await client.request('capture.screenshot', { targetId: windowTarget.targetId });
    assert(screenshot.resources.some((resource) => resource.name === 'screenshot.png'));

    const started = await client.request('record.start', { targetId: windowTarget.targetId });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const stopped = await client.request('record.stop', { recordingId: started.recordingId });
    assert(stopped.resources.some((resource) => resource.name === 'recording.webm'));
    assert(stopped.resources.some((resource) => resource.name === 'contact-sheet.png'));

    await waitFor(() => fs.existsSync(e2eOutPath));
    const e2e = JSON.parse(fs.readFileSync(e2eOutPath, 'utf8'));
    assert.equal(e2e.ok, true);
    assert.equal(e2e.audio, stopped.metadata.audio);

    const artifactDirectories = fs.readdirSync(path.join(chromuxHome, 'captures'))
      .map((entry) => path.join(chromuxHome, 'captures', entry));
    const manifests = [];
    for (const directory of artifactDirectories) {
      assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
      for (const file of fs.readdirSync(directory)) {
        assert.equal(fs.statSync(path.join(directory, file)).mode & 0o777, 0o600);
      }
      manifests.push(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')));
    }
    const screenshotManifest = manifests.find((manifest) => manifest.artifactId === screenshot.artifactId);
    const recordingManifest = manifests.find((manifest) => manifest.artifactId === stopped.artifactId);
    assert(screenshotManifest.files.find((file) => file.name === 'screenshot.png').bytes > 0);
    assert(recordingManifest.files.find((file) => file.name === 'recording.webm').bytes > 0);
    assert(recordingManifest.files.find((file) => file.name === 'contact-sheet.png').bytes > 0);
    console.log(`CAPTURE_REAL_UAT=${JSON.stringify({
      ok: true,
      audio: stopped.metadata.audio,
      dimensions: stopped.metadata.dimensions,
      durationMs: stopped.metadata.durationMs,
      screenshotArtifactId: screenshot.artifactId,
      recordingArtifactId: stopped.artifactId,
    })}`);
  } catch (error) {
    console.error(error.stack);
    console.error('app stdout:', stdout.trim());
    console.error('app stderr:', stderr.trim());
    throw error;
  } finally {
    client.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('close', resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch(() => {
  process.exitCode = 1;
});
