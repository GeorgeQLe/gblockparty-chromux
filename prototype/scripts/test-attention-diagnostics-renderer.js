'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-attention-diagnostics-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'diagnostics-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const d = window.chromuxTestDiagnostics;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 20)); d.flushRender(); };
  await settle();
  expect(d && d.visible(), 'developer diagnostics should be visible with --dev-mode');

  const first = d.addSession({ name: 'codex-working', agent: 'codex' });
  const second = d.addSession({ name: 'native-complete', agent: 'claude' });
  d.select(first);
  d.focus(second);
  expect(d.selected() === first, 'inspected session must remain independent of focus');
  d.emit(first, 'turn-start');
  expect(d.groupText().includes('working'), 'tracked Codex working state should render');
  d.emit(first, 'turn-end');
  expect(d.groupText().includes('COMPLETED'), 'background completion should agree with attention projection');
  expect(d.mismatches() === 0, 'projected completion should agree with rendered queue and tab');
  d.selectRail('threads');
  expect(d.groupText().includes('RAIL MODETHREADS') && !d.groupText().includes('NOT MOUNTED · THREADS'),
    'Threads diagnostics should compare the unified mounted attention state');
  expect(d.mismatches() === 0, 'unified Threads rows should agree with the attention projection');
  d.selectRail('git');
  expect(d.groupText().includes('RAIL MODEGIT') && d.groupText().includes('NOT MOUNTED · GIT'),
    'Git diagnostics should report the active rail and unmounted attentive Threads DOM');
  expect(d.mismatches() === 0, 'unmounted attentive rows must not create false mismatches in Git');
  d.selectRail('threads');
  d.injectAttentionKind(first, 'WRONG');
  expect(d.mismatches() > 0, 'a real mounted Threads attention mismatch should be highlighted');
  d.emit(first, 'turn-end');
  expect(d.mismatches() === 0, 'normal Threads render should clear the deliberate row mismatch');

  d.focus(first);
  expect(d.selected() === first, 'focus should not change explicit inspection');
  expect(d.groupText().includes('SUPPRESS active-session'), 'active attention should show suppression');
  d.queue(first, 'http://localhost:3100/');
  expect(d.groupText().includes('BROWSER QUEUE1'), 'queue count should update');
  expect(d.groupText().includes('localhost:3100'), 'queue head should update');

  d.focus(second);
  d.select(first);
  for (let index = 0; index < 25; index += 1) d.emit(first, index % 2 ? 'turn-start' : 'turn-end', 'SECRET RAW DETAIL');
  expect(d.events().length === 20, 'event trail should be bounded to latest 20');
  expect(d.events()[0].includes('turn-signal'), 'events should be newest-first and typed');
  expect(!d.events().join(' ').includes('SECRET RAW DETAIL'), 'event details must not be rendered');

  d.injectTabIndicator(first, 'dead');
  expect(d.mismatches() > 0, 'deliberate DOM mismatch should be highlighted');
  d.emit(first, 'turn-end');
  expect(d.mismatches() === 0, 'normal tab render should clear injected mismatch');

  d.exit(first, 7);
  expect(d.selectorLabels().some((label) => label.includes('(exited)')), 'exited sessions should remain selectable');
  d.close(first);
  expect(d.selected() === second, 'closing inspected session should fall back to active session');

  d.enableRestartMock();
  d.toggleDevMode(false);
  await settle();
  expect(!document.querySelector('#modal-lifecycle').classList.contains('hidden'), 'open sessions should require restart confirmation');
  document.querySelector('#lifecycle-cancel').click();
  await settle();
  expect(d.restartCalls().length === 0, 'cancellation must not request restart');
  d.toggleDevMode(false);
  await settle();
  document.querySelector('#lifecycle-confirm').click();
  await settle();
  expect(d.restartCalls().length === 1 && d.restartCalls()[0].enabled === false, 'confirmation should request disabled restart');
  expect(d.restartCalls()[0].sessions.length === 1, 'restart request should include restore snapshot sessions');
  d.close(second);
  d.toggleDevMode(false);
  await settle();
  expect(d.restartCalls().length === 2 && d.restartCalls()[1].sessions.length === 0, 'empty workspace should use no-session fast path');
  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke', '--dev-mode'], {
  cwd: appDir,
  env: { ...process.env, HOME: homeDir, PATH: '/usr/bin:/bin', CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: e2eOutPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('ATTENTION_DIAGNOSTICS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '', 'e2e:', output || 'missing');
    console.error('stdout:', stdout.trim()); console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('ATTENTION_DIAGNOSTICS_RENDERER_OK');
});
