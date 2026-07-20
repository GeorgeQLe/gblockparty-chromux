'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-resume-retry-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'resume-retry-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestResumeRetry;
  if (!q) throw new Error('Missing resume retry test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  await wait(100);

  const resumeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const command = "codex resume 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'";

  q.clear();
  const quick = q.addSession({ name: 'docs-resumed', resumeId, command, launchedAt: Date.now() });
  q.exit(quick, 1);
  let warning = q.warning();
  expect(!warning.hidden, 'quick Codex resume exit should show retry footer');
  expect(warning.title === 'Codex resume exited quickly', 'unexpected footer title: ' + warning.title);
  expect(warning.detail.includes('docs-resumed'), 'footer should identify the session: ' + warning.detail);
  expect(warning.detail.includes(command), 'footer should include the exact retry command: ' + warning.detail);
  expect(warning.retryTitle === command, 'retry button title should expose exact command');
  expect(warning.buttons.join('|') === 'RETRY RESUME|DISMISS', 'footer should expose retry and dismiss buttons');

  q.clickRetry();
  expect(q.ptyInputs(quick) === command + '\\r', 'retry should write the command into the same session PTY');
  expect(q.warning().hidden, 'retry should hide the footer after sending input');

  const dismiss = q.addSession({ name: 'dismiss-me', resumeId, command, launchedAt: Date.now() });
  q.exit(dismiss, 1);
  expect(!q.warning().hidden, 'second quick resume exit should show footer');
  q.clickDismiss();
  expect(q.warning().hidden, 'dismiss should hide the footer');

  q.clear();
  const plain = q.addPlainSession({ name: 'plain-codex', agent: 'codex' });
  q.exit(plain, 1);
  expect(q.warning().hidden, 'non-resume Codex exit should not show retry footer');

  const late = q.addSession({
    name: 'late-resume',
    resumeId,
    command,
    launchedAt: Date.now() - q.startupWindowMs() - 1000,
  });
  q.exit(late, 1);
  expect(q.warning().hidden, 'resume exit after startup window should not show retry footer');

  q.clear();
  q.showRestoreWarning([], [{ name: 'legacy-tab', cwd: '/tmp/shared', agent: 'claude', resumeId }]);
  warning = q.warning();
  expect(!warning.hidden, 'legacy inferred restore should show startup warning');
  expect(warning.title === 'Some saved sessions used best-effort matches',
    'unexpected inferred warning title: ' + warning.title);
  expect(warning.detail.includes('legacy-tab') && warning.detail.includes('inferred distinct recent conversations'),
    'inferred warning should disclose the affected tab and matching behavior');

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

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 30000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('RESUME_RETRY_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('RESUME_RETRY_RENDERER_OK');
});
