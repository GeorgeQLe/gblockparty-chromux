'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-codex-gate-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'codex-gate-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(path.join(homeDir, '.chromux'), { recursive: true });
fs.writeFileSync(path.join(homeDir, '.chromux', 'restore-sessions.json'), JSON.stringify({
  schemaVersion: 5,
  restoreId: 'mixed-provider-fixture',
  reason: 'app-close',
  savedAt: new Date().toISOString(),
  consumed: false,
  sessions: [
    { name: 'claude-immediate', cwd: homeDir, agent: 'claude' },
    { name: 'codex-held', cwd: homeDir, agent: 'codex' },
    { name: 'shell-immediate', cwd: homeDir, agent: '' },
  ],
}, null, 2));

fs.writeFileSync(e2ePath, `
(async () => {
  const gate = window.chromuxTestCodexGate;
  if (!gate) throw new Error('Missing Codex gate test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  await new Promise((resolve) => setTimeout(resolve, 500));

  const initialTabs = [...document.querySelectorAll('#tab-list .session-tab')].map((tab) => tab.textContent);
  expect(initialTabs.some((text) => text.includes('claude-immediate')), 'Claude restore should open during Codex preflight');
  expect(initialTabs.some((text) => text.includes('shell-immediate')), 'shell restore should open during Codex preflight');
  expect(initialTabs.some((text) => text.includes('codex-held')), 'Codex restore should fail open after exhausted preflight');
  expect(gate.warning().title.includes('Codex update check failed'),
    'mixed restore should report startup fail-open: ' + JSON.stringify(gate.warning()));
  expect(gate.warning().buttons.join(',') === 'RETRY CHECK,DISMISS',
    'startup fail-open should expose only non-blocking recovery actions');

  gate.reset();
  gate.useFakeLauncher();
  const immediate = [];
  await gate.launch('claude', 'claude-now', immediate);
  await gate.launch('', 'shell-now', immediate);
  const first = gate.launch('codex', 'codex-one', immediate);
  const second = gate.launch('codex', 'codex-two', immediate);
  expect(immediate.join(',') === 'claude-now,shell-now', 'non-Codex launches should not wait');
  expect(gate.waiting().join(',') === 'codex-one,codex-two', 'Codex queue should preserve saved order');
  let warning = gate.warning();
  expect(warning.title.includes('Checking Codex'), 'queued sessions should remain in the checking state during service retries');
  expect(!warning.buttons.includes('RETRY CHECK'), 'intermediate retry failures must not expose the final failure action');

  await gate.setStatus({
    currentVersion: '1.2.3',
    latestVersion: '1.2.4',
    updateAvailable: true,
    installKind: 'homebrew',
    releaseUrl: 'https://github.com/openai/codex/releases/tag/rust-v1.2.4',
  });
  warning = gate.warning();
  expect(!warning.hidden, 'one workspace prompt should be visible');
  expect(warning.title.includes('2 sessions waiting'), 'prompt should aggregate waiting sessions: ' + warning.title);
  expect(warning.buttons.join(',') === 'RELEASE NOTES,UPDATE CODEX,RESUME ANYWAY',
    'update prompt actions mismatch: ' + warning.buttons.join(','));
  expect(gate.launched().length === 0, 'available update must keep Codex held');

  gate.failUpdate('fixture install failed');
  warning = gate.warning();
  expect(warning.buttons.includes('RETRY UPDATE') && warning.buttons.includes('RESUME ANYWAY'),
    'failed update should stay held with retry and bypass');
  await gate.resumeAnyway();
  await Promise.all([first, second]);
  expect(gate.launched().join(',') === 'codex-one,codex-two', 'bypass should release once in deterministic order');
  expect(gate.phase() === 'bypassed', 'bypass should apply for this app launch');

  gate.reset();
  gate.useFakeLauncher();
  const currentOne = gate.launch('codex', 'current-one', []);
  const currentTwo = gate.launch('codex', 'current-two', []);
  expect(gate.waiting().join(',') === 'current-one,current-two', 'retrying preflight should retain every queued Codex launch');
  await gate.setStatus({ currentVersion: '1.2.4', latestVersion: '1.2.4', updateAvailable: false });
  await Promise.all([currentOne, currentTwo]);
  expect(gate.launched().join(',') === 'current-one,current-two',
    'a successful retry cycle should release every queued Codex launch automatically in saved order');
  expect(gate.phase() === 'released', 'current status should release the gate');

  gate.reset();
  gate.useFakeLauncher();
  const updatedOne = gate.launch('codex', 'updated-one', []);
  const updatedTwo = gate.launch('codex', 'updated-two', []);
  await gate.setStatus({ currentVersion: '1.2.3', latestVersion: '1.2.4', updateAvailable: true });
  await gate.succeedUpdate({ currentVersion: '1.2.4', latestVersion: '1.2.4', updateAvailable: false });
  await Promise.all([updatedOne, updatedTwo]);
  expect(gate.launched().join(',') === 'updated-one,updated-two', 'verified update should release all sessions once');

  gate.reset();
  gate.useFakeLauncher();
  const offlineOne = gate.launch('codex', 'offline-one', []);
  const offlineComposer = gate.launchOptions({
    name: 'offline-composer',
    composerDraft: 'review before sending',
    initialStagedBrowserContexts: [{
      captureId: 'held-capture',
      payloadPath: '/tmp/held/payload.yaml',
      screenshotPath: '/tmp/held/screenshot.png',
      url: 'https://example.test/held',
      title: 'Held page',
      capturedAt: new Date().toISOString(),
      visibleTextTruncated: false,
    }],
    initialBrowserLayoutMode: 'browserChromux',
    initialFullBrowserComposerOpen: true,
  });
  await gate.setStatus({ error: 'offline fixture' });
  await Promise.all([offlineOne, offlineComposer]);
  warning = gate.warning();
  expect(gate.launched().join(',') === 'offline-one,offline-composer',
    'failed startup check should release every queued launch exactly once in saved order');
  expect(gate.phase() === 'bypassed', 'failed startup check should bypass the gate for the app run');
  expect(warning.title.includes('2 sessions released') && warning.detail.includes('offline fixture'),
    'fail-open warning should report the sanitized failure and released-session count');
  expect(warning.buttons.join(',') === 'RETRY CHECK,DISMISS',
    'fail-open warning should remain recoverable without RESUME ANYWAY');

  const backgroundRetry = gate.retryWith({
    currentVersion: '1.2.3',
    latestVersion: '1.2.4',
    updateAvailable: true,
    releaseUrl: 'https://github.com/openai/codex/releases/tag/rust-v1.2.4',
  }, 50);
  const concurrent = gate.launch('codex', 'concurrent-after-fail-open', []);
  const concurrentSession = await concurrent;
  expect(gate.waiting().length === 0 && gate.phase() === 'bypassed',
    'background retry must not re-gate a concurrent Codex launch');
  expect(concurrentSession?.name === 'concurrent-after-fail-open',
    'concurrent Codex launch should start normally during background retry');
  await backgroundRetry;
  warning = gate.warning();
  expect(gate.launched().join(',') === 'offline-one,offline-composer',
    'background retry must not relaunch or duplicate released sessions: ' + gate.launched().join(','));
  expect(warning.title.includes('restart later')
    && warning.detail.includes('Installed 1.2.3; latest 1.2.4')
    && warning.buttons.includes('RELEASE NOTES')
    && warning.buttons.includes('RETRY CHECK')
    && warning.buttons.includes('DISMISS')
    && !warning.buttons.includes('UPDATE CODEX'),
  'live-session retry should show release information but defer installation');

  await gate.retryWith({ currentVersion: '1.2.4', latestVersion: '1.2.4', updateAvailable: false });
  warning = gate.warning();
  expect(!warning.title.includes('Codex update'),
    'successful-current background retry should clear the fail-open warning: ' + JSON.stringify(warning));
  expect(gate.phase() === 'bypassed', 'successful retry must leave the app-run bypass active');

  const afterCurrent = gate.launch('codex', 'after-current-retry', []);
  const afterCurrentSession = await afterCurrent;
  expect(afterCurrentSession?.name === 'after-current-retry' && gate.waiting().length === 0,
    'new Codex launches must stay ungated after retry success');

  await gate.retryWith({ error: 'offline again' });
  warning = gate.warning();
  expect(warning.buttons.includes('RETRY CHECK') && warning.buttons.includes('DISMISS'),
    'repeated background failure should remain recoverable');

  gate.reset();
  const adoption = window.chromuxTestShellAdoption;
  const commandApi = window.chromuxTestAgentCommand;
  const shellId = adoption.addShellSession({ name: 'typed-held' });
  adoption.type(shellId, 'codex');
  const heldRewrite = adoption.type(shellId, '\\r');
  expect(heldRewrite && heldRewrite.held === true, 'typed Codex launch should be held by preflight');
  expect(adoption.ptyInputs(shellId) === 'codex\\x15', 'held shell line should be cleared before release');
  expect(gate.waiting().join(',') === 'typed-held', 'typed launch should join the global queue');
  await gate.resumeAnyway();
  expect(adoption.ptyInputs(shellId) === 'codex\\x15' + commandApi.build('codex') + '\\r',
    'held typed launch should replay the managed Codex command after release');

  return JSON.stringify({ ok: true });
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
    CHROMUX_E2E_CODEX_UPDATE_ERROR: '1',
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
  const result = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !result.includes('"ok":true')) {
    console.error('CODEX_UPDATE_GATE_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', result || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('CODEX_UPDATE_GATE_RENDERER_OK');
});
