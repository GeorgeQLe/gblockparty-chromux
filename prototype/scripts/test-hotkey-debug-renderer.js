'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-hotkey-debug-renderer-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'hotkey-debug-renderer-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const h = window.chromuxTestHotkeys;
  if (!h) throw new Error('Missing hotkey debug test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const byId = (id) => h.catalog().find((item) => item.id === id);

  await new Promise((resolve) => setTimeout(resolve, 100));

  const firstId = await h.addSession({ name: 'first' });
  const secondId = await h.addSession({
    name: 'queued',
    queue: [{ url: 'http://localhost:5173/queued', source: 'TEST', ts: 1 }],
  });

  h.focus(firstId);
  expect(byId('session-1').available, 'Command+1 should be available without modal/editable focus');
  expect(byId('session-2').available, 'Command+2 should be available for the second session');
  expect(byId('queue-next').available, 'Command+J should be available when a queue item exists');
  expect(byId('browser-toggle').available, 'Command+Shift+B should be available with an active session');
  expect(byId('browser-toggle').description === 'collapse browser', 'restored browser target should be collapse');

  h.setCollapsed(firstId, true);
  expect(byId('browser-toggle').description === 'restore browser', 'collapsed browser target should be restore');
  h.setCollapsed(firstId, false);

  h.openModal();
  expect(byId('session-1').disabledReason === 'modal open', 'session shortcuts should explain modal suppression');
  expect(byId('queue-next').disabledReason === 'modal open', 'Command+J should explain modal suppression');
  expect(byId('browser-toggle').disabledReason === 'modal open', 'Command+Shift+B should explain modal suppression');
  h.closeModals();

  h.focusHostEditable();
  expect(byId('session-1').disabledReason === 'host editable', 'session shortcuts should explain host editable suppression');
  expect(byId('queue-next').disabledReason === 'host editable', 'Command+J should explain host editable suppression');
  expect(byId('browser-toggle').disabledReason === 'host editable', 'Command+Shift+B should explain host editable suppression');
  h.clearFocus();

  h.focusGuestEditable(firstId);
  expect(byId('session-1').disabledReason === 'guest editable', 'session shortcuts should explain guest editable suppression');
  expect(byId('queue-next').disabledReason === 'guest editable', 'Command+J should explain guest editable suppression');
  expect(byId('browser-toggle').disabledReason === 'guest editable', 'Command+Shift+B should explain guest editable suppression');
  h.clearFocus();

  h.clearQueues();
  expect(byId('queue-next').available === false, 'Command+J should be unavailable when queues are empty');
  expect(byId('queue-next').disabledReason === 'queue empty', 'Command+J should explain empty queue state');
  h.setQueue(secondId, [{ url: 'http://localhost:5173/again', source: 'TEST', ts: 2 }]);
  expect(byId('queue-next').available, 'Command+J should become available when a queue item returns');
  expect(byId('queue-next').description === '1 queued', 'Command+J should expose queued preview count');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'J',
    modifiers: { meta: true, shift: false, alt: false, control: false },
    ts: Date.now(),
  });
  const debug = h.debug();
  expect(debug.source === 'host', 'debug source should record host input');
  expect(debug.latestKey === 'J', 'debug latest key should record shortcut key only');
  expect(debug.modifiers.meta === true, 'debug modifier state should record Command');
  expect(byId('queue-next').matchedByCurrentChord, 'current Command+J chord should sort and mark as matched');

  return JSON.stringify({
    ok: true,
    catalogCount: h.catalog().length,
    queueReason: byId('queue-next').disabledReason || null,
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
    console.error('HOTKEY_DEBUG_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('HOTKEY_DEBUG_RENDERER_OK');
});
