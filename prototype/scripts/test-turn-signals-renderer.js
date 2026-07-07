// Renderer E2E: deterministic turn signals. Replaces the deleted
// test-attention-signals-renderer.js — regex attention heuristics no longer
// exist; the only agent-attention source is the Chromux OSC wire protocol.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-turn-signals-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'turn-signals-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const sig = window.chromuxTestSignals;
  if (!sig) throw new Error('Missing turn-signals test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const osc = (event, id) => '\\x1b]777;chromux;v1;' + event + ';' + id + '\\x07';
  const itemsFor = (kind, name) => sig.attentionItems()
    .filter((i) => i.kind === kind && (!name || i.name === name));

  await wait(100);

  // Focus holder: keeps the sessions under test in the background, since the
  // focused session is display-excluded from the attention queue.
  const holder = sig.addFakeSession({ name: 'holder', agent: '' });

  // 1 — regex heuristics are dead: plain "complete" prose does nothing…
  const a = sig.addFakeSession({ name: 'claude-a', agent: 'claude' });
  sig.feedPtyChunk(a, 'Implementation complete. Ready for review.\\r\\n');
  expect(sig.turnState(a).state === 'unknown', 'prose completion text must not change turn state');
  expect(itemsFor('COMPLETED').length === 0, 'prose completion text must not create attention');
  // …but the same chunk with an embedded valid OSC turn-end does.
  sig.feedPtyChunk(a, 'Implementation complete. ' + osc('turn-end', a) + 'Ready.\\r\\n');
  expect(sig.turnState(a).state === 'completed', 'OSC turn-end should complete the turn');
  expect(sig.turnState(a).instrumented === true, 'OSC signal marks the session instrumented');
  expect(itemsFor('COMPLETED', 'claude-a').length === 1, 'completed background session appears in queue');
  expect(!sig.written(a).includes('777;chromux'), 'OSC bytes must be stripped from terminal output');

  // 2 — one OSC split across two PTY chunks → exactly one needsInput.
  const b = sig.addFakeSession({ name: 'claude-b', agent: 'claude' });
  const seq = osc('input-needed', b);
  sig.feedPtyChunk(b, 'approval? ' + seq.slice(0, 9));
  expect(sig.turnState(b).state === 'unknown', 'partial OSC must not fire early');
  sig.feedPtyChunk(b, seq.slice(9) + 'tail');
  expect(sig.turnState(b).state === 'needsInput', 'split OSC completes into needsInput');
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1, 'exactly one INPUT NEEDED item');
  const bSignals = sig.events().filter((e) => e.type === 'turn-signal' && e.sessionId === b);
  expect(bSignals.length === 1, 'split OSC must produce exactly one turn-signal event');
  expect(sig.written(b) === 'approval? tail', 'clean text around split OSC survives, got ' + JSON.stringify(sig.written(b)));

  // 3 — typing answers in-terminal; stale text cannot resurrect COMPLETED.
  sig.typeInput(a, 'y');
  expect(sig.turnState(a).state === 'working', 'user input after completed → working');
  expect(itemsFor('COMPLETED', 'claude-a').length === 0, 'COMPLETED item gone after typing');
  sig.feedPtyChunk(a, 'done! all set.\\r\\n');
  expect(sig.turnState(a).state === 'working', 'stale phrases must not resurrect completion');
  expect(itemsFor('COMPLETED', 'claude-a').length === 0, 'no resurrection in the queue either');

  // 4 — focus hides, blur re-shows, DISMISS acknowledges without deleting.
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1, 'background needsInput visible');
  sig.focus(b);
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 0, 'focused session excluded from queue');
  expect(sig.turnState(b).state === 'needsInput', 'focus must not touch turn state');
  sig.focus(holder);
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1, 'item reappears on blur');
  sig.dismissItem('INPUT NEEDED', 'claude-b');
  expect(sig.turnState(b).acknowledged === true, 'DISMISS sets acknowledged');
  expect(sig.turnState(b).state === 'needsInput', 'DISMISS never deletes state');
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 0, 'acknowledged item hidden');

  // 5 — bare shell fed prompt-glyph/approval text: never agent attention.
  const shell = sig.addFakeSession({ name: 'shell', agent: '' });
  sig.feedPtyChunk(shell, '$ sudo make install\\r\\nContinue? y/n\\r\\n\\u276f ');
  await wait(850);
  sig.flushRender();
  expect(sig.turnState(shell).state === 'unknown', 'shell text/prompt glyph must not signal');
  expect(itemsFor('INPUT NEEDED', 'shell').length === 0, 'no agent attention for shell session');

  // 6 — wrong-session-id OSC → signal-rejected, no state change.
  const beforeB = JSON.stringify(sig.turnState(b));
  sig.feedPtyChunk(b, osc('turn-end', 'someone-else'));
  expect(JSON.stringify(sig.turnState(b)) === beforeB, 'foreign-id signal must not mutate state');
  const rejected = sig.events().filter((e) => e.type === 'signal-rejected');
  expect(rejected.length === 1 && rejected[0].claimedSessionId === 'someone-else',
    'foreign-id signal recorded as signal-rejected');

  // exited sessions: dead dot only, never a queue item.
  sig.exit(shell, 1);
  expect(sig.attentionItems().every((i) => i.kind !== 'EXITED'), 'no EXITED attention items');

  return JSON.stringify({ ok: true, items: sig.attentionItems() });
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
    console.error('TURN_SIGNALS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('TURN_SIGNALS_RENDERER_OK');
});
