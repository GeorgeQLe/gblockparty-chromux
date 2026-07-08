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
  const sig = window.chromuxTestSignals;
  const cap = window.chromuxTestCaptures;
  if (!q || !sig || !cap) throw new Error('Missing update queue / signals / captures test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const indexOf = (list, kind) => {
    const index = list.indexOf(kind);
    if (index === -1) throw new Error('Missing attention kind ' + kind + ' in ' + list.join(','));
    return index;
  };

  await new Promise((resolve) => setTimeout(resolve, 100));
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  q.queue();
  expect(q.phase() === 'ready', 'zero sessions should queue as ready, got ' + q.phase());
  expect(q.attentionKinds()[0] === 'UPDATE READY', 'ready update should be first attention item');
  expect(q.installButtonText() === 'INSTALL UPDATE', 'ready settings action should install update');

  const liveId = await q.addSession({ name: 'live-unknown' });
  q.queue();
  expect(q.phase() === 'waiting', 'live unknown-turn session should block, got ' + q.phase());
  expect(q.blockers().join(',') === 'live-unknown', 'expected live-unknown blocker');
  expect(q.attentionKinds()[0] === 'UPDATE WAITING', 'waiting update should be first attention item');
  expect(q.attentionButtons('UPDATE WAITING').includes('FOCUS'), 'waiting update should expose FOCUS');
  expect(q.attentionButtons('UPDATE WAITING').includes('DISMISS'), 'waiting update should expose DISMISS');
  expect(q.installButtonText() === 'INSTALL ANYWAY', 'waiting settings action should allow managed override');
  expect(/install anyway/i.test(q.statusText()), 'waiting settings copy should explain managed override');

  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: false,
      reason: 'missing-source',
      message: 'No managed install source is recorded for this app.',
    },
  });
  expect(q.phase() === 'waiting', 'no-source status should keep waiting blockers');
  expect(q.installButtonText() === 'FOCUS BLOCKER', 'waiting without managed source should not offer override');
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  expect(q.installButtonText() === 'INSTALL ANYWAY', 'managed source should restore waiting override');

  q.dismissItem('UPDATE WAITING');
  expect(q.phase() === 'idle', 'dismissing waiting update should return queue to idle');
  expect(!q.attentionKinds().includes('UPDATE WAITING'), 'dismissed waiting update should leave attention queue');
  q.queue();
  expect(q.phase() === 'waiting', 'queueing again with blockers should return to waiting');
  expect(q.attentionKinds()[0] === 'UPDATE WAITING', 're-queued waiting update should return to attention');

  q.setInstallResult({ ok: true, output: 'fixture install started' });
  q.clickAttentionPrimary('UPDATE WAITING');
  q.flushRender();
  expect(q.phase() === 'waiting', 'attention UPDATE WAITING primary should not install');
  expect(q.activeName() === 'live-unknown', 'attention UPDATE WAITING primary should focus blocker');
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  q.queue();
  expect(q.installButtonText() === 'INSTALL ANYWAY', 'managed source should be active before override click');
  await document.querySelector('#settings-install-update').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 50));
  q.flushRender();
  expect(q.phase() === 'running', 'settings INSTALL ANYWAY should enter install path with blockers, got ' + q.phase());
  q.setInstallResult(null);
  q.setStatus({ updateAvailable: false });
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  q.setSession(liveId, { turnState: 'working' });
  q.queue();
  expect(q.phase() === 'waiting', 'working blocker should requeue waiting after override assertion');

  q.setSession(liveId, { turnState: 'completed' });
  expect(q.phase() === 'ready', 'completed turn should make queued update ready');
  q.dismissItem('UPDATE READY');
  expect(q.phase() === 'idle', 'dismissing ready update should return queue to idle');
  expect(!q.attentionKinds().includes('UPDATE READY'), 'dismissed ready update should leave attention queue');
  q.queue();
  expect(q.phase() === 'ready', 'queueing again with no blockers should return to ready');
  expect(q.attentionKinds()[0] === 'UPDATE READY', 're-queued ready update should return to attention');

  q.markUserInput(liveId);
  expect(q.turnState(liveId).state === 'working', 'typing after completed should start a working turn');
  expect(q.phase() === 'waiting', 'typing after completed should block updates again');
  expect(q.blockers().join(',') === 'live-unknown', 'typed completed session should return to live-unknown blocker');
  q.setSession(liveId, { turnState: 'completed' });
  expect(q.phase() === 'ready', 'completed turn should make queued update ready again');

  // Focusing a safe session must not regress READY (the old flag-wipe bug).
  sig.focus(liveId);
  expect(q.turnState(liveId).state === 'completed', 'focus must not touch turn state');
  expect(q.phase() === 'ready', 'focusing a completed session must not regress the queue');

  // Focusing a blocker leaves the phase waiting.
  q.setSession(liveId, { turnState: 'working' });
  expect(q.phase() === 'waiting', 'working turn should block');
  sig.focus(liveId);
  expect(q.phase() === 'waiting', 'focusing a blocker leaves phase waiting');
  expect(q.blockers().join(',') === 'live-unknown', 'blocker unchanged by focus');
  q.setSession(liveId, { turnState: 'completed' });
  expect(q.phase() === 'ready', 'ready again after completion');

  const inputId = await q.addSession({ name: 'input-needed', turnState: 'needsInput' });
  expect(q.phase() === 'ready', 'needsInput session should stay safe');

  const exitedId = await q.addSession({ name: 'exited', alive: false });
  expect(q.phase() === 'ready', 'exited session should stay safe');

  q.setSession(inputId, { turnState: 'unknown' });
  expect(q.phase() === 'waiting', 'unknown turn should block again');
  q.setSession(inputId, { turnState: 'needsInput' });
  q.setSession(exitedId, { alive: true, turnState: 'completed' });
  expect(q.phase() === 'ready', 'completed formerly-exited session should be safe');

  q.setInstallResult({ ok: false, message: 'fixture failure', output: 'fixture log' });
  await document.querySelector('#settings-install-update').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 50));
  q.flushRender();
  expect(q.phase() === 'failed', 'failed install should leave failed queue state, got ' + q.phase());
  expect(q.attentionKinds().includes('UPDATE FAILED'), 'failed update should stay visible in attention queue');
  expect(q.attentionButtons('UPDATE FAILED').includes('DISMISS'), 'failed update should expose DISMISS');
  expect(q.installButtonText() === 'RETRY INSTALL', 'failed settings action should retry');
  q.dismissItem('UPDATE FAILED');
  expect(q.phase() === 'idle', 'dismissing failed update should return queue to idle');
  expect(!q.attentionKinds().includes('UPDATE FAILED'), 'dismissed failed update should leave attention queue');
  q.queue();
  expect(q.phase() === 'ready', 'queueing again after failed dismissal should return to ready');
  expect(q.attentionKinds().includes('UPDATE READY'), 'ready update should stay visible behind direct agent items');

  // Agent-first triage order: direct agent/user-action items outrank queued
  // previews and completed turns; passive update waiting ranks below them.
  const orderHolder = await q.addSession({ name: 'order-holder', agent: '', turnState: 'completed' });
  sig.focus(orderHolder);
  q.setSession(liveId, { turnState: 'completed' });
  q.setSession(inputId, { turnState: 'needsInput' });
  q.setSession(exitedId, { alive: true, turnState: 'completed' });
  const orderInput = await q.addSession({ name: 'order-input', turnState: 'needsInput' });
  const orderCompleted = await q.addSession({ name: 'order-completed', turnState: 'completed' });
  const orderQueue = await q.addSession({
    name: 'order-queue',
    turnState: 'completed',
    queue: [{ url: 'http://localhost:4321', ts: Date.now() }],
  });
  const orderDelivery = await q.addSession({ name: 'order-delivery', turnState: 'completed' });
  sig.focus(orderHolder);
  const captureId = cap.beginFakeCapture({ sessionId: orderDelivery, url: 'http://localhost:9999' });
  const deliveryId = cap.beginFakeDelivery(captureId, { targetSessionId: orderDelivery });
  cap.closeDelivery(deliveryId, 2, 'fixture delivery failure');

  q.queue();
  let kinds = q.attentionKinds();
  expect(q.phase() === 'ready', 'all safe order sessions should make update ready');
  expect(indexOf(kinds, 'INPUT NEEDED') < indexOf(kinds, 'DELIVERY FAIL'), 'INPUT NEEDED should outrank DELIVERY FAIL');
  expect(indexOf(kinds, 'DELIVERY FAIL') < indexOf(kinds, 'UPDATE READY'), 'DELIVERY FAIL should outrank UPDATE READY');
  expect(indexOf(kinds, 'UPDATE READY') < indexOf(kinds, 'QUEUE 1'), 'UPDATE READY should outrank queued previews');
  expect(indexOf(kinds, 'QUEUE 1') < indexOf(kinds, 'COMPLETED'), 'queued previews should outrank completed turns');

  q.setSession(orderQueue, { turnState: 'unknown' });
  kinds = q.attentionKinds();
  expect(q.phase() === 'waiting', 'unknown order queue session should make update waiting');
  expect(indexOf(kinds, 'COMPLETED') < indexOf(kinds, 'UPDATE WAITING'), 'passive UPDATE WAITING should rank below completed turns');

  sig.focus(orderInput);
  expect(!sig.attentionItems().some((i) => i.kind === 'INPUT NEEDED' && i.name === 'order-input'),
    'focus hides input-needed display item for the focused session');
  expect(q.turnState(orderInput).state === 'needsInput', 'focus does not mutate input-needed state');
  sig.focus(orderHolder);
  expect(sig.attentionItems().some((i) => i.kind === 'INPUT NEEDED' && i.name === 'order-input'),
    'blur re-shows still-actionable input-needed item');

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
