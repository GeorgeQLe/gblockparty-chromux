// Generated Codex notifier integration: run the installed shell hook inside a
// real pseudo-terminal so /dev/tty delivery, authenticated v2 envelopes,
// infrastructure fallback, ignored payloads, and shell-significant HOME paths
// are exercised together.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const pty = require('node-pty');
const signals = require('../renderer/signals');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-codex-notifier-'));
const homeDir = path.join(tmpDir, 'home it\'s "quoted" back\\slash;$(safe)');
const e2ePath = path.join(tmpDir, 'notifier-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
const sessionId = 'codex-notifier-session';
const token = 'codex-notifier-secret';

fs.mkdirSync(homeDir, { recursive: true });
fs.writeFileSync(e2ePath, `Promise.resolve(JSON.stringify({ ok: true }))`);

function generateHooks() {
  return new Promise((resolve, reject) => {
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
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const result = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
      if (code !== 0 || signal || !result.includes('"ok":true')) {
        reject(new Error(`hook generation failed: exit=${code} signal=${signal || ''} e2e=${result || 'missing'} stderr=${stderr.trim()}`));
      } else resolve();
    });
  });
}

function runNotifier(notifyPath, payload) {
  return new Promise((resolve, reject) => {
    let output = '';
    const terminal = pty.spawn('/bin/sh', [notifyPath, payload], {
      name: 'xterm-256color',
      cols: 120,
      rows: 24,
      cwd: appDir,
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        CHROMUX_STATE_DIR: path.join(homeDir, '.chromux'),
        CHROMUX_SESSION_ID: sessionId,
        CHROMUX_SIGNAL_TOKEN: token,
      },
    });
    terminal.onData((data) => { output += data; });
    terminal.onExit(({ exitCode, signal }) => {
      if (exitCode !== 0 || signal) reject(new Error(`notifier exited ${exitCode} signal ${signal}`));
      else resolve(output);
    });
  });
}

function parsedSignals(output) {
  const result = signals.extractChromuxSignals('', output);
  return result.signals;
}

function expectFallback(output, label) {
  const fallback = parsedSignals(output);
  if (fallback.length !== 1 || fallback[0].version !== 'v1'
    || fallback[0].event !== 'turn-end' || fallback[0].sessionId !== sessionId) {
    throw new Error(`${label} should emit one v1 fallback: ${JSON.stringify(fallback)}`);
  }
}

(async () => {
  await generateHooks();
  const notifyPath = path.join(homeDir, '.chromux', 'codex-notify.sh');
  const classifierPath = path.join(homeDir, '.chromux', 'signal-classifier.js');
  const official = JSON.stringify({
    type: 'agent-turn-complete',
    turn_id: 'official-turn',
    last_assistant_message: 'Implemented the requested fix.',
  });

  const validOutput = await runNotifier(notifyPath, official);
  const valid = parsedSignals(validOutput);
  if (valid.length !== 1 || valid[0].version !== 'v2') {
    throw new Error(`valid payload should emit one v2 signal: ${JSON.stringify(valid)}`);
  }
  const envelope = valid[0].envelope;
  if (envelope.sessionId !== sessionId || envelope.token !== token || envelope.agent !== 'codex'
    || envelope.event !== 'turn-completed' || envelope.turnId !== 'official-turn') {
    throw new Error(`valid payload emitted incorrect authenticated envelope: ${JSON.stringify(envelope)}`);
  }

  for (const name of fs.readdirSync(path.join(homeDir, '.chromux'))) {
    if (name.startsWith('signal-') && name.endsWith('.json')) {
      fs.unlinkSync(path.join(homeDir, '.chromux', name));
    }
  }
  const boundedOutput = await runNotifier(notifyPath, JSON.stringify({
    type: 'agent-turn-complete',
    turn_id: 'x'.repeat(1024),
    last_assistant_message: 'bounded payload test',
  }));
  const bounded = parsedSignals(boundedOutput);
  if (bounded.length !== 1 || bounded[0].version !== 'v2'
    || bounded[0].envelope.turnId.length !== 128 || bounded[0].envelope.message.length > 1024) {
    throw new Error(`official payload fields must remain bounded: ${JSON.stringify(bounded)}`);
  }

  for (const payload of [
    JSON.stringify({ type: 'unrelated-notification', message: 'hello' }),
    '{not-json',
    JSON.stringify({ type: 'agent-turn-complete' }) + 'x'.repeat(70 * 1024),
  ]) {
    const ignored = await runNotifier(notifyPath, payload);
    if (parsedSignals(ignored).length !== 0 || ignored.includes('777;chromux')) {
      throw new Error(`invalid or unrelated payload must emit nothing: ${JSON.stringify(ignored)}`);
    }
  }

  const unavailablePath = `${classifierPath}.unavailable`;
  fs.renameSync(classifierPath, unavailablePath);
  let fallbackOutput;
  try {
    fallbackOutput = await runNotifier(notifyPath, official);
  } finally {
    fs.renameSync(unavailablePath, classifierPath);
  }
  expectFallback(fallbackOutput, 'classifier failure');

  const classifierSource = fs.readFileSync(classifierPath, 'utf8');
  const brokenDeliverySource = classifierSource.replace("fs.writeFileSync('/dev/tty'", "fs.writeFileSync('/dev/chromux-missing-tty'");
  if (brokenDeliverySource === classifierSource) {
    throw new Error('could not install simulated classifier delivery failure');
  }
  fs.writeFileSync(classifierPath, brokenDeliverySource, { mode: 0o700 });
  let deliveryFallbackOutput;
  try {
    deliveryFallbackOutput = await runNotifier(notifyPath, official);
  } finally {
    fs.writeFileSync(classifierPath, classifierSource, { mode: 0o700 });
  }
  expectFallback(deliveryFallbackOutput, 'classifier /dev/tty delivery failure');

  console.log('CODEX_NOTIFIER_OK');
})().catch((err) => {
  console.error('CODEX_NOTIFIER_FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
