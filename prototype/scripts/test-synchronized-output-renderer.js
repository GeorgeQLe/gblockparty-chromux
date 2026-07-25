'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-synchronized-output-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'synchronized-output-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });
fs.writeFileSync(e2ePath, `
(async () => {
  const sync = window.chromuxTestSynchronizedOutput;
  if (!sync) throw new Error('Missing synchronized-output test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const begin = '\\x1b[?2026h';
  const end = '\\x1b[?2026l';
  const redraw = '\\x1b[2J\\x1b[H? for shortcuts\\r\\n› final prompt';

  // Real xterm: every split of both DEC 2026 markers must remain atomic.
  for (let beginSplit = 1; beginSplit < begin.length; beginSplit += 1) {
    for (let endSplit = 1; endSplit < end.length; endSplit += 1) {
      const id = sync.addSession({ realTerminal: true, name: 'split-' + beginSplit + '-' + endSplit });
      sync.feed(id, 'prefix\\r\\n' + begin.slice(0, beginSplit));
      expect(sync.trace(id).writes.length === 1, 'partial begin marker must not reach xterm');
      sync.feed(id, begin.slice(beginSplit) + redraw.slice(0, 9));
      expect(sync.trace(id).writes.length === 1, 'open frame must not write an intermediate repaint');
      sync.feed(id, redraw.slice(9) + end.slice(0, endSplit));
      expect(sync.trace(id).writes.length === 1, 'partial reset marker must keep the frame buffered');
      sync.feed(id, end.slice(endSplit) + '\\r\\nsuffix');
      await wait(20);
      const trace = sync.trace(id);
      expect(JSON.stringify(trace.writes) === JSON.stringify(['prefix\\r\\n', redraw, '\\r\\nsuffix']),
        'split markers must produce prefix, one redraw, and suffix writes: ' + JSON.stringify(trace.writes));
      expect(JSON.stringify(trace.detectorPayloads) === JSON.stringify(['prefix\\r\\n', redraw, '\\r\\nsuffix']),
        'preview detection must receive the completed redraw exactly once');
      expect(trace.recoveryPayloads.filter((payload) => payload === redraw).length === 1,
        'completion recovery must receive the completed redraw exactly once');
      expect(!trace.screen.includes('2026'), 'DEC 2026 markers must not be rendered');
      expect(trace.screen.includes('final prompt') && trace.screen.includes('suffix'),
        'real xterm must end on the completed Codex redraw');
      sync.dispose(id);
    }
  }

  // Repeated begin markers are idempotent and an unmatched reset is consumed.
  const repeated = sync.addSession({ name: 'repeated' });
  sync.feed(repeated, 'a' + begin + 'one' + begin + 'two' + end + 'b' + end + 'c');
  await wait(20);
  expect(JSON.stringify(sync.trace(repeated).writes) === JSON.stringify(['a', 'onetwo', 'b', 'c']),
    'repeated begin and unmatched reset handling must preserve ordinary payload order');
  sync.dispose(repeated);

  // A malformed frame is released after the one-second safety timeout.
  const timed = sync.addSession({ name: 'timed' });
  sync.feed(timed, begin + 'timeout payload');
  expect(sync.trace(timed).writes.length === 0, 'timeout fixture must begin buffered');
  await wait(1100);
  expect(JSON.stringify(sync.trace(timed).writes) === JSON.stringify(['timeout payload']),
    'timeout must release and reset a malformed frame');
  sync.feed(timed, 'after timeout');
  expect(sync.trace(timed).writes.at(-1) === 'after timeout', 'ordinary output must resume after timeout');
  sync.dispose(timed);

  const partial = sync.addSession({ name: 'partial-timeout' });
  sync.feed(partial, 'ordinary' + begin.slice(0, 5));
  expect(JSON.stringify(sync.trace(partial).writes) === JSON.stringify(['ordinary']),
    'a possible split marker should be held briefly');
  await wait(1100);
  expect(sync.trace(partial).writes.join('') === 'ordinary' + begin.slice(0, 5),
    'an incomplete marker must be restored as ordinary PTY bytes after timeout');
  sync.dispose(partial);

  // The 1 MiB cap releases a frame instead of allowing unbounded buffering.
  const capped = sync.addSession({ name: 'capped' });
  const cappedPayload = 'x'.repeat(1024 * 1024);
  sync.feed(capped, begin + cappedPayload);
  await wait(20);
  const cappedTrace = sync.trace(capped);
  expect(cappedTrace.writes.length === 1 && cappedTrace.writes[0].length === cappedPayload.length,
    'size cap must release the buffered payload once');
  expect(cappedTrace.syncBytes === 0 && cappedTrace.syncActive === false,
    'size cap must reset synchronized-output state');
  sync.dispose(capped);

  // Closing a session must cancel its timer and discard its hidden frame.
  const disposed = sync.addSession({ name: 'disposed' });
  sync.feed(disposed, begin + 'must never flush');
  expect(sync.pendingTimer(disposed), 'open frame should own a timeout');
  sync.dispose(disposed);
  await wait(1100);
  expect(!sync.hasSession(disposed), 'disposed session must stay removed after its former timeout');

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
const timeout = setTimeout(() => child.kill('SIGTERM'), 60000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  let report = null;
  try { report = JSON.parse(output); } catch { /* reported below */ }
  if (code !== 0 || signal || !report || report.ok !== true) {
    console.error('SYNCHRONIZED_OUTPUT_RENDERER_FAIL');
    console.error({ code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('SYNCHRONIZED_OUTPUT_RENDERER_OK');
});
