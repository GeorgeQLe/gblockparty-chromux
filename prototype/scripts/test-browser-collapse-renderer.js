'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-browser-collapse-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'browser-collapse-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const b = window.chromuxTestBrowser;
  if (!b) throw new Error('Missing browser collapse test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  await new Promise((resolve) => setTimeout(resolve, 100));

  const firstId = b.addSession({
    name: 'first-browser',
    url: 'http://localhost:5173/current',
    queue: [{ url: 'http://localhost:5173/queued', source: 'TEST', ts: 1 }],
  });
  const secondId = b.addSession({
    name: 'second-browser',
    url: 'http://localhost:4173/other',
  });
  const linkId = b.addSession({ name: 'terminal-link-browser' });

  b.focus(firstId);
  let first = b.state(firstId);
  expect(first.collapsed, 'new sessions should start with the paired browser shut');
  expect(first.collapseText === 'BROWSER', 'shut browser rail should expose BROWSER (open)');
  expect(first.collapseTitle === 'Open paired browser (⌘⇧B)', 'shut browser title should say open: ' + first.collapseTitle);
  expect(first.collapseAriaLabel === first.collapseTitle, 'shut browser rail should expose its open action accessibly');
  expect(first.grid.includes('40px'), 'new session should start on the 40px browser rail, got ' + first.grid);
  expect(first.railWidth === 40, 'browser rail should remain exactly 40px wide, got ' + first.railWidth);
  expect(first.toggleSpansRail, 'BROWSER toggle should span the full rail: ' + JSON.stringify(first));
  expect(first.toggleContentCenterDelta <= 1,
    'BROWSER toggle content should be vertically centered in the rail: ' + JSON.stringify(first));
  expect(first.railAtFarRight, "browser rail should be the pane's far-right child");
  expect(first.railAfterContent, 'browser content and rail should be siblings with the rail last');
  expect(!first.toggleInToolbar, 'browser toggle should not live in the scrolling toolbar');
  expect(first.openIconPresent, 'shut browser rail should include the panel-open icon');
  expect(first.openIconAriaHidden, 'panel-open icon should be hidden from assistive technology');

  b.restore(firstId);
  b.narrow(firstId, 285);
  first = b.state(firstId);
  expect(!first.collapsed, 'restore should open the paired browser for narrow toolbar checks');
  expect(first.toolbarOverflow, 'narrow browser toolbar should horizontally overflow');
  expect(first.toolbarScrollbarWidth === 'none', 'browser toolbar scrollbar should be hidden, got ' + first.toolbarScrollbarWidth);
  expect(first.toolbarLastControl === '⚡ CAPTURE', "Capture should be the toolbar's final control, got " + first.toolbarLastControl);
  b.scrollCaptureIntoView(firstId);
  await tick();
  first = b.state(firstId);
  expect(first.captureReachable, 'capture control should be reachable by horizontal scroll: ' + JSON.stringify(first));

  b.collapse(firstId);
  await tick();
  first = b.state(firstId);
  expect(first.collapsed, 'collapse should mark first session collapsed');
  expect(first.webCollapsed, 'collapse should apply collapsed web pane class');
  expect(first.webHostHidden, 'collapse should hide browser content area without clearing state');
  expect(first.dividerDisabled, 'divider should be disabled while browser is collapsed');
  expect(first.grid.includes('40px'), 'collapsed grid should leave a 40px browser rail, got ' + first.grid);
  expect(first.railWidth === 40, 'collapsed browser rail should remain exactly 40px wide');
  expect(first.collapseText === 'BROWSER', 'collapsed rail should expose browser button');
  expect(first.collapseTitle === 'Open paired browser (⌘⇧B)', 'browser button should have open title');
  expect(first.collapseAriaLabel === first.collapseTitle, 'browser button should retain its accessible open name');
  expect(first.openIconPresent && first.openIconAriaHidden, 'collapsed rail should retain its decorative panel-open icon');
  expect(first.currentUrl === 'http://localhost:5173/current', 'collapse must preserve current URL');
  expect(first.urlBar === 'http://localhost:5173/current', 'collapse must preserve URL bar');
  expect(first.queueCount === 1, 'collapse must preserve queue state');
  expect(first.fitCount > 0, 'collapse should refit terminal');

  b.focus(secondId);
  let second = b.state(secondId);
  expect(second.collapsed, 'second session should also start shut (per-session default)');
  b.focus(firstId);
  first = b.state(firstId);
  expect(first.collapsed, 'switching tabs should preserve first session collapse state');

  b.restore(firstId);
  await tick();
  first = b.state(firstId);
  expect(!first.collapsed, 'restore should clear collapsed state');
  expect(!first.webCollapsed, 'restore should show web pane');
  expect(!first.webHostHidden, 'restore should show browser content area');
  expect(!first.dividerDisabled, 'restore should re-enable divider');
  expect(first.grid.includes('285px'), 'restore should keep the previous split width, got ' + first.grid);
  expect(first.collapseText === 'COLLAPSE', 'open browser should expose COLLAPSE (shut) button');
  expect(first.collapseTitle === 'Shut paired browser (⌘⇧B)', 'open browser title should say shut');
  expect(first.collapseAriaLabel === first.collapseTitle, 'open browser rail should expose its shut action accessibly');
  expect(first.railWidth === 40 && first.railAtFarRight, 'open browser rail should stay 40px at the far-right edge');
  expect(first.toggleSpansRail, 'COLLAPSE toggle should span the full rail: ' + JSON.stringify(first));
  expect(first.toggleContentCenterDelta <= 1,
    'COLLAPSE toggle content should be vertically centered in the rail: ' + JSON.stringify(first));
  expect(!first.openIconPresent, 'open-state COLLAPSE rail should not show the panel-open icon');
  expect(first.currentUrl === 'http://localhost:5173/current', 'restore must preserve current URL');
  expect(first.queueCount === 1, 'restore must preserve queue state');

  const shortcutCollapsed = b.shortcutToggle();
  await tick();
  first = b.state(firstId);
  expect(shortcutCollapsed && shortcutCollapsed.sessionId === firstId, 'Command+Shift+B should target active session');
  expect(shortcutCollapsed.collapsed === true, 'Command+Shift+B should report collapsed state');
  expect(first.collapsed, 'Command+Shift+B should shut the active paired browser');

  const shortcutRestored = b.shortcutToggle();
  await tick();
  first = b.state(firstId);
  expect(shortcutRestored && shortcutRestored.sessionId === firstId, 'second Command+Shift+B should target active session');
  expect(shortcutRestored.collapsed === false, 'second Command+Shift+B should report open state');
  expect(!first.collapsed, 'second Command+Shift+B should open the active paired browser');
  expect(first.currentUrl === 'http://localhost:5173/current', 'shortcut open must preserve current URL');
  expect(first.queueCount === 1, 'shortcut open must preserve queue state');

  // Explicit open restores a shut browser without clearing URL/queue.
  b.collapse(firstId);
  b.open(firstId, 'http://localhost:5173/approved');
  await tick();
  first = b.state(firstId);
  expect(!first.collapsed, 'opening a URL should restore a shut browser');
  expect(first.currentUrl === 'http://localhost:5173/approved', 'open should navigate the paired pane');

  // A normal terminal link click opens in the paired pane without a modifier.
  const prevented = b.clickTerminalLink(linkId, 'http://localhost:5173/from-terminal-link');
  const linkBrowser = b.state(linkId);
  expect(prevented, 'terminal link activation should consume the click');
  expect(!linkBrowser.collapsed, 'terminal link click should restore the paired browser');
  expect(linkBrowser.currentUrl === 'http://localhost:5173/from-terminal-link',
    'terminal link click should navigate the paired browser');
  expect(first.queueCount === 1, 'open must preserve queue state');

  return JSON.stringify({
    ok: true,
    firstCollapsed: first.collapsed,
    firstQueue: first.queueCount,
    secondCollapsed: second.collapsed,
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
    console.error('BROWSER_COLLAPSE_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('BROWSER_COLLAPSE_RENDERER_OK');
});
