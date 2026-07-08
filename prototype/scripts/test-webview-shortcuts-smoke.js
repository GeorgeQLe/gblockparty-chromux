'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-webview-shortcuts-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'webview-shortcuts-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

const guestHtml = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>webview shortcut smoke</title></head>
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
  if (!b || !h) throw new Error('Missing browser / hotkey test API');
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

  const guestUrl = ${JSON.stringify(guestUrl)};

  await wait(100);

  const firstId = b.addSession({ name: 'webview-shortcut-host' });
  const secondId = b.addSession({
    name: 'queued-preview',
    queue: [{ url: 'http://localhost:5173/from-webview-shortcut', source: 'TEST', ts: 1 }],
  });
  const thirdId = b.addSession({ name: 'third-session' });

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

  async function sendShortcut(keyCode, modifiers) {
    wv.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wv.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await wait(180);
    b.flushRender();
  }

  await focusGuest('#noneditable', false);
  await sendShortcut('T', ['meta']);
  expect(h.newModalOpen(), 'Command+T from non-editable guest focus should open the new session modal');
  h.closeModals();

  await focusGuest('#noneditable', false);
  await sendShortcut('D', ['meta']);
  expect(h.detectModalOpen(), 'Command+D from non-editable guest focus should open the detect modal');
  h.closeModals();

  await focusGuest('#noneditable', false);
  await sendShortcut('J', ['meta']);
  expect(b.state(secondId).active, 'Command+J from non-editable guest focus should activate queued session');
  expect(b.state(secondId).queuePanelHidden === false, 'Command+J from guest focus should reveal queued preview controls');

  await focusGuest('#noneditable', false);
  expect(b.state(firstId).collapsed === false, 'first session should start restored before Command+Shift+B');
  await sendShortcut('B', ['meta', 'shift']);
  expect(b.state(firstId).collapsed === true, 'Command+Shift+B from non-editable guest focus should collapse browser');

  await focusGuest('#noneditable', false);
  await sendShortcut('3', ['meta']);
  expect(b.state(thirdId).active, 'Command+3 from non-editable guest focus should activate third session');

  const editableTargets = ['#field', '#area', '#edit'];
  for (const selector of editableTargets) {
    await focusGuest(selector, true);
    await sendShortcut('J', ['meta']);
    expect(b.state(firstId).active, 'Command+J should be suppressed while guest editable is focused: ' + selector);
    expect(b.state(firstId).collapsed === false, 'Command+J suppression should not change collapse state: ' + selector);

    await sendShortcut('B', ['meta', 'shift']);
    expect(b.state(firstId).active, 'Command+Shift+B suppression should keep active session: ' + selector);
    expect(b.state(firstId).collapsed === false, 'Command+Shift+B should be suppressed while guest editable is focused: ' + selector);

    await sendShortcut('3', ['meta']);
    expect(b.state(firstId).active, 'Command+3 should be suppressed while guest editable is focused: ' + selector);

    await sendShortcut('T', ['meta']);
    expect(h.newModalOpen() === false, 'Command+T should be suppressed while guest editable is focused: ' + selector);

    await sendShortcut('D', ['meta']);
    expect(h.detectModalOpen() === false, 'Command+D should be suppressed while guest editable is focused: ' + selector);
  }

  return JSON.stringify({
    ok: true,
    activeThirdAfterNonEditable: b.state(thirdId).active,
    guestEditableSuppressed: true,
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
    console.error('WEBVIEW_SHORTCUTS_SMOKE_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('WEBVIEW_SHORTCUTS_SMOKE_OK');
});
