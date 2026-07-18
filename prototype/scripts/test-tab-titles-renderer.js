'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-tab-titles-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'tab-titles-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const tabs = window.chromuxTestTabs;
  if (!tabs) throw new Error('Missing tab-title test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const titleOsc = (code, title, term = '\\x07') => '\\x1b]' + code + ';' + title + term;

  await wait(100);

  const tabList = document.querySelector('#tab-list');
  const addButton = document.querySelector('#btn-new-session');
  expect(tabList.firstElementChild === addButton, 'add-session button should be left-aligned when there are no tabs');
  expect(Math.abs(addButton.getBoundingClientRect().left - tabList.getBoundingClientRect().left) < 1,
    'empty add-session button should render at the left edge of the tab strip');

  const first = tabs.addSession({ name: 'launch-a', cwd: '/tmp/chromux-a', agent: 'claude' });
  const firstTab = addButton.previousElementSibling;
  expect(firstTab === tabList.firstElementChild, 'first session tab should be inserted before the add-session button');
  expect(firstTab.nextElementSibling === addButton, 'add-session button should sit directly after the right-most tab');
  expect(Math.abs(addButton.getBoundingClientRect().left - firstTab.getBoundingClientRect().right - 6) < 1,
    'add-session button should render with a 6px gap after the right-most tab');
  expect(tabs.label(first) === 'launch-a', 'new tab should fall back to launch name');
  expect(tabs.tooltip(first).includes('/tmp/chromux-a'), 'fallback tooltip should retain cwd');

  const firstTitle = titleOsc('0', 'Agent: planning build');
  tabs.feed(first, firstTitle + 'visible output');
  expect(tabs.label(first) === 'Agent: planning build', 'OSC 0 should update tab label');
  expect(tabs.terminalTitle(first) === 'Agent: planning build', 'OSC 0 should update terminal title state');
  expect(tabs.tooltip(first).includes('/tmp/chromux-a'), 'dynamic tooltip should retain cwd');
  expect(tabs.tooltip(first).includes('launch-a'), 'dynamic tooltip should retain launch name');
  expect(tabs.written(first).includes(firstTitle), 'title OSC bytes should pass through to terminal output');

  const split = titleOsc('2', 'Split Chunk Title', '\\x1b\\\\');
  tabs.feed(first, split.slice(0, 5));
  expect(tabs.label(first) === 'Agent: planning build', 'partial title OSC should not update label early');
  tabs.feed(first, split.slice(5));
  expect(tabs.label(first) === 'Split Chunk Title', 'split OSC 2 should update label after terminator');

  tabs.feed(first, titleOsc('0', '   \\x00\\t\\r\\n   '));
  expect(tabs.label(first) === 'Split Chunk Title', 'empty sanitized title should be ignored');
  tabs.feed(first, titleOsc('1', '  build\\x00\\t ready \\r\\n now  '));
  expect(tabs.label(first) === 'build ready now', 'title should be sanitized before rendering');

  const active = tabs.addSession({ name: 'active-long', cwd: '/tmp/active', agent: 'codex' });
  const inactive = tabs.addSession({ name: 'inactive-long', cwd: '/tmp/inactive', agent: 'codex' });
  tabs.forceTabWidth(active, 120);
  tabs.forceTabWidth(inactive, 120);
  tabs.feed(active, titleOsc('0', 'Active session title with enough detail to overflow the tab label area'));
  tabs.feed(inactive, titleOsc('0', 'Inactive session title with enough detail to overflow the tab label area'));
  tabs.focus(active);
  await tick();

  let activeState = tabs.state(active);
  let inactiveState = tabs.state(inactive);
  expect(activeState.truncated, 'active long tab should be marked truncated');
  expect(activeState.marquee, 'active truncated tab should marquee');
  expect(!activeState.paused, 'active marquee should not start paused');
  expect(inactiveState.truncated, 'inactive long tab should be marked truncated');
  expect(!inactiveState.marquee, 'inactive tab should not use active marquee');
  expect(!inactiveState.hoverScroll, 'inactive tab should not hover-scroll until hovered');

  tabs.hover(inactive);
  await tick();
  activeState = tabs.state(active);
  inactiveState = tabs.state(inactive);
  expect(activeState.paused, 'hovering a truncated inactive tab should pause active marquee');
  expect(inactiveState.hoverScroll, 'hovered truncated inactive tab should scroll');

  tabs.unhover(inactive);
  await tick();
  activeState = tabs.state(active);
  inactiveState = tabs.state(inactive);
  expect(activeState.marquee && !activeState.paused, 'active marquee should resume after hover ends');
  expect(!inactiveState.hoverScroll, 'inactive hover-scroll should clear after hover ends');

  const short = tabs.addSession({ name: 'short-tab', cwd: '/tmp/short', agent: 'codex' });
  tabs.forceTabWidth(short, 180);
  tabs.feed(short, titleOsc('0', 'short'));
  tabs.focus(active);
  await tick();
  tabs.hover(short);
  await tick();
  activeState = tabs.state(active);
  const shortState = tabs.state(short);
  expect(!shortState.truncated, 'short inactive tab should not be marked truncated');
  expect(!shortState.hoverScroll, 'hovering non-truncated inactive tab should do nothing');
  expect(!activeState.paused, 'hovering non-truncated inactive tab should not pause active marquee');

  return JSON.stringify({
    ok: true,
    firstLabel: tabs.label(first),
    active: tabs.state(active),
    inactive: tabs.state(inactive),
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
    console.error('TAB_TITLES_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('TAB_TITLES_RENDERER_OK');
});
