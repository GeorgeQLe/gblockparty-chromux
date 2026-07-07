'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-preview-queue-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'preview-queue-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestPreviews;
  if (!q) throw new Error('Missing preview queue test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  await new Promise((resolve) => setTimeout(resolve, 100));

  const split = q.scan('http://localhost:49151/uat-ahttp://localhost:49151/uat-b')
    .map((hit) => hit.url);
  expect(split.length === 0, 'concatenated localhost token should produce no hits: ' + JSON.stringify(split));

  const glyph = q.scan('open http://localhost:49151/uat-›Find').map((hit) => hit.url);
  expect(glyph.length === 0, 'prompt glyph contaminated URL should produce no hits: ' + JSON.stringify(glyph));

  const ansiJoin = q.scan('http://localhost:49151/uat-first\\x1b[2Kgpt-5.5').map((hit) => hit.url);
  expect(JSON.stringify(ansiJoin) === JSON.stringify(['http://localhost:49151/uat-first']),
    'ANSI/control stripping must not join URL and status text: ' + JSON.stringify(ansiJoin));

  const normalized = q.scan('http://0.0.0.0:5173/a http://[::1]:5173/b').map((hit) => hit.url);
  expect(normalized[0] === 'http://localhost:5173/a', '0.0.0.0 should normalize to localhost');
  expect(normalized[1] === 'http://localhost:5173/b', '[::1] should normalize to localhost');

  const id = await q.addSession({ name: 'preview-session', agent: 'codex' });
  q.feed(id, 'http://localhost:49151/uat-ahttp://localhost:49151/uat-b\\r\\n');
  expect(q.currentUrl(id) === null, 'malformed concatenated token should not open empty pane');
  expect(q.queueCount(id) === 0, 'malformed concatenated token should not queue');

  q.feed(id, 'http://localhost:49151/uat-›Find\\r\\n');
  expect(q.currentUrl(id) === null, 'glyph contaminated token should not open empty pane');
  expect(q.queueCount(id) === 0, 'glyph contaminated token should not queue');

  q.typeInput(id, 'open http://localhost:49151/typed-url\\r');
  q.feed(id, 'open http://localhost:49151/typed-url\\r\\n');
  expect(q.currentUrl(id) === null, 'typed prompt echo should not route a preview');
  expect(q.queueCount(id) === 0, 'typed prompt echo should not queue a preview');
  q.feed(id, 'agent later printed http://localhost:49151/typed-url\\r\\n');
  expect(q.currentUrl(id) === 'http://localhost:49151/typed-url',
    'same URL should route when later printed by agent output');

  q.feed(id, 'now http://localhost:49151/uat-a\\r\\n');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify(['http://localhost:49151/uat-a']),
    'valid URL printed as its own token should queue after current pane is occupied: ' + JSON.stringify(q.queueUrls(id)));

  q.feed(id, 'then http://localhost:49151/uat-b\\r\\n');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify([
    'http://localhost:49151/uat-a',
    'http://localhost:49151/uat-b',
  ]), 'valid distinct previews should queue in order: ' + JSON.stringify(q.queueUrls(id)));

  q.feed(id, 'again http://localhost:49151/uat-b\\r\\n');
  expect(q.queueCount(id) === 2, 'duplicate queued URL should be ignored');

  q.feed(id, 'next http://localhost:49151/uat-c\\r\\n');
  expect(q.queueCount(id) === 3, 'different queued URL should be added');
  q.openQueued(id, 'http://localhost:49151/uat-a');
  expect(q.currentUrl(id) === 'http://localhost:49151/uat-a', 'opened queued preview should become current URL');
  expect(q.queueCount(id) === 2, 'opening one queued preview should decrement queue count by one');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify([
    'http://localhost:49151/uat-b',
    'http://localhost:49151/uat-c',
  ]), 'opening one queued preview should leave the other queued URLs');

  return JSON.stringify({ ok: true, queue: q.queueUrls(id), current: q.currentUrl(id) });
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
    console.error('PREVIEW_QUEUE_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('PREVIEW_QUEUE_RENDERER_OK');
});
