'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-attention-signals-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'attention-signals-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestUpdateQueue;
  if (!q) throw new Error('Missing update queue test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  await wait(100);

  const typedId = await q.addSession({ name: 'typed-codex', agent: 'codex' });
  q.markUserInput(typedId);
  q.scanAttention(typedId, 'hello world\\r\\n❯ ');
  await wait(850);
  expect(!q.attentionState(typedId).inputNeeded, 'recent typing plus prompt glyph should not need input');

  const approvalId = await q.addSession({ name: 'approval-codex', agent: 'codex' });
  q.scanAttention(approvalId, 'Command requires approval. Continue? y/n\\r\\n');
  expect(q.attentionState(approvalId).inputNeeded, 'explicit approval prompt should need input');

  const idleId = await q.addSession({ name: 'idle-claude', agent: 'claude' });
  q.scanAttention(idleId, 'assistant finished thinking\\r\\n› ');
  expect(!q.attentionState(idleId).inputNeeded, 'prompt glyph should wait for idle');
  await wait(850);
  expect(q.attentionState(idleId).inputNeeded, 'idle agent prompt should need input');

  const completedId = await q.addSession({ name: 'completed-codex', agent: 'codex' });
  q.scanAttention(completedId, 'Implementation complete. Ready for review.\\r\\n');
  expect(q.attentionState(completedId).completed, 'completed phrase should create completed attention');
  expect(q.attentionKinds().includes('COMPLETED'), 'completed session should appear in attention queue');
  q.markUserInput(completedId);
  expect(!q.attentionState(completedId).completed, 'user input should clear completed attention');
  expect(!q.attentionKinds().includes('COMPLETED'), 'completed session should leave attention queue after user input');

  const shellId = await q.addSession({ name: 'shell', agent: '' });
  q.scanAttention(shellId, '$ echo ready\\r\\n❯ ');
  await wait(850);
  expect(!q.attentionState(shellId).inputNeeded, 'shell prompt glyph should not need input');

  return JSON.stringify({
    ok: true,
    attention: q.attentionKinds(),
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
    console.error('ATTENTION_SIGNALS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('ATTENTION_SIGNALS_RENDERER_OK');
});
