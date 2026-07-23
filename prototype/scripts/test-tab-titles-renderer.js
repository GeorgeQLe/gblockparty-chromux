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
  const tabActions = document.querySelector('#tab-actions');
  const searchButton = document.querySelector('#btn-search-sessions');
  const addButton = document.querySelector('#btn-new-session');
  const workspace = document.querySelector('#workspace');
  const sessionTabs = document.querySelector('#session-tabs');
  const stage = document.querySelector('#stage');
  expect(tabList.firstElementChild === tabActions, 'sticky tab actions should be the only tab-list item when there are no tabs');
  expect(tabActions.firstElementChild === searchButton && tabActions.lastElementChild === addButton,
    'search should sit immediately before the add-session button');
  expect(Math.abs(searchButton.getBoundingClientRect().left - tabList.getBoundingClientRect().left) < 1,
    'empty search button should render at the left edge of the tab strip');

  const first = tabs.addSession({ name: 'launch-a', cwd: '/tmp/chromux-a', agent: 'claude' });
  const firstTab = tabActions.previousElementSibling;
  expect(firstTab === tabList.firstElementChild, 'first session tab should be inserted before the add-session button');
  expect(firstTab.nextElementSibling === tabActions, 'sticky actions should sit directly after the right-most tab');
  expect(Math.abs(tabActions.getBoundingClientRect().left - firstTab.getBoundingClientRect().right - 6) < 1,
    'search should render with a 6px gap after the right-most tab');
  expect(tabs.label(first) === 'launch-a', 'new tab should fall back to launch name');
  expect(tabs.tooltip(first).includes('/tmp/chromux-a'), 'fallback tooltip should retain cwd');

  const firstTitle = titleOsc('0', 'Agent: planning build');
  tabs.feed(first, firstTitle + 'visible output');
  expect(tabs.label(first) === 'Agent: planning build', 'OSC 0 should update tab label');
  expect(tabs.terminalTitle(first) === 'Agent: planning build', 'OSC 0 should update terminal title state');
  expect(tabs.tooltip(first).includes('/tmp/chromux-a'), 'dynamic tooltip should retain cwd');
  expect(tabs.tooltip(first).includes('launch-a'), 'dynamic tooltip should retain launch name');
  expect(tabs.written(first).includes(firstTitle), 'title OSC bytes should pass through to terminal output');

  for (const frame of ['\u280b', '\u2819', '\u2839', '\u2838']) {
    const raw = frame + ' Codex is working';
    const osc = titleOsc('0', raw);
    tabs.feed(first, osc);
    expect(tabs.terminalTitle(first) === raw, 'raw Braille-prefixed title should remain intact internally');
    expect(tabs.label(first) === 'Codex is working', 'leading Codex Braille frame should be removed from the visible tab label');
    expect(!tabs.tooltip(first).includes(frame), 'leading Codex Braille frame should be removed from the tooltip');
    expect(!tabs.state(first).ariaLabel.includes(frame), 'leading Codex Braille frame should be removed from ARIA');
    expect(tabs.written(first).includes(osc), 'Braille-prefixed OSC bytes should pass through to terminal output');
  }
  tabs.feed(first, titleOsc('0', '\u280b   '));
  expect(tabs.label(first) === 'launch-a', 'spinner-only display title should fall back to launch name');
  tabs.feed(first, titleOsc('0', '\u280bCodex without whitespace'));
  expect(tabs.label(first) === '\u280bCodex without whitespace', 'leading Braille without whitespace should remain legitimate title text');
  tabs.feed(first, titleOsc('0', 'Build \u280b phase'));
  expect(tabs.label(first) === 'Build \u280b phase', 'non-leading Braille symbols should remain unchanged');
  tabs.feed(first, firstTitle);

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
  const activeTab = firstTab.nextElementSibling;
  const inactiveTab = activeTab.nextElementSibling;
  expect(Math.abs(activeTab.getBoundingClientRect().left - firstTab.getBoundingClientRect().right - 6) < 1,
    'neighboring session tabs should render with a 6px gap');
  expect(Math.abs(inactiveTab.getBoundingClientRect().left - activeTab.getBoundingClientRect().right - 6) < 1,
    'every neighboring session tab should retain the 6px gap');
  expect(Math.abs(tabActions.getBoundingClientRect().left - inactiveTab.getBoundingClientRect().right - 6) < 1,
    'sticky actions should retain the same 6px gap as session tabs');
  tabs.forceTabWidth(active, 120);
  tabs.forceTabWidth(inactive, 120);
  tabs.feed(active, titleOsc('0', 'Active session title with enough detail to overflow the tab label area'));
  tabs.feed(inactive, titleOsc('0', 'Inactive session title with enough detail to overflow the tab label area'));
  tabs.unhover(active);
  tabs.unhover(inactive);
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

  searchButton.click();
  const searchPanel = document.querySelector('#session-search-panel');
  const searchInput = document.querySelector('#session-search-input');
  expect(!searchPanel.classList.contains('hidden'), 'search button should open the session search panel');
  expect(searchButton.getAttribute('aria-expanded') === 'true', 'open search should expose its expanded state');
  searchInput.value = '/tmp/inactive';
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  const searchResults = [...document.querySelectorAll('.session-search-result')];
  expect(searchResults.length === 1, 'session search should filter by working directory');
  expect(searchResults[0].textContent.includes('Inactive session title'), 'search result should show the dynamic session title');
  searchResults[0].click();
  expect(tabs.state(inactive).active, 'choosing a search result should activate that session');
  expect(searchPanel.classList.contains('hidden'), 'choosing a search result should close search');

  workspace.style.flex = '0 0 400px';
  workspace.style.width = '400px';
  await tick();
  const listRectAtStart = tabList.getBoundingClientRect();
  const actionsRectAtStart = tabActions.getBoundingClientRect();
  const workspaceRectAtStart = workspace.getBoundingClientRect();
  expect(Math.abs(actionsRectAtStart.right - listRectAtStart.right) < 1,
    'search and add actions should stick to the editor right edge while tabs overflow');
  expect(Math.abs(
    (workspaceRectAtStart.right - actionsRectAtStart.right)
      - (listRectAtStart.left - workspaceRectAtStart.left),
  ) < 1, 'sticky actions should preserve the tab strip margin at the editor right edge');
  tabList.scrollLeft = tabList.scrollWidth;
  await tick();
  const finalTab = tabActions.previousElementSibling;
  const finalTabRect = finalTab.getBoundingClientRect();
  const finalCloseRect = finalTab.querySelector('.tab-x').getBoundingClientRect();
  const actionsRectAtEnd = tabActions.getBoundingClientRect();
  expect(finalTabRect.right <= actionsRectAtEnd.left - 5,
    'right-most session tab should finish before sticky actions at maximum scroll');
  expect(finalCloseRect.right <= actionsRectAtEnd.left,
    'sticky actions should not cover the right-most tab close button at maximum scroll');
  workspace.style.flex = '';
  workspace.style.width = '';
  tabList.scrollLeft = 0;
  await tick();

  const themes = window.chromuxTestThemes;
  expect(themes, 'missing theme test API');
  const expectedStripHeights = {
    blueprint: 51,
    'retro-os': 51,
    streak: 59,
    'liquid-glass': 52,
  };
  const geometry = () => {
    const stripRect = sessionTabs.getBoundingClientRect();
    const listRect = tabList.getBoundingClientRect();
    const stripStyle = getComputedStyle(sessionTabs);
    const tabBottom = Math.max(...[...tabList.children].map((tab) => tab.getBoundingClientRect().bottom));
    const scrollbarHeight = 9;
    const scrollbarTop = listRect.bottom - scrollbarHeight;
    const stripContentBottom = stripRect.bottom - parseFloat(stripStyle.borderBottomWidth || '0');
    return {
      stripHeight: stripRect.height,
      stageTop: stage.getBoundingClientRect().top,
      upperScrollbarGap: scrollbarTop - tabBottom,
      lowerScrollbarGap: stripContentBottom - listRect.bottom,
      overflows: tabList.scrollWidth > tabList.clientWidth,
    };
  };

  const expectCenteredScrollbar = (theme, state, measurements) => {
    expect(Math.abs(measurements.upperScrollbarGap - 3) <= 1,
      theme + ' scrollbar should have a 3px upper gap ' + state
        + '; got ' + measurements.upperScrollbarGap);
    expect(Math.abs(measurements.lowerScrollbarGap - 3) <= 1,
      theme + ' scrollbar should have a 3px lower gap ' + state
        + '; got ' + measurements.lowerScrollbarGap);
  };

  for (const [theme, expectedStripHeight] of Object.entries(expectedStripHeights)) {
    themes.select(theme);
    workspace.style.flex = '';
    workspace.style.width = '';
    await tick();
    const before = geometry();
    expect(!before.overflows, theme + ' tab list should begin without horizontal overflow');
    expect(Math.abs(before.stripHeight - expectedStripHeight) < 1,
      theme + ' tab strip should reserve the expected scrollbar zone');
    expectCenteredScrollbar(theme, 'before overflow', before);

    workspace.style.flex = '0 0 400px';
    workspace.style.width = '400px';
    await tick();
    const during = geometry();
    expect(during.overflows, theme + ' tab list should overflow horizontally at the forced narrow width');
    expectCenteredScrollbar(theme, 'during overflow', during);
    expect(Math.abs(during.stripHeight - before.stripHeight) < 1,
      theme + ' tab strip height should not change when overflow appears');
    expect(Math.abs(during.stageTop - before.stageTop) < 1,
      theme + ' terminal stage should not move when overflow appears');

    workspace.style.flex = '';
    workspace.style.width = '';
    await tick();
    const after = geometry();
    expect(!after.overflows, theme + ' tab list should stop overflowing after width is restored');
    expectCenteredScrollbar(theme, 'after overflow', after);
    expect(Math.abs(after.stripHeight - before.stripHeight) < 1,
      theme + ' tab strip height should remain stable after overflow disappears');
    expect(Math.abs(after.stageTop - before.stageTop) < 1,
      theme + ' terminal stage should return to the same position after overflow disappears');
  }

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
