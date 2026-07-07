'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { sessionShortcutDigit } = require('../shortcut-input');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-shortcuts-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'shortcuts-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

const expectShortcut = (cond, msg) => { if (!cond) throw new Error(msg); };
expectShortcut(sessionShortcutDigit({ key: '1' }) === '1', 'shortcut digit should accept key 1');
expectShortcut(sessionShortcutDigit({ key: '3' }) === '3', 'shortcut digit should accept key 3');
expectShortcut(sessionShortcutDigit({ key: '', code: 'Digit1' }) === '1', 'shortcut digit should accept code Digit1');
expectShortcut(sessionShortcutDigit({ key: 'Unidentified', code: 'Digit3' }) === '3', 'shortcut digit should accept code Digit3');
expectShortcut(sessionShortcutDigit({ key: '', code: 'Numpad1' }) === null, 'shortcut digit should ignore numpad codes');

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestShortcuts;
  if (!q) throw new Error('Missing shortcut test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  await new Promise((resolve) => setTimeout(resolve, 100));

  const firstId = await q.addSession({ name: 'first', queue: [] });
  const secondId = await q.addSession({
    name: 'second',
    queue: [
      { url: 'http://localhost:5173/one', source: 'TEST', ts: 1 },
      { url: 'http://localhost:5173/two', source: 'TEST', ts: 2 },
    ],
  });
  const thirdId = await q.addSession({ name: 'third', queue: [] });

  q.activateIndex(0);
  expect(q.activeId() === firstId, 'Command+1 should activate first session');
  q.activateIndex(2);
  expect(q.activeId() === thirdId, 'Command+3 should activate third session');

  const focused = q.focusNextQueuedPreview(1000);
  expect(focused && focused.sessionId === secondId, 'Command+J should target first queued session');
  expect(q.activeId() === secondId, 'Command+J should activate queued session');
  expect(q.queuePanelHidden(secondId) === false, 'Command+J should reveal queue panel');
  expect(q.focusedOpenUrl() === 'http://localhost:5173/one', 'Command+J should focus first OPEN button');
  expect(q.queueCount(secondId) === 2, 'Command+J must not dequeue');
  expect(q.currentUrl(secondId) === null, 'Command+J must not open the preview');

  const repeated = q.focusNextQueuedPreview(1500);
  expect(repeated && repeated.ignored === true, 'repeated Command+J within 900ms should be ignored for same item');
  expect(q.focusedOpenUrl() === 'http://localhost:5173/one', 'ignored repeat should keep focus on same item');
  expect(q.queueCount(secondId) === 2, 'ignored repeat must not dequeue');

  q.clickFocused();
  expect(q.queueCount(secondId) === 1, 'focused OPEN should dequeue exactly one item');
  expect(q.currentUrl(secondId) === 'http://localhost:5173/one', 'focused OPEN should open the focused URL');
  expect(q.focusedOpenUrl() !== 'http://localhost:5173/one', 'opened item should no longer be focused');

  // Editable focus must suppress the shell shortcuts (the guarded IPC paths).
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  expect(q.shortcutFocusNextQueueItem() === null, 'Command+J must be a no-op while an editable is focused');
  expect(document.activeElement === input, 'Command+J must not steal focus from an editable');
  q.activateIndex(0);
  expect(q.activeId() === secondId, 'Command+1..9 must be a no-op while an editable is focused');
  input.blur();
  input.remove();
  const afterBlur = q.shortcutFocusNextQueueItem();
  expect(afterBlur && afterBlur.sessionId === secondId, 'Command+J should work again once no editable is focused');

  return JSON.stringify({
    ok: true,
    activeId: q.activeId(),
    remaining: q.queueCount(secondId),
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
    console.error('SHORTCUTS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('SHORTCUTS_RENDERER_OK');
});
