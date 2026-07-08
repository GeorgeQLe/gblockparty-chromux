'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-hotkey-debug-smoke-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'hotkey-debug-smoke-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

const guestHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>hotkey debug smoke</title></head>
<body>
  <main id="noneditable" tabindex="0">non-editable target</main>
  <input id="field" value="input target" />
  <textarea id="area">textarea target</textarea>
  <div id="edit" contenteditable="true">contenteditable target</div>
</body>
</html>`;
const guestUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(guestHtml);

fs.writeFileSync(e2ePath, `
(async () => {
  const b = window.chromuxTestBrowser;
  const h = window.chromuxTestHotkeys;
  const host = window.chromuxTest;
  if (!b || !h || !host || !host.sendHostInput) throw new Error('Missing hotkey smoke APIs');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (fn, msg, timeout = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        const value = await fn();
        if (value) return value;
      } catch {
        // keep polling
      }
      await wait(50);
    }
    throw new Error(msg);
  };
  const byId = (catalog, id) => catalog.find((item) => item.id === id);

  async function sendHostShortcut(keyCode, modifiers = []) {
    await host.sendHostInput({ type: 'keyDown', keyCode, modifiers });
    await wait(80);
    await host.sendHostInput({ type: 'keyUp', keyCode, modifiers });
    await wait(180);
    b.flushRender();
  }

  async function sendHostCommandProbe() {
    await host.sendHostInput({ type: 'keyDown', keyCode: 'Meta', modifiers: ['meta'] });
    await wait(120);
    const debug = h.debug();
    await host.sendHostInput({ type: 'keyUp', keyCode: 'Meta', modifiers: [] });
    await wait(80);
    return debug;
  }

  async function sendWebviewShortcut(wv, keyCode, modifiers = []) {
    wv.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    await wait(80);
    wv.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(180);
    b.flushRender();
  }

  const guestUrl = ${JSON.stringify(guestUrl)};

  await wait(100);
  const firstId = b.addSession({ name: 'hotkey-first' });
  const secondId = b.addSession({
    name: 'hotkey-queued',
    queue: [{ url: 'http://localhost:5173/from-hotkey-debug', source: 'TEST', ts: 1 }],
  });
  const thirdId = b.addSession({ name: 'hotkey-third' });

  b.focus(firstId);
  const commandOnly = await sendHostCommandProbe();
  expect(commandOnly.source === 'host', 'Command key probe should be received from host window');
  expect(commandOnly.modifiers.meta === true || commandOnly.text.includes('⌘'), 'Command key probe should light the Command modifier');

  await sendHostShortcut('J', ['meta']);
  let debug = h.debug();
  expect(debug.source === 'host', 'Command+J should be received from host window');
  expect(debug.latestKey === 'J', 'Command+J should show J as latest key');
  expect(byId(debug.catalog, 'queue-next').matchedByCurrentChord, 'Command+J should match the queue shortcut');
  expect(b.state(secondId).active, 'host Command+J should activate queued session');

  b.focus(firstId);
  b.restore(firstId);
  await sendHostShortcut('B', ['meta', 'shift']);
  debug = h.debug();
  expect(debug.source === 'host', 'Command+Shift+B should be received from host window');
  expect(debug.latestKey === 'B', 'Command+Shift+B should show B as latest key');
  expect(byId(debug.catalog, 'browser-toggle').matchedByCurrentChord, 'Command+Shift+B should match browser toggle');
  expect(b.state(firstId).collapsed, 'host Command+Shift+B should collapse active browser');

  b.focus(secondId);
  await sendHostShortcut('1', ['meta']);
  debug = h.debug();
  expect(debug.source === 'host', 'Command+1 should be received from host window');
  expect(debug.latestKey === '1', 'Command+1 should show digit as latest key');
  expect(byId(debug.catalog, 'session-1').matchedByCurrentChord, 'Command+1 should match session shortcut');
  expect(b.state(firstId).active, 'host Command+1 should activate first session');

  b.focus(firstId);
  b.restore(firstId);
  b.open(firstId, guestUrl);
  const wv = await waitFor(() => b.webview(firstId), 'webview was not created');
  await waitFor(() => {
    try { return wv.getWebContentsId() > 0; } catch { return false; }
  }, 'webview contents id was not assigned');
  await waitFor(async () => {
    const ready = await wv.executeJavaScript('document.readyState');
    return ready === 'complete' || ready === 'interactive';
  }, 'guest page did not become ready');

  async function focusGuest(selector, editable) {
    b.focus(firstId);
    b.restore(firstId);
    await wait(80);
    wv.focus();
    await wv.executeJavaScript(\`
      (() => {
        const el = document.querySelector(\${JSON.stringify(selector)});
        if (!el) throw new Error('missing guest selector \${selector}');
        el.focus();
        return document.activeElement && document.activeElement.id;
      })();
    \`);
    wv.focus();
    await waitFor(() => document.activeElement === wv, 'embedder did not focus webview for ' + selector);
    if (editable) {
      await waitFor(() => b.guestEditableFocused(firstId), 'guest editable focus was not reported for ' + selector);
    } else {
      await waitFor(() => b.guestEditableFocused(firstId) === false, 'guest non-editable focus reported editable');
    }
  }

  await focusGuest('#noneditable', false);
  await sendWebviewShortcut(wv, 'J', ['meta']);
  debug = h.debug();
  expect(debug.source === 'webview', 'Command+J should be received from webview');
  expect(debug.latestKey === 'J', 'webview Command+J should show J as latest key');
  expect(b.state(secondId).active, 'webview Command+J should activate queued session');

  await focusGuest('#noneditable', false);
  await sendWebviewShortcut(wv, 'B', ['meta', 'shift']);
  debug = h.debug();
  expect(debug.source === 'webview', 'Command+Shift+B should be received from webview');
  expect(debug.latestKey === 'B', 'webview Command+Shift+B should show B as latest key');
  expect(b.state(firstId).collapsed, 'webview Command+Shift+B should collapse the first session browser');

  await focusGuest('#noneditable', false);
  await sendWebviewShortcut(wv, '1', ['meta']);
  debug = h.debug();
  expect(debug.source === 'webview', 'Command+1 should be received from webview');
  expect(debug.latestKey === '1', 'webview Command+1 should show digit as latest key');
  expect(byId(debug.catalog, 'session-1').matchedByCurrentChord, 'webview Command+1 should match session shortcut');

  const editableTargets = ['#field', '#area', '#edit'];
  for (const selector of editableTargets) {
    await focusGuest(selector, true);
    await sendWebviewShortcut(wv, 'J', ['meta']);
    debug = h.debug();
    expect(debug.source === 'webview', 'editable ' + selector + ' should still report webview key source');
    expect(debug.latestKey === 'J', 'editable ' + selector + ' should still report received shortcut key');
    expect(byId(debug.catalog, 'queue-next').disabledReason === 'guest editable', 'Command+J should show guest editable suppression for ' + selector);
    expect(byId(debug.catalog, 'browser-toggle').disabledReason === 'guest editable', 'Command+Shift+B should show guest editable suppression for ' + selector);
    expect(byId(debug.catalog, 'session-1').disabledReason === 'guest editable', 'Command+1 should show guest editable suppression for ' + selector);
    expect(b.state(firstId).active, 'editable ' + selector + ' should suppress Command+J activation');
  }

  return JSON.stringify({
    ok: true,
    hostSource: true,
    webviewSource: true,
    guestEditableSuppressed: true,
    thirdId,
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
}, 40000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('HOTKEY_DEBUG_SMOKE_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('HOTKEY_DEBUG_SMOKE_OK');
});
