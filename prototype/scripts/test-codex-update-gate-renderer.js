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
  expect(!initialTabs.some((text) => text.includes('codex-held')), 'Codex restore should remain held');
  expect(gate.warning().title.includes('1 session waiting'), 'mixed restore should use one Codex workspace prompt');

  gate.reset();
  gate.useFakeLauncher();
  const immediate = [];
  await gate.launch('claude', 'claude-now', immediate);
  await gate.launch('', 'shell-now', immediate);
  const first = gate.launch('codex', 'codex-one', immediate);
  const second = gate.launch('codex', 'codex-two', immediate);
  expect(immediate.join(',') === 'claude-now,shell-now', 'non-Codex launches should not wait');
  expect(gate.waiting().join(',') === 'codex-one,codex-two', 'Codex queue should preserve saved order');

  await gate.setStatus({
    currentVersion: '1.2.3',
    latestVersion: '1.2.4',
    updateAvailable: true,
    installKind: 'homebrew',
    releaseUrl: 'https://github.com/openai/codex/releases/tag/rust-v1.2.4',
  });
  let warning = gate.warning();
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
  await gate.setStatus({ currentVersion: '1.2.4', latestVersion: '1.2.4', updateAvailable: false });
  await currentOne;
  expect(gate.launched().join(',') === 'current-one', 'current Codex should release automatically');
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
  gate.launch('codex', 'offline-one', []);
  await gate.setStatus({ error: 'offline fixture' });
  warning = gate.warning();
  expect(warning.buttons.includes('RETRY CHECK') && warning.buttons.includes('RESUME ANYWAY'),
    'failed check should remain held with retry and bypass');
  expect(gate.snapshot().some((row) => row.name === 'offline-one' && row.agent === 'codex'),
    'held Codex launch should remain in quit/update snapshots');

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
