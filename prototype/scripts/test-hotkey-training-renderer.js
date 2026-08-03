'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-training-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'training-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestTraining;
  const shortcuts = window.chromuxTestShortcuts;
  const main = window.chromuxTest;
  if (!q || !shortcuts || !main) throw new Error('Missing training test APIs');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
  const send = async (keyCode, modifiers = ['meta']) => {
    await main.sendHostInput({ type: 'keyDown', keyCode, modifiers });
    await wait();
  };

  await wait(100);
  const firstId = await shortcuts.addSession({ name: 'live-one', queue: [] });
  const secondId = await shortcuts.addSession({
    name: 'live-two',
    queue: [{ url: 'http://localhost:4173/live', source: 'TEST', ts: 1 }],
  });
  shortcuts.activateIndex(0);

  q.openSettings();
  expect(document.querySelector('#hotkey-training-heading').textContent.includes('HOTKEY TRAINING'),
    'Settings should contain the training section');
  expect(document.querySelector('#training-settings-summary').textContent.includes('0 OF 4'),
    'Settings should show completed mission count');
  const launched = await q.launch();
  expect(launched && q.state().active && !q.state().arenaHidden, 'Settings launch should activate the full-window arena');
  expect(document.activeElement.classList.contains('training-mission-card'), 'launch should focus the first mission');
  const arenaFocusables = [...document.querySelectorAll(
    '#training-arena button:not([disabled]), #training-arena [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.closest('.hidden'));
  const firstArenaControl = arenaFocusables[0];
  const lastArenaControl = arenaFocusables[arenaFocusables.length - 1];
  lastArenaControl.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.activeElement === firstArenaControl,
    'Tab from the final visible arena control should wrap to the first');
  firstArenaControl.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
  }));
  expect(document.activeElement === lastArenaControl,
    'Shift+Tab from the first arena control should wrap to the final visible control');

  q.start('review-browser-output');
  const before = q.safetySnapshot();
  expect(before.activeId === firstId && before.queueCounts.join(',') === '0,1', 'live fixture should be ready for safety proof');

  await send('1');
  expect(q.state().run.mistakes === 1, 'wrong physical shortcut should count in training');
  expect(JSON.stringify(q.safetySnapshot()) === JSON.stringify(before),
    'wrong training shortcut must not switch live sessions or mutate live state');

  await send('j');
  expect(q.state().run.stepIndex === 1, 'physical Command+J should advance the simulated mission');
  await send('b', ['meta', 'shift']);
  await send('f', ['meta', 'shift']);
  await send('Enter', ['meta', 'shift']);
  await send('f', ['meta', 'shift']);
  expect(q.state().run.completedAt !== null, 'recognized physical shortcut sequence should complete the mission');
  expect(document.querySelector('#training-complete').classList.contains('hidden') === false,
    'completion panel should be visible');
  expect(q.state().liveStatus.includes('Mission complete'), 'completion should be announced to screen readers');
  expect(JSON.stringify(q.safetySnapshot()) === JSON.stringify(before),
    'training completion must not consume queues, change layouts, open Composer, or switch live sessions');

  q.replay();
  expect(q.state().run.stepIndex === 0 && q.state().run.completedAt === null, 'Replay should start a fresh unsaved run');
  q.hint();
  expect(q.state().run.hintUsed, 'manual hint should update the run');
  q.reveal();
  expect(q.state().run.chordRevealed && !document.querySelector('#training-chord').classList.contains('hidden'),
    'full reveal should expose the platform chord');

  q.start('create-leave-safely');
  for (const [keyCode, modifiers] of [
    ['n', ['meta']],
    ['Enter', ['meta', 'shift']],
    ['Escape', []],
    ['q', ['meta']],
    ['Escape', []],
  ]) await send(keyCode, modifiers);
  expect(q.state().run.completedAt !== null, 'safe-exit mission should complete through intercepted quit and Escape');
  expect(q.safetySnapshot().newHidden && q.safetySnapshot().lifecycleHidden,
    'training must not open real create-project or quit-confirmation dialogs');

  q.select();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await wait();
  expect(!q.state().active && q.state().arenaHidden, 'Escape from mission selection should exit the arena');
  expect(q.state().activeElementId === 'training-launch', 'arena exit should restore focus to Settings launch');

  await q.launch();
  q.start('recover-workspace');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }));
  expect(q.state().run.startedAt === null && q.state().run.mistakes === 0,
    'ordinary DOM typing should be ignored without starting the timer');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true, bubbles: true, cancelable: true }));
  expect(q.state().run.startedAt === null, 'modifier-only DOM input should be ignored');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true, cancelable: true }));
  expect(q.state().run.mistakes === 1, 'recognized synthetic shortcut should stay inside training');
  expect(q.safetySnapshot().activeId === firstId, 'synthetic training shortcut must not reach live session routing');
  await q.exit();

  q.resetRequest();
  expect(!q.state().resetHidden && q.state().activeElementId === 'training-reset-cancel',
    'Reset Progress should require confirmation and focus Cancel');
  q.resetCancel();
  expect(q.state().resetHidden, 'reset cancellation should preserve progress');
  q.resetRequest();
  q.resetConfirm();
  expect(Object.keys(q.state().progress.missions).length === 0, 'reset confirmation should remove only training progress');

  document.querySelector('[data-close="modal-settings"]').click();
  shortcuts.activateIndex(1);
  expect(shortcuts.activeId() === secondId,
    'normal shortcut behavior should resume after training exits and Settings closes');

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
const timeout = setTimeout(() => child.kill('SIGTERM'), 40000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('HOTKEY_TRAINING_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('HOTKEY_TRAINING_RENDERER_OK');
});
