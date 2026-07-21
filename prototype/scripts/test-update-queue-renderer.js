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
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    q.flushRender();
  };
  const warning = () => ({
    visible: !document.querySelector('#modal-lifecycle').classList.contains('hidden'),
    title: document.querySelector('#lifecycle-title').textContent,
    copy: document.querySelector('#lifecycle-copy').textContent,
    confirm: document.querySelector('#lifecycle-confirm').textContent,
  });
  const answerWarning = async (answer) => {
    document.querySelector(answer ? '#lifecycle-confirm' : '#lifecycle-cancel').click();
    await settle();
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

  // Explicit queue state, including a failed retry, must retain the protected
  // lifecycle/snapshot path even in an otherwise empty workspace.
  q.queue();
  expect(q.phase() === 'ready', 'zero sessions should queue as ready, got ' + q.phase());
  expect(q.attentionKinds()[0] === 'UPDATE READY', 'ready update should be first attention item');
  expect(q.attentionButtons('UPDATE READY').includes('EXECUTE'), 'ready update should expose EXECUTE');
  expect(q.installButtonText() === 'INSTALL UPDATE', 'ready settings action should install update');
  q.resetInstallTrace();
  q.setInstallResult({ ok: false, message: 'empty fixture failure', output: 'empty fixture log' });
  document.querySelector('#settings-install-update').click();
  expect(warning().visible && warning().confirm === 'EXECUTE UPDATE', 'queued install should require execute confirmation');
  await answerWarning(true);
  await settle();
  expect(q.phase() === 'failed', 'explicitly queued empty-workspace install should preserve failed state');
  expect(q.installTrace().lifecyclePrompts === 1, 'explicit ready install should enter lifecycle protection');
  expect(q.installTrace().restoreSnapshots === 1, 'explicit ready install should write a restore snapshot');
  q.resetInstallTrace();
  q.setInstallResult({ ok: true, output: 'empty fixture retry started' });
  document.querySelector('#settings-install-update').click();
  expect(warning().visible, 'failed retry should require execute confirmation');
  await answerWarning(true);
  await settle();
  expect(q.phase() === 'running', 'failed retry should install from its existing queue state');
  expect(q.installTrace().lifecyclePrompts === 1, 'failed retry must not use the idle-workspace bypass');
  expect(q.installTrace().restoreSnapshots === 1, 'failed retry should retain snapshot protection');

  // The first click in a truly idle workspace should install immediately,
  // without projecting an UPDATE READY row or protecting an empty snapshot.
  q.setStatus({ updateAvailable: false });
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  q.resetInstallTrace();
  q.setInstallResult({ ok: true, output: 'idle fast install started' });
  document.querySelector('#btn-update-ready').click();
  await settle();
  expect(q.phase() === 'running', 'idle empty workspace should install on the first top-level click');
  expect([...new Set(q.installTrace().phases)].join(',') === 'idle,running', 'top-level fast path should transition directly idle to running');
  expect(!q.attentionKinds().includes('UPDATE READY'), 'idle fast path must not expose UPDATE READY');
  expect(q.installTrace().lifecyclePrompts === 0, 'idle fast path should skip the lifecycle modal');
  expect(q.installTrace().restoreSnapshots === 0, 'idle fast path should skip the empty restore snapshot');

  q.setStatus({ updateAvailable: false });
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  q.resetInstallTrace();
  document.querySelector('#settings-install-update').click();
  await settle();
  expect(q.phase() === 'running', 'idle empty workspace should also install on the first Settings click');
  expect([...new Set(q.installTrace().phases)].join(',') === 'idle,running', 'Settings fast path should transition directly idle to running');
  expect(!q.attentionKinds().includes('UPDATE READY'), 'Settings fast path must not expose UPDATE READY');
  expect(q.installTrace().lifecyclePrompts === 0, 'Settings fast path should skip lifecycle confirmation');
  expect(q.installTrace().restoreSnapshots === 0, 'Settings fast path should skip the empty snapshot');

  // Without a managed source, the same click retains the manual update flow.
  q.setStatus({ updateAvailable: false });
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: false,
      reason: 'missing-source',
      message: 'No managed install source is recorded for this app.',
    },
  });
  q.resetInstallTrace();
  document.querySelector('#btn-update-ready').click();
  await settle();
  expect(q.phase() === 'ready', 'missing managed source should queue for the manual update flow');
  expect(q.attentionKinds().includes('UPDATE READY'), 'manual update flow should retain UPDATE READY');
  expect(q.attentionButtons('UPDATE READY').includes('DETAILS'), 'manual update flow should expose DETAILS instead of an unavailable execute action');
  expect(q.installTrace().lifecyclePrompts === 0, 'manual update queueing should not open lifecycle confirmation');
  expect(q.installTrace().restoreSnapshots === 0, 'manual update queueing should not write a snapshot');

  q.setStatus({ updateAvailable: false });
  q.setStatus({
    updateAvailable: true,
    managedInstall: {
      available: true,
      sourceDir: '/tmp/chromux-source',
      command: 'npm run install-app',
    },
  });
  q.setInstallResult(null);

  const liveId = await q.addSession({ name: 'live-unknown' });
  document.querySelector('#btn-update-ready').click();
  q.flushRender();
  expect(q.phase() === 'waiting', 'live unknown-turn session should block, got ' + q.phase());
  expect(q.blockers().join(',') === 'live-unknown', 'expected live-unknown blocker');
  expect(q.attentionKinds()[0] === 'UPDATE WAITING', 'waiting update should be first attention item');
  expect(q.attentionButtons('UPDATE WAITING').includes('EXECUTE'), 'waiting managed update should expose EXECUTE');
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
  expect(q.attentionButtons('UPDATE WAITING').includes('DETAILS'), 'waiting update without a managed source should expose DETAILS');
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
  expect(q.phase() === 'waiting', 'dismiss must not apply before confirmation');
  expect(warning().visible && warning().title === 'DISMISS QUEUED UPDATE?', 'dismiss should open its warning confirmation');
  expect(/without installing/i.test(warning().copy), 'dismiss warning should explain that the update stays uninstalled');
  await answerWarning(false);
  expect(q.phase() === 'waiting', 'canceling dismiss should keep the update queued');
  q.dismissItem('UPDATE WAITING');
  await answerWarning(true);
  expect(q.phase() === 'idle', 'dismissing waiting update should return queue to idle');
  expect(!q.attentionKinds().includes('UPDATE WAITING'), 'dismissed waiting update should leave attention queue');
  q.queue();
  expect(q.phase() === 'waiting', 'queueing again with blockers should return to waiting');
  expect(q.attentionKinds()[0] === 'UPDATE WAITING', 're-queued waiting update should return to attention');

  q.setInstallResult({ ok: true, output: 'fixture install started' });
  q.resetInstallTrace();
  q.clickAttentionPrimary('UPDATE WAITING');
  q.flushRender();
  expect(q.phase() === 'waiting', 'attention EXECUTE should wait for confirmation');
  expect(warning().visible && warning().title === 'EXECUTE CHROMUX UPDATE?', 'attention EXECUTE should open an update warning');
  expect(/stop live PTYs/i.test(warning().copy), 'execute warning should explain the live-session impact');
  await answerWarning(false);
  expect(q.phase() === 'waiting', 'canceling execute should keep the update queued');
  q.resetInstallTrace();
  q.clickAttentionPrimary('UPDATE WAITING');
  await answerWarning(true);
  expect(q.phase() === 'running', 'confirmed attention EXECUTE should enter the install path, got ' + q.phase());
  expect(q.installTrace().lifecyclePrompts === 1, 'open-session install should retain lifecycle confirmation');
  expect(q.installTrace().restoreSnapshots === 1, 'open-session install should retain restore snapshots');
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
  q.setSession(liveId, { turnState: 'idle' });
  expect(q.phase() === 'ready', 'idle turn should keep queued update ready');
  q.dismissItem('UPDATE READY');
  expect(q.phase() === 'ready', 'ready dismissal should wait for confirmation');
  await answerWarning(true);
  expect(q.phase() === 'idle', 'dismissing ready update should return queue to idle');
  expect(!q.attentionKinds().includes('UPDATE READY'), 'dismissed ready update should leave attention queue');
  q.queue();
  expect(q.phase() === 'ready', 'queueing again with no blockers should return to ready');
  expect(q.attentionKinds()[0] === 'UPDATE READY', 're-queued ready update should return to attention');

  q.markUserInput(liveId);
  expect(q.turnState(liveId).state === 'working', 'typing after idle should start a working turn');
  expect(q.phase() === 'waiting', 'typing after idle should block updates again');
  expect(q.blockers().join(',') === 'live-unknown', 'typed idle session should return to live-unknown blocker');
  q.setSession(liveId, { turnState: 'completed' });
  expect(q.phase() === 'ready', 'completed turn should make queued update ready again');

  // Focusing a safe completion consumes it to idle without regressing READY.
  sig.focus(liveId);
  expect(q.turnState(liveId).state === 'idle', 'focus should consume completion to idle');
  expect(q.phase() === 'ready', 'focusing a completed session must keep the queue ready');

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
  expect(warning().visible, 'ready install should require execute confirmation');
  await answerWarning(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 50));
  q.flushRender();
  expect(q.phase() === 'failed', 'failed install should leave failed queue state, got ' + q.phase());
  expect(q.attentionKinds().includes('UPDATE FAILED'), 'failed update should stay visible in attention queue');
  expect(q.attentionButtons('UPDATE FAILED').includes('DISMISS'), 'failed update should expose DISMISS');
  expect(q.installButtonText() === 'RETRY INSTALL', 'failed settings action should retry');
  q.dismissItem('UPDATE FAILED');
  expect(q.phase() === 'failed', 'failed dismissal should wait for confirmation');
  await answerWarning(true);
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
