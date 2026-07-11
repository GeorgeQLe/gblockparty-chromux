'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  chromuxShortcutAction,
  shouldRouteChromuxShortcut,
} = require('../shortcut-input');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-hotkey-debug-renderer-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'hotkey-debug-renderer-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

const expectShortcut = (cond, msg) => { if (!cond) throw new Error(msg); };
expectShortcut(
  chromuxShortcutAction({ type: 'keyDown', key: 't', control: true }) === null,
  'Control+T should not be a Chromux-owned shortcut',
);
expectShortcut(
  !shouldRouteChromuxShortcut({ type: 'keyDown', key: 't', control: true }, { focusKind: 'terminal' }),
  'Control+T should not route through Chromux shortcut handling',
);

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
  expect(byId('browser-toggle').description === 'open browser', 'shut browser target should be open');

  h.setCollapsed(firstId, false);
  expect(byId('browser-toggle').description === 'shut browser', 'open browser target should be shut');
  h.setCollapsed(firstId, true);
  expect(byId('browser-toggle').description === 'open browser', 'collapsed browser target should be open');
  h.setCollapsed(firstId, false);

  h.openModal();
  expect(byId('session-1').disabledReason === 'modal open', 'session shortcuts should explain modal suppression');
  expect(byId('queue-next').disabledReason === 'modal open', 'Command+J should explain modal suppression');
  expect(byId('browser-toggle').disabledReason === 'modal open', 'Command+Shift+B should explain modal suppression');
  expect(byId('new-session').disabledReason === 'modal open', 'Command+T should explain modal suppression');
  expect(byId('detect').disabledReason === 'modal open', 'Command+D should explain modal suppression');
  h.closeModals();

  h.focusHostEditable();
  expect(h.context().focusKind === 'hostEditable', 'host input should classify as host editable');
  expect(byId('session-1').disabledReason === 'host editable', 'session shortcuts should explain host editable suppression');
  expect(byId('queue-next').disabledReason === 'host editable', 'Command+J should explain host editable suppression');
  expect(byId('browser-toggle').disabledReason === 'host editable', 'Command+Shift+B should explain host editable suppression');
  expect(byId('new-session').disabledReason === 'host editable', 'Command+T should explain host editable suppression');
  expect(byId('detect').disabledReason === 'host editable', 'Command+D should explain host editable suppression');
  h.clearFocus();

  h.focusTerminalTextarea();
  expect(h.context().focusKind === 'terminal', 'xterm helper textarea should classify as terminal focus');
  expect(h.context().hostEditable === false, 'xterm helper textarea should not be host editable');
  expect(byId('session-1').available, 'Command+1 should be available from terminal focus');
  expect(byId('queue-next').available, 'Command+J should be available from terminal focus');
  expect(byId('browser-toggle').available, 'Command+Shift+B should be available from terminal focus');
  h.clearFocus();

  h.focusGuestEditable(firstId);
  expect(h.context().focusKind === 'guestEditable', 'guest input should classify as guest editable');
  expect(byId('session-1').disabledReason === 'guest editable', 'session shortcuts should explain guest editable suppression');
  expect(byId('queue-next').disabledReason === 'guest editable', 'Command+J should explain guest editable suppression');
  expect(byId('browser-toggle').disabledReason === 'guest editable', 'Command+Shift+B should explain guest editable suppression');
  expect(byId('new-session').disabledReason === 'guest editable', 'Command+T should explain guest editable suppression');
  expect(byId('detect').disabledReason === 'guest editable', 'Command+D should explain guest editable suppression');
  h.clearFocus();

  h.clearQueues();
  expect(byId('queue-next').available === false, 'Command+J should be unavailable when queues are empty');
  expect(byId('queue-next').disabledReason === 'queue empty', 'Command+J should explain empty queue state');
  h.setQueue(secondId, [{ url: 'http://localhost:5173/again', source: 'TEST', ts: 2 }]);
  expect(byId('queue-next').available, 'Command+J should become available when a queue item returns');
  expect(byId('queue-next').description === '1 queued', 'Command+J should expose queued preview count');

  let debug = null;

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 't',
    modifiers: { meta: false, shift: false, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === false, 'bare t should keep shortcut details inactive');
  expect(debug.latestKey === null, 'bare t should not set the latest shortcut key');
  expect(debug.modifiers.meta === false && debug.modifiers.control === false, 'bare t should not light wake modifiers');
  expect(byId('new-session').matchedByCurrentChord === false, 'bare t should not match Command+T');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'Shift',
    modifiers: { meta: false, shift: true, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === false, 'bare Shift should keep shortcut details inactive');
  expect(debug.latestKey === null, 'bare Shift should not set the latest shortcut key');
  expect(debug.modifiers.shift === false, 'bare Shift should not light the Shift modifier chip');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'T',
    modifiers: { meta: false, shift: true, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === false, 'shifted typing should keep shortcut details inactive');
  expect(debug.latestKey === null, 'shifted typing should not set the latest shortcut key');
  expect(debug.modifiers.shift === false, 'shifted typing should not light the Shift modifier chip');

  const bareDomShift = h.domInput({
    type: 'keydown',
    key: 'Shift',
    metaKey: false,
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
  });
  expect(bareDomShift.key === null, 'renderer DOM bare Shift should not become a diagnostic key');
  expect(bareDomShift.modifiers.shift === false, 'renderer DOM bare Shift should not report an active Shift chip');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'Meta',
    modifiers: { meta: false, shift: false, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === true, 'Command keydown should activate shortcut details');
  expect(debug.modifiers.meta === true, 'Command keydown should light the Command modifier chip');

  h.note({
    source: 'host',
    type: 'keyUp',
    key: 'Meta',
    modifiers: { meta: true, shift: false, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === false, 'Command keyup should quiet shortcut details');
  expect(debug.modifiers.meta === false, 'Command keyup should clear the Command modifier chip');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'T',
    modifiers: { meta: true, shift: false, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === true, 'Command+T should activate shortcut details');
  expect(debug.latestKey === 'T', 'Command+T should set T as the latest shortcut key');
  expect(byId('new-session').matchedByCurrentChord, 'Command+T should match the new-session shortcut');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'B',
    modifiers: { meta: true, shift: true, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === true, 'Command+Shift+B should activate shortcut details');
  expect(debug.latestKey === 'B', 'Command+Shift+B should set B as the latest shortcut key');
  expect(debug.modifiers.shift === true, 'Command+Shift+B should light the Shift modifier chip');
  expect(byId('browser-toggle').matchedByCurrentChord, 'Command+Shift+B should match the browser-toggle shortcut');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'T',
    modifiers: { meta: false, shift: false, alt: false, control: true },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.detailsActive === true, 'Control+T should activate shortcut details for display');
  expect(debug.latestKey === 'T', 'Control+T should show T as the latest display key');
  expect(debug.modifiers.control === true, 'Control+T should light the Control modifier chip');
  expect(byId('new-session').matchedByCurrentChord === false, 'Control+T should not match Command+T');

  h.note({
    source: 'host',
    type: 'keyDown',
    key: 'J',
    modifiers: { meta: true, shift: false, alt: false, control: false },
    ts: Date.now(),
  });
  debug = h.debug();
  expect(debug.source === 'host', 'debug source should record host input');
  expect(debug.latestKey === 'J', 'debug latest key should record shortcut key only');
  expect(debug.modifiers.meta === true, 'debug modifier state should record Command');
  expect(byId('queue-next').matchedByCurrentChord, 'current Command+J chord should sort and mark as matched');
  expect(debug.text.includes('app surface') || debug.text.includes('terminal'), 'debug strip should show refined focus context');

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
