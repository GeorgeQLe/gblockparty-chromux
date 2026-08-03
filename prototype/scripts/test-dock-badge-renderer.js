#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const packagedExecutable = process.env.CHROMUX_E2E_EXECUTABLE || '';

function runCase(name, source, extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `chromux-dock-badge-${name}-`));
  const home = path.join(root, 'home');
  const e2ePath = path.join(root, 'e2e.js');
  const outputPath = path.join(root, 'result.txt');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(e2ePath, source);
  const result = spawnSync(
    packagedExecutable || process.execPath,
    packagedExecutable ? ['--smoke'] : [electronCli, '.', '--smoke'],
    {
    cwd: appDir,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: home,
      PATH: '/usr/bin:/bin',
      CHROMUX_E2E: e2ePath,
      CHROMUX_E2E_OUT: outputPath,
      CHROMUX_E2E_DOCK_BADGE_PLATFORM: 'darwin',
      ...extraEnv,
    },
    },
  );
  const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (result.status !== 0 || !output.includes('"ok":true')) {
    throw new Error(`${name} failed\nexit=${result.status}\nresult=${output}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
}

const prelude = `
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (predicate, message, timeoutMs = 3000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
};
`;

runCase('attention', `(async () => {
  ${prelude}
  await new Promise((resolve) => setTimeout(resolve, 150));
  const rail = window.chromuxTestRail;
  const updates = window.chromuxTestUpdateQueue;
  expect(rail && updates && window.chromuxTest, 'missing Dock badge test APIs');
  const selected = rail.addTerminalSession({ name: 'selected', agent: 'codex' });
  const second = rail.addTerminalSession({ name: 'second', agent: 'claude' });
  rail.focus(selected);
  await waitFor(async () => (await window.chromuxTest.dockBadgeState()).calls.at(-1) === 0,
    'initial zero badge was not applied');

  rail.windowBlur();
  rail.emit(selected, 'turn-start');
  rail.emit(selected, 'turn-end', 'Selected finished in background');
  expect(rail.attentionCount() === 1 && rail.turnState(selected).state === 'completed',
    'background selected completion should remain unseen and badged');

  rail.emit(second, 'turn-start');
  rail.emit(second, 'turn-end', 'Second finished');
  expect(rail.attentionCount() === 2, 'two attentive sessions should count independently');
  rail.queue(second, 'http://localhost:4545', 'Explicit preview');
  expect(rail.attentionCount() === 2
    && rail.attentionCards().find((card) => card.id === second).reasons.length === 2,
  'multiple reasons in one session should contribute one badge count');
  window.chromuxTestTabs.grouping.setQueue(second, []);
  expect(rail.attentionCount() === 2, 'removing a duplicate reason should retain the per-session count');

  updates.setStatus({ managedInstall: { available: true } });
  updates.queue();
  expect(rail.attentionCount() === 3, 'a system row should increment independently');
  updates.setStatus({ updateAvailable: false, reason: 'current' });
  expect(rail.attentionCount() === 2, 'resolving a system row should decrement the badge');

  rail.windowFocus();
  expect(rail.attentionCount() === 1 && rail.turnState(selected).state === 'idle',
    'focus should consume only the now-visible selected completion');
  rail.focus(second);
  expect(rail.attentionCount() === 0, 'opening the remaining attentive session should clear the badge');

  rail.emit(second, 'turn-start');
  rail.emit(second, 'turn-end', 'Visible completion');
  expect(rail.attentionCount() === 0 && rail.turnState(second).state === 'idle',
    'foreground completion should remain unbadged because it is visible');

  rail.windowBlur();
  rail.emit(selected, 'turn-start');
  rail.emit(selected, 'turn-end', 'Done path');
  let item = rail.inboxSections().find((section) => section.key === 'ready-finish').items[0];
  rail.clickInboxAction(item.id, 'DONE');
  expect(rail.attentionCount() === 0, 'Done should clear the grouped Dock count');
  rail.emit(selected, 'turn-start');
  rail.emit(selected, 'turn-end', 'Snooze path');
  item = rail.inboxSections().find((section) => section.key === 'ready-finish').items[0];
  rail.clickInboxAction(item.id, 'SNOOZE');
  rail.clickInboxAction(item.id, '1 HOUR');
  expect(rail.attentionCount() === 0, 'Snooze should clear the grouped Dock count');
  rail.expireInbox(item.id);
  expect(rail.attentionCount() === 1, 'an expired snooze should restore the Dock count');
  rail.clickAttentionAction(selected, 'COMPLETED', 'DISMISS');
  expect(rail.attentionCount() === 0, 'dismiss should clear the final attention count');

  expect(await window.chromux.setDockBadgeCount(-1).then(() => false, () => true),
    'negative IPC badge counts must be rejected');
  expect(await window.chromux.setDockBadgeCount(1.5).then(() => false, () => true),
    'fractional IPC badge counts must be rejected');
  expect(await window.chromux.setDockBadgeCount(Number.MAX_SAFE_INTEGER + 1).then(() => false, () => true),
    'unsafe IPC badge counts must be rejected');
  const valid = await window.chromux.setDockBadgeCount(4);
  expect(valid.supported && valid.applied && valid.count === 4, 'valid macOS IPC count should be applied');

  const before = (await window.chromuxTest.dockBadgeState()).calls.length;
  rail.windowFocus();
  rail.focus(second);
  rail.flushRender();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const after = (await window.chromuxTest.dockBadgeState()).calls.length;
  expect(after === before, 'unchanged renderer badge counts should be deduplicated');
  return JSON.stringify({ ok: true });
})()`);

runCase('unsupported', `(async () => {
  ${prelude}
  const result = await window.chromux.setDockBadgeCount(2);
  expect(!result.supported && !result.applied && result.count === 2,
    'non-macOS should return an explicit unsupported result');
  return JSON.stringify({ ok: true });
})()`, { CHROMUX_E2E_DOCK_BADGE_PLATFORM: 'win32' });

runCase('rejected', `(async () => {
  ${prelude}
  await waitFor(async () => (await window.chromuxTest.dockBadgeState()).calls.length > 0,
    'renderer did not request the initial badge');
  document.querySelector('#btn-settings').click();
  const status = window.chromuxTestRail.dockBadgeStatus();
  const visibleOverlays = [...document.querySelectorAll('.overlay:not(.hidden)')];
  expect(status.settingsVisible && status.status === 'NOT ENABLED' && !status.guidanceHidden,
    'rejected macOS badging should render non-blocking Settings guidance');
  expect(visibleOverlays.length === 1 && visibleOverlays[0].id === 'modal-settings',
    'rejected badging should not open a permission prompt or modal');
  return JSON.stringify({ ok: true });
})()`, { CHROMUX_E2E_DOCK_BADGE_RESULT: 'rejected' });

console.log('DOCK_BADGE_RENDERER_OK');
