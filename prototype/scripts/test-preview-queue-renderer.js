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
const htmlPath = path.join(tmpDir, 'typed-preview.html');
const htmlFileUrl = 'file://' + encodeURI(htmlPath).replace(/#/g, '%23');

fs.mkdirSync(homeDir, { recursive: true });
fs.writeFileSync(htmlPath, '<!doctype html><title>typed preview</title>');

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestPreviews;
  if (!q) throw new Error('Missing preview queue test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const htmlPath = ${JSON.stringify(htmlPath)};
  const htmlFileUrl = ${JSON.stringify(htmlFileUrl)};

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

  const falsePositiveLines = [
    "prototype/renderer/renderer.js:252: q.feed(id, 'http://localhost:5173/fixture\\\\r\\\\n');",
    "+ const url = 'http://localhost:5173/from-diff';",
    "- expect(q.currentUrl(id) === 'http://localhost:5173/old');",
    " const fixture = { url: 'http://localhost:5173/context' };",
    "| Expected | http://localhost:5173/uat-doc | Queue stays empty |",
    "- Release note documents http://localhost:5173/release-note as an example.",
    "const localFixture = { url: '" + htmlPath + "' };",
  ];
  for (const line of falsePositiveLines) {
    expect(q.routableScan(line).length === 0, 'false-positive context should not be routable: ' + line);
  }

  const falseId = await q.addSession({ name: 'false-positive-session', agent: 'codex' });
  for (const line of falsePositiveLines) q.feed(falseId, line + '\\r\\n');
  await wait(80);
  expect(q.currentUrl(falseId) === null, 'code/search/diff/docs localhost output should not open a pane');
  expect(q.queueCount(falseId) === 0, 'code/search/diff/docs localhost output should not queue previews');

  const realId = await q.addSession({ name: 'real-preview-session', agent: 'codex' });
  q.feed(realId, 'Local: http://localhost:5173/\\r\\n');
  expect(q.currentUrl(realId) === null, 'dev-server Local output must not auto-open the pane');
  expect(JSON.stringify(q.queueUrls(realId)) === JSON.stringify(['http://localhost:5173/']),
    'dev-server Local output should always queue: ' + JSON.stringify(q.queueUrls(realId)));
  q.feed(realId, 'ready on http://localhost:3000\\r\\n');
  expect(q.currentUrl(realId) === null, 'second preview must not auto-open either');
  expect(JSON.stringify(q.queueUrls(realId)) === JSON.stringify([
    'http://localhost:5173/',
    'http://localhost:3000',
  ]), 'every distinct detected preview should queue: ' + JSON.stringify(q.queueUrls(realId)));
  const realItem = q.queueItems(realId)[0];
  expect(realItem.reason === 'detected in agent output',
    'queued real preview should retain terminal reason: ' + JSON.stringify(realItem));
  q.openQueued(realId, 'http://localhost:5173/');
  expect(q.currentUrl(realId) === 'http://localhost:5173/',
    'queue OPEN should load the approved URL into the pane');
  expect(JSON.stringify(q.queueUrls(realId)) === JSON.stringify(['http://localhost:3000']),
    'queue OPEN should dequeue only the opened URL');

  const id = await q.addSession({ name: 'typed-preview-session', agent: 'codex' });
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
  expect(q.currentUrl(id) === null, 'agent-printed URL must still not auto-open');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify(['http://localhost:49151/typed-url']),
    'agent-printed URL should queue for approval: ' + JSON.stringify(q.queueUrls(id)));

  q.typeInput(id, 'open http://localhost:49151/chunked-');
  q.typeInput(id, 'typed\\r');
  q.feed(id, 'open http://localhost:49151/chunked-typed\\r\\n');
  expect(q.currentUrl(id) === null, 'chunked typed URL echo must not open the pane');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify(['http://localhost:49151/typed-url']),
    'chunked typed URL echo should not queue: ' + JSON.stringify(q.queueUrls(id)));
  q.feed(id, 'agent later printed http://localhost:49151/chunked-typed\\r\\n');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify([
    'http://localhost:49151/typed-url',
    'http://localhost:49151/chunked-typed',
  ]), 'later agent output of chunked typed URL should still queue');

  const fileId = await q.addSession({ name: 'file-preview-session', agent: 'codex' });
  q.typeInput(fileId, 'open ' + htmlPath + '\\r');
  q.feed(fileId, 'open ' + htmlPath + '\\r\\n');
  await wait(80);
  expect(q.currentUrl(fileId) === null, 'typed local .html path echo should not route');
  expect(q.queueCount(fileId) === 0, 'typed local .html path echo should not queue');
  q.feed(fileId, 'agent later printed ' + htmlPath + '\\r\\n');
  await wait(80);
  expect(q.currentUrl(fileId) === null, 'agent-printed local .html must not auto-open');
  expect(JSON.stringify(q.queueUrls(fileId)) === JSON.stringify([htmlFileUrl]),
    'agent-printed local .html should queue for approval: ' + JSON.stringify(q.queueUrls(fileId)));
  q.openQueued(fileId, htmlFileUrl);
  expect(q.currentUrl(fileId) === htmlFileUrl,
    'queue OPEN should load the approved file URL: ' + q.currentUrl(fileId));

  const queueId = await q.addSession({ name: 'preview-session', agent: 'codex' });
  q.feed(queueId, 'Local: http://localhost:49151/current\\r\\n');
  expect(q.currentUrl(queueId) === null, 'first detected preview must queue, not occupy the pane');
  expect(JSON.stringify(q.queueUrls(queueId)) === JSON.stringify(['http://localhost:49151/current']),
    'first detected preview should be queued: ' + JSON.stringify(q.queueUrls(queueId)));
  q.openQueued(queueId, 'http://localhost:49151/current');
  expect(q.currentUrl(queueId) === 'http://localhost:49151/current',
    'queue test session should occupy the pane only after OPEN');

  q.feed(queueId, 'now http://localhost:49151/uat-a\\r\\n');
  expect(JSON.stringify(q.queueUrls(queueId)) === JSON.stringify(['http://localhost:49151/uat-a']),
    'valid URL printed as its own token should queue after current pane is occupied: ' + JSON.stringify(q.queueUrls(queueId)));
  const firstItem = q.queueItems(queueId)[0];
  expect(firstItem.source === 'TERM', 'queued terminal preview should store TERM source');
  expect(firstItem.reason === 'detected in agent output',
    'queued terminal preview should store human reason: ' + JSON.stringify(firstItem));
  const firstRow = q.queueRows(queueId)[0];
  expect(firstRow.reason === 'detected in agent output' && firstRow.url === 'http://localhost:49151/uat-a',
    'queue row should expose reason and URL: ' + JSON.stringify(firstRow));

  q.feed(queueId, 'then http://localhost:49151/uat-b\\r\\n');
  expect(JSON.stringify(q.queueUrls(queueId)) === JSON.stringify([
    'http://localhost:49151/uat-a',
    'http://localhost:49151/uat-b',
  ]), 'valid distinct previews should queue in order: ' + JSON.stringify(q.queueUrls(queueId)));

  q.feed(queueId, 'again http://localhost:49151/uat-b\\r\\n');
  expect(q.queueCount(queueId) === 2, 'duplicate queued URL should be ignored');

  q.feed(queueId, 'next http://localhost:49151/uat-c\\r\\n');
  expect(q.queueCount(queueId) === 3, 'different queued URL should be added');

  const holder = await q.addSession({ name: 'attention-holder', agent: '' });
  q.focus(holder);
  const attention = q.attentionItems().find((item) => item.kind === 'QUEUE 3' && item.name === 'preview-session');
  expect(attention && attention.detail === 'detected in agent output: http://localhost:49151/uat-a',
    'attention queue detail should include reason and URL: ' + JSON.stringify(attention));
  q.focus(queueId);

  q.openQueued(queueId, 'http://localhost:49151/uat-a');
  expect(q.currentUrl(queueId) === 'http://localhost:49151/uat-a', 'opened queued preview should become current URL');
  expect(q.queueCount(queueId) === 2, 'opening one queued preview should decrement queue count by one');
  expect(JSON.stringify(q.queueUrls(queueId)) === JSON.stringify([
    'http://localhost:49151/uat-b',
    'http://localhost:49151/uat-c',
  ]), 'opening one queued preview should leave the other queued URLs');

  const legacyId = await q.addSession({
    name: 'legacy-queue-session',
    agent: 'codex',
    queue: [{ url: 'http://localhost:49151/restored-legacy', source: 'TERM', ts: 1 }],
  });
  const legacyItem = q.queueItems(legacyId)[0];
  expect(legacyItem.source === 'RESTORE', 'legacy queue item without reason should default to RESTORE source');
  expect(legacyItem.reason === 'restored from previous session',
    'legacy queue item should default to restored reason: ' + JSON.stringify(legacyItem));

  return JSON.stringify({ ok: true, queue: q.queueUrls(queueId), current: q.currentUrl(queueId), file: q.currentUrl(fileId) });
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
