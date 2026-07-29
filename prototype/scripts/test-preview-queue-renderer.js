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
  const oscPreview = (sessionId, token, url, reason = null) => {
    const json = JSON.stringify({ v: 2, event: 'browser-preview', sessionId, token, url, reason });
    const encoded = btoa(json).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    return '\\x1b]777;chromux;v2;' + encoded + '\\x07';
  };

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
  expect(realItem.liveness === 'checking', 'loopback preview should be admitted immediately in checking state');
  q.openQueued(realId, 'http://localhost:5173/');
  expect(q.currentUrl(realId) === 'http://localhost:5173/',
    'queue OPEN should load the approved URL into the pane');
  expect(JSON.stringify(q.queueUrls(realId)) === JSON.stringify(['http://localhost:3000']),
    'queue OPEN should dequeue only the opened URL');

  const pendingId = await q.addSession({ name: 'pending-queue-navigation', agent: 'codex' });
  q.feed(pendingId, 'Local: http://localhost:49151/pending-success\\r\\n');
  q.showQueue(pendingId);
  q.openQueued(pendingId, 'http://localhost:49151/pending-success');
  expect(q.queueCount(pendingId) === 0, 'queue OPEN should dequeue the pending success URL immediately');
  expect(q.queuePanelHidden(pendingId) === false, 'queue should remain visible while the selected page loads');
  const pendingSuccess = q.pendingQueueNavigation();
  expect(pendingSuccess && pendingSuccess.sessionId === pendingId
    && pendingSuccess.tabId === q.activeBrowserTabId(pendingId)
    && pendingSuccess.url === 'http://localhost:49151/pending-success',
  'queue OPEN should track the selected tab and URL until completion: ' + JSON.stringify(pendingSuccess));

  const unrelatedId = await q.addSession({ name: 'unrelated-queue-navigation', agent: 'codex' });
  q.finishLoad(unrelatedId, 'http://localhost:49151/unrelated-success');
  expect(q.queuePanelHidden(pendingId) === false,
    'a successful load in an unrelated tab should not close the pending queue');
  expect(q.pendingQueueNavigation()?.sessionId === pendingId,
    'an unrelated successful load should not clear pending queue navigation');

  q.redirectLoad(pendingId, 'http://localhost:49151/redirected-success');
  q.finishLoad(pendingId, 'http://localhost:49151/redirected-success');
  expect(q.queuePanelHidden(pendingId) === true,
    'successful completion, including a redirect, should close the pending queue');
  expect(q.pendingQueueNavigation() === null, 'successful completion should clear pending queue navigation');

  const latestId = await q.addSession({ name: 'latest-queue-navigation', agent: 'codex' });
  q.feed(latestId, 'Local: http://localhost:49151/first-selection\\r\\n');
  q.feed(latestId, 'Local: http://localhost:49151/latest-selection\\r\\n');
  q.showQueue(latestId);
  q.openQueued(latestId, 'http://localhost:49151/first-selection');
  q.openQueued(latestId, 'http://localhost:49151/latest-selection');
  expect(q.pendingQueueNavigation()?.url === 'http://localhost:49151/latest-selection',
    'the latest queue selection should replace earlier pending navigation');
  q.failLoad(latestId, 'http://localhost:49151/first-selection', -3, true);
  q.finishLoad(latestId, 'http://localhost:49151/first-selection');
  expect(q.queuePanelHidden(latestId) === false && q.pendingQueueNavigation()?.url === 'http://localhost:49151/latest-selection',
    'stale events from an earlier same-tab selection should not close or clear the queue');
  q.finishLoad(latestId, 'http://localhost:49151/latest-selection');
  expect(q.queuePanelHidden(latestId) === true && q.pendingQueueNavigation() === null,
    'only the latest same-tab queue selection should control automatic closure');

  const pendingFailureId = await q.addSession({ name: 'pending-queue-failure', agent: 'codex' });
  q.feed(pendingFailureId, 'Local: http://localhost:49149/pending-failure\\r\\n');
  q.showQueue(pendingFailureId);
  q.openQueued(pendingFailureId, 'http://localhost:49149/pending-failure');
  q.failLoad(pendingFailureId, 'http://localhost:49149/pending-failure');
  expect(q.queuePanelHidden(pendingFailureId) === false,
    'main-frame failure should leave the pending queue visible');
  expect(JSON.stringify(q.queueUrls(pendingFailureId)) === JSON.stringify(['http://localhost:49149/pending-failure']),
    'main-frame loopback failure should restore the offline queue row');
  expect(q.queueRows(pendingFailureId)[0]?.status === 'SERVER OFFLINE',
    'restored loopback failure should remain actionable as offline');
  expect(q.pendingQueueNavigation() === null, 'main-frame failure should clear pending queue navigation');

  const pendingCloseId = await q.addSession({ name: 'pending-queue-close', agent: 'codex' });
  q.feed(pendingCloseId, 'Local: http://localhost:49151/pending-close\\r\\n');
  q.showQueue(pendingCloseId);
  q.openQueued(pendingCloseId, 'http://localhost:49151/pending-close');
  const closedPendingTabId = q.activeBrowserTabId(pendingCloseId);
  q.closeBrowserTab(pendingCloseId, closedPendingTabId);
  expect(q.pendingQueueNavigation() === null, 'closing the pending browser tab should clear transient navigation state');
  q.finishLoad(pendingCloseId, 'http://localhost:49151/pending-close');
  expect(q.queuePanelHidden(pendingCloseId) === false,
    'a stale completion after closing the pending tab should not close the queue');

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
  expect(q.queueCount(id) === 0 && JSON.stringify(q.candidates(id)) === JSON.stringify(['http://localhost:49151/typed-url']),
    'active-turn URL should remain a bounded candidate until the Codex completion boundary');
  q.emit(id, 'turn-end');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify(['http://localhost:49151/typed-url']),
    'agent-printed URL should queue for approval: ' + JSON.stringify(q.queueUrls(id)));

  q.typeInput(id, 'open http://localhost:49151/chunked-');
  q.typeInput(id, 'typed\\r');
  q.feed(id, 'open http://localhost:49151/chunked-typed\\r\\n');
  expect(q.currentUrl(id) === null, 'chunked typed URL echo must not open the pane');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify(['http://localhost:49151/typed-url']),
    'chunked typed URL echo should not queue: ' + JSON.stringify(q.queueUrls(id)));
  q.feed(id, 'agent later printed http://localhost:49151/chunked-typed\\r\\n');
  q.emit(id, 'turn-end');
  expect(JSON.stringify(q.queueUrls(id)) === JSON.stringify([
    'http://localhost:49151/typed-url',
    'http://localhost:49151/chunked-typed',
  ]), 'later agent output of chunked typed URL should still queue');

  const latestTurnId = await q.addSession({ name: 'latest-turn-only', agent: 'codex' });
  q.typeInput(latestTurnId, 'first request\\r');
  q.feed(latestTurnId, 'first turn http://localhost:49151/stale-candidate\\r\\n');
  expect(q.candidates(latestTurnId).length === 1, 'first active turn should retain one candidate');
  q.typeInput(latestTurnId, 'replacement request\\r');
  expect(q.candidates(latestTurnId).length === 0, 'new user input must clear stale turn candidates');
  for (let index = 0; index < 30; index += 1) {
    q.feed(latestTurnId, 'candidate http://localhost:49151/latest-' + index + '\\r\\n');
  }
  expect(q.candidates(latestTurnId).length === 24
    && q.candidates(latestTurnId)[0].endsWith('/latest-6')
    && q.candidates(latestTurnId)[23].endsWith('/latest-29'),
  'active-turn candidates should be bounded to the latest 24: ' + JSON.stringify(q.candidates(latestTurnId)));
  q.emit(latestTurnId, 'turn-end');
  expect(q.queueCount(latestTurnId) === 24
    && !q.queueUrls(latestTurnId).some((url) => url.includes('stale-candidate')),
  'Codex completion should promote only the latest bounded turn');

  for (const [agent, boundary] of [['claude', 'input-needed'], ['grok', 'turn-end']]) {
    const boundaryId = await q.addSession({ name: agent + '-boundary', agent });
    q.emit(boundaryId, 'turn-start');
    q.typeInput(boundaryId, 'build it\\r');
    q.feed(boundaryId, 'preview http://localhost:49151/' + agent + '-boundary\\r\\n');
    expect(q.queueCount(boundaryId) === 0, agent + ' active turn should retain its preview candidate: '
      + JSON.stringify({ turn: q.turnState(boundaryId), candidates: q.candidates(boundaryId), queue: q.queueUrls(boundaryId) }));
    q.emit(boundaryId, boundary);
    expect(q.queueCount(boundaryId) === 1
      && q.queueItems(boundaryId)[0].visibility === 'browser',
    agent + ' actionable/completion boundary should promote the browser-only candidate');
  }

  const uninstrumentedId = await q.addSession({
    name: 'uninstrumented-fallback',
    agent: 'claude',
    turnState: 'working',
  });
  q.typeInput(uninstrumentedId, 'start server\\r');
  q.feed(uninstrumentedId, 'Local: http://localhost:49151/uninstrumented\\r\\n');
  expect(q.queueCount(uninstrumentedId) === 0, 'uninstrumented active turn should begin as a candidate');
  await wait(1650);
  expect(q.queueUrls(uninstrumentedId)[0] === 'http://localhost:49151/uninstrumented'
    && q.queueItems(uninstrumentedId)[0].visibility === 'browser',
  'uninstrumented fallback should eventually remain available in the browser-only queue');

  const explicitId = await q.addSession({ name: 'explicit-preview-session', agent: 'codex' });
  const terminalFirst = q.routeExplicit(explicitId, 'https://example.com/explicit', 'MCP', 'review the implementation');
  expect(terminalFirst.status === 'queued', 'first explicit request should report queued');
  const duplicateExplicit = q.routeExplicit(explicitId, 'https://example.com/explicit', 'MCP', 'review the implementation');
  expect(duplicateExplicit.status === 'alreadyQueued', 'duplicate explicit request should report alreadyQueued');
  const explicitItem = q.queueItems(explicitId)[0];
  expect(explicitItem.visibility === 'attention' && explicitItem.source === 'MCP',
    'MCP request should create an attention-visible queue item: ' + JSON.stringify(explicitItem));
  const explicitHolder = await q.addSession({ name: 'explicit-holder', agent: '' });
  q.focus(explicitHolder);
  expect(q.attentionItems().some((item) => item.kind === 'QUEUE 1' && item.name === 'explicit-preview-session'),
    'explicit MCP request should surface in Threads');
  expect(q.tabBadge(explicitId) === '1', 'explicit MCP request should surface in the session-tab badge');
  q.openQueued(explicitId, 'https://example.com/explicit');
  const refreshedExplicit = q.routeExplicit(explicitId, 'https://example.com/explicit', 'MCP', 'refresh the implementation');
  expect(refreshedExplicit.status === 'refreshed',
    'explicit request for an already-open target should report refreshed without requeueing');

  const oscId = await q.addSession({ name: 'osc-preview-session', agent: 'claude' });
  q.setSignalToken(oscId, 'osc-secret');
  q.feed(oscId, oscPreview(oscId, 'wrong-token', 'https://example.com/rejected'));
  expect(q.queueCount(oscId) === 0, 'wrong-token preview OSC must be rejected');
  q.feed(oscId, oscPreview(oscId, 'osc-secret', 'https://example.com/osc', 'open the UI'));
  await wait(50);
  expect(q.queueItems(oscId)[0].source === 'OSC'
    && q.queueItems(oscId)[0].visibility === 'attention',
  'authenticated preview OSC should share explicit attention queue semantics');

  const fileId = await q.addSession({ name: 'file-preview-session', agent: 'codex' });
  q.typeInput(fileId, 'open ' + htmlPath + '\\r');
  q.feed(fileId, 'open ' + htmlPath + '\\r\\n');
  await wait(80);
  expect(q.currentUrl(fileId) === null, 'typed local .html path echo should not route');
  expect(q.queueCount(fileId) === 0, 'typed local .html path echo should not queue');
  q.feed(fileId, 'agent later printed ' + htmlPath + '\\r\\n');
  await wait(80);
  expect(q.currentUrl(fileId) === null, 'agent-printed local .html must not auto-open');
  q.emit(fileId, 'turn-end');
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
  expect(!attention, 'terminal fallback queues must stay out of Threads: ' + JSON.stringify(q.attentionItems()));
  expect(q.tabBadge(queueId) === '0', 'terminal fallback queues must stay out of the session-tab badge');
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
  expect(legacyItem.visibility === 'attention', 'legacy restored queue records should default to attention visibility');
  expect(legacyItem.liveness === 'checking', 'restored loopback preview should be reprobed from checking state');

  const browserRestoreId = await q.addSession({
    name: 'browser-only-restore',
    agent: 'codex',
    queue: [{ url: 'https://example.com/browser-only', source: 'TERM', visibility: 'browser', reason: 'detected in agent output' }],
  });
  expect(q.queueItems(browserRestoreId)[0].visibility === 'browser',
    'new queue visibility should survive restore normalization');

  const failureId = await q.addSession({ name: 'failed-browser-session', agent: 'codex' });
  q.failLoad(failureId, 'http://localhost:49149/failed');
  let failureRows = q.queueRows(failureId);
  expect(failureRows.length === 1 && failureRows[0].status === 'SERVER OFFLINE',
    'main-frame loopback failure should create an offline queue row: ' + JSON.stringify(failureRows));
  expect(failureRows[0].actions.includes('RECHECK') && failureRows[0].actions.includes('START SERVER…')
    && failureRows[0].actions.includes('OPEN'),
  'offline row should expose recheck, launcher, and approval-gated open actions');
  q.failLoad(failureId, 'http://localhost:49149/aborted', -3, true);
  q.failLoad(failureId, 'http://localhost:49149/subframe', -102, false);
  expect(q.queueCount(failureId) === 1, 'aborted and subframe failures should be ignored');
  const rechecked = await q.recheckQueued(failureId, 'http://localhost:49149/failed');
  expect(rechecked === 'offline', 'manual recheck should report the closed port offline');
  q.finishLoad(failureId, 'http://localhost:49149/failed');
  expect(q.queueCount(failureId) === 0, 'successful load should remove the corresponding queue entry');

  const fileRow = q.queueRows(fileId)[0];
  expect(!fileRow || fileRow.status === '', 'file previews should remain free of server liveness state');

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
