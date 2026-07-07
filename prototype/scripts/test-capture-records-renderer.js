// Renderer E2E: capture/delivery records. Overlapping deliveries resolve
// independently via the delivery index, failures attribute to the record's
// own session (never the focused one), the SENT gauge counts only delivered
// records, and records survive modal close.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-records-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'capture-records-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const sig = window.chromuxTestSignals;
  const caps = window.chromuxTestCaptures;
  if (!sig || !caps) throw new Error('Missing signals / captures test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const rec = (id) => caps.captureRecords().find((r) => r.id === id);
  const failItems = () => sig.attentionItems().filter((i) => i.kind === 'DELIVERY FAIL');

  await new Promise((resolve) => setTimeout(resolve, 100));

  const a = sig.addFakeSession({ name: 'cap-a', agent: 'claude' });
  const b = sig.addFakeSession({ name: 'cap-b', agent: 'claude' });
  const watcher = sig.addFakeSession({ name: 'watcher', agent: '' });
  sig.focus(watcher); // attribution asserts run while an unrelated session is focused

  // Two overlapping deliveries — the second capture must not clobber the first.
  const c1 = caps.beginFakeCapture({ sessionId: a, url: 'http://localhost:3000/x' });
  const d1 = caps.beginFakeDelivery(c1, { targetSessionId: b });
  const c2 = caps.beginFakeCapture({ sessionId: b, url: 'http://localhost:3000/y' });
  const d2 = caps.beginFakeDelivery(c2, { targetSessionId: null }); // one-off
  expect(rec(c1).status === 'delivering' && rec(c2).status === 'delivering', 'both deliveries in flight');
  expect(caps.captureModalId() === c2, 'modal shows the second capture');

  // Second delivery fails first; the first stays in flight — independent.
  caps.closeDelivery(d2, 1, 'boom');
  expect(rec(c2).status === 'failed' && rec(c2).error === 'boom', 'failed record captured exit + error');
  expect(rec(c1).status === 'delivering', 'overlapping delivery unaffected by the other closing');
  expect(caps.sentGauge() === '0', 'gauge counts only delivered');

  // One-off failure attributes to the capturing session, not the focused one.
  const fails = failItems();
  expect(fails.length === 1 && fails[0].name === 'cap-b',
    'one-off failure attributes to capturing session, got ' + JSON.stringify(fails));

  // First delivery lands.
  caps.closeDelivery(d1, 0);
  expect(rec(c1).status === 'delivered', 'first delivery resolves independently');
  expect(caps.sentGauge() === '1', 'gauge counts the delivered record');

  // A late/duplicate close for an already-resolved delivery is ignored.
  caps.closeDelivery(d1, 1, 'late duplicate');
  expect(rec(c1).status === 'delivered', 'duplicate close event must not flip a settled record');

  // Records survive modal close.
  caps.closeCaptureModal();
  expect(caps.captureRecords().length === 2, 'records survive modal close');
  expect(rec(c2).status === 'failed' && caps.sentGauge() === '1', 'statuses/gauge unchanged by modal close');
  expect(failItems().length === 1, 'failure attention survives modal close');

  // Browser pane chip derives from records matching the pane URL.
  caps.setCurrentUrl(a, 'http://localhost:3000/x');
  const chipA = caps.captureChip(a);
  expect(!chipA.hidden && chipA.text.includes('SENT'), 'chip shows for matching delivered capture');
  caps.setCurrentUrl(a, 'http://localhost:3000/other');
  expect(caps.captureChip(a).hidden, 'chip hides when the pane URL moves on');

  // DISMISS = acknowledged flag; the record itself persists.
  sig.dismissItem('DELIVERY FAIL', 'cap-b');
  expect(rec(c2).acknowledged === true && rec(c2).status === 'failed', 'dismiss acknowledges, never deletes');
  expect(failItems().length === 0, 'acknowledged failure leaves the queue');

  return JSON.stringify({ ok: true, records: caps.captureRecords().map((r) => r.status) });
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
    console.error('CAPTURE_RECORDS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('CAPTURE_RECORDS_RENDERER_OK');
});
