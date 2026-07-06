'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-update-queue-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'update-queue-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestUpdateQueue;
  if (!q) throw new Error('Missing update queue test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  await new Promise((resolve) => setTimeout(resolve, 100));
  q.setStatus({ updateAvailable: true });
  q.queue();
  expect(q.phase() === 'ready', 'zero sessions should queue as ready, got ' + q.phase());
  expect(q.attentionKinds()[0] === 'UPDATE READY', 'ready update should be first attention item');
  expect(q.installButtonText() === 'OPEN RELEASE', 'ready settings action should open release');

  const liveId = await q.addSession({ name: 'live-unknown' });
  q.queue();
  expect(q.phase() === 'waiting', 'live unknown session should block, got ' + q.phase());
  expect(q.blockers().join(',') === 'live-unknown', 'expected live-unknown blocker');
  expect(q.attentionKinds()[0] === 'UPDATE WAITING', 'waiting update should be first attention item');
  expect(q.installButtonText() === 'FOCUS BLOCKER', 'waiting settings action should focus blocker');

  q.setSession(liveId, { completed: true });
  expect(q.phase() === 'ready', 'completed session should make queued update ready');
  q.markUserInput(liveId);
  expect(q.phase() === 'waiting', 'typing after completed should make live session block updates again');
  expect(q.blockers().join(',') === 'live-unknown', 'typed completed session should return to live-unknown blocker');
  q.setSession(liveId, { completed: true });
  expect(q.phase() === 'ready', 'completed session should make queued update ready again');

  const inputId = await q.addSession({ name: 'input-needed', inputNeeded: true });
  expect(q.phase() === 'ready', 'input-needed session should stay safe');

  const exitedId = await q.addSession({ name: 'exited', alive: false });
  expect(q.phase() === 'ready', 'exited session should stay safe');

  q.setSession(inputId, { inputNeeded: false });
  expect(q.phase() === 'waiting', 'clearing input-needed should block again');
  q.setSession(inputId, { inputNeeded: true });
  q.setSession(exitedId, { alive: true, completed: true });
  expect(q.phase() === 'ready', 'completed formerly-exited session should be safe');

  q.setInstallResult({ ok: false, message: 'fixture failure', output: 'fixture log' });
  await document.querySelector('#settings-install-update').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(q.phase() === 'failed', 'failed install should leave failed queue state, got ' + q.phase());
  expect(q.attentionKinds()[0] === 'UPDATE FAILED', 'failed update should stay visible in attention queue');
  expect(q.installButtonText() === 'RETRY OPEN', 'failed settings action should retry');

  return JSON.stringify({
    ok: true,
    phase: q.phase(),
    attention: q.attentionKinds().slice(0, 3),
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

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 30000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('UPDATE_QUEUE_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('UPDATE_QUEUE_RENDERER_OK');
});
