'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-themes-'));
const e2ePath = path.join(tmpDir, 'themes-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.writeFileSync(e2ePath, `
(async () => {
  const themes = window.chromuxTestThemes;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const expected = ['blueprint', 'retro-os', 'streak', 'liquid-glass'];
  const expectedWindowButtonY = { blueprint: 14, 'retro-os': 22, streak: 19, 'liquid-glass': 22 };
  const modes = ['light', 'dark'];
  const terminalPalettes = {
    'blueprint-light': { background: '#f4f9ff', foreground: '#173b62', cursor: '#006d9c', black: '#173b62', brightBlack: '#6684a3', red: '#a33a2c', brightRed: '#d45747', green: '#13764d', brightGreen: '#239b68', yellow: '#8a5b00', brightYellow: '#b77c0e', blue: '#006d9c', brightBlue: '#218fc0', magenta: '#674fa3', brightMagenta: '#8b70c7', cyan: '#08758a', brightCyan: '#2699ad', white: '#dbe9f6', brightWhite: '#ffffff' },
    'blueprint-dark': { background: '#061b38', foreground: '#dceeff', cursor: '#7fd8ff', black: '#082346', brightBlack: '#527ca7', red: '#ff9d86', brightRed: '#ffc0af', green: '#8af0bd', brightGreen: '#b7ffd9', yellow: '#ffd88f', brightYellow: '#ffe8bd', blue: '#7fd8ff', brightBlue: '#b8eaff', magenta: '#c6adff', brightMagenta: '#e0d2ff', cyan: '#8fe7f5', brightCyan: '#c6f6ff', white: '#dceeff', brightWhite: '#ffffff' },
    'retro-os-light': { background: '#ffffff', foreground: '#141414', cursor: '#30309a', black: '#141414', brightBlack: '#666666', red: '#9b1c1c', brightRed: '#d6393b', green: '#1f7a34', brightGreen: '#37b24d', yellow: '#a05a00', brightYellow: '#e8940a', blue: '#30309a', brightBlue: '#5656c7', magenta: '#7d2c85', brightMagenta: '#a94eb3', cyan: '#0b6a7d', brightCyan: '#18a5c0', white: '#d0d0d0', brightWhite: '#ffffff' },
    'retro-os-dark': { background: '#101214', foreground: '#eeeeee', cursor: '#9c9cff', black: '#101214', brightBlack: '#777b80', red: '#ff8585', brightRed: '#ffaaaa', green: '#79d990', brightGreen: '#a4edb4', yellow: '#e8b45a', brightYellow: '#f5d28f', blue: '#9c9cff', brightBlue: '#c0c0ff', magenta: '#d58bdc', brightMagenta: '#ebb4ef', cyan: '#72ccd9', brightCyan: '#a4e5ed', white: '#d6d6d6', brightWhite: '#ffffff' },
    'streak-light': { background: '#f7fbff', foreground: '#293244', cursor: '#3f9b00', black: '#293244', brightBlack: '#748096', red: '#c83c3c', brightRed: '#e85c5c', green: '#3f9b00', brightGreen: '#58cc02', yellow: '#9a6900', brightYellow: '#cc9100', blue: '#087eae', brightBlue: '#1cb0f6', magenta: '#8d4eb4', brightMagenta: '#b16bda', cyan: '#087f6b', brightCyan: '#20ad94', white: '#dce5ee', brightWhite: '#ffffff' },
    'streak-dark': { background: '#172033', foreground: '#f7fbff', cursor: '#58cc02', black: '#172033', brightBlack: '#62708a', red: '#ff5d5d', brightRed: '#ff8b8b', green: '#58cc02', brightGreen: '#8ee83f', yellow: '#ffc800', brightYellow: '#ffe45c', blue: '#1cb0f6', brightBlue: '#70d2ff', magenta: '#ce82ff', brightMagenta: '#e1b3ff', cyan: '#49e5c2', brightCyan: '#94f3de', white: '#dfe8f5', brightWhite: '#ffffff' },
    'liquid-glass-light': { background: '#f7faff', foreground: '#172231', cursor: '#0f86b3', black: '#172231', brightBlack: '#637188', red: '#b83c31', brightRed: '#df5a4d', green: '#137c55', brightGreen: '#26a874', yellow: '#8a5c08', brightYellow: '#bd8215', blue: '#0f78a0', brightBlue: '#199dcc', magenta: '#6656b8', brightMagenta: '#8979dc', cyan: '#0d7886', brightCyan: '#28a2b1', white: '#dbe5f2', brightWhite: '#ffffff' },
    'liquid-glass-dark': { background: '#111827', foreground: '#e7edf7', cursor: '#23b7ec', black: '#111827', brightBlack: '#56647a', red: '#ef6a5c', brightRed: '#ff958a', green: '#35c98c', brightGreen: '#72e0b3', yellow: '#e3a02d', brightYellow: '#f3c86f', blue: '#23b7ec', brightBlue: '#71d8ff', magenta: '#9587f4', brightMagenta: '#c0b7ff', cyan: '#52d7e8', brightCyan: '#94eef8', white: '#dbe5f2', brightWhite: '#ffffff' },
  };
  const rgb = (value) => {
    const channels = value.match(/[\\d.]+/g);
    if (!channels || channels.length < 3) throw new Error('unparseable color: ' + value);
    return channels.slice(0, 3).map(Number);
  };
  const luminance = (value) => rgb(value)
    .map((channel) => {
      const normalized = channel / 255;
      return normalized <= .04045 ? normalized / 12.92 : Math.pow((normalized + .055) / 1.055, 2.4);
    })
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  };
  const alpha = (value) => {
    const channels = value.match(/[\\d.]+/g);
    if (!channels || channels.length < 3) throw new Error('unparseable color: ' + value);
    return channels.length >= 4 ? Number(channels[3]) : 1;
  };
  const expectContrast = (element, label) => {
    const style = getComputedStyle(element);
    const ratio = contrast(style.color, style.backgroundColor);
    expect(ratio >= 4.5, label + ' contrast should meet WCAG AA; got ' + ratio.toFixed(2) + ' from ' + style.color + ' on ' + style.backgroundColor);
  };
  const expectContrastOn = (element, background, label) => {
    const foreground = getComputedStyle(element).color;
    const ratio = contrast(foreground, background);
    expect(ratio >= 4.5, label + ' contrast should meet WCAG AA; got ' + ratio.toFixed(2) + ' from ' + foreground + ' on ' + background);
  };

  const fixtures = document.createElement('div');
  fixtures.innerHTML = [
    '<button class="head-btn armed">ARMED</button>',
    '<button class="nav-btn favorite-btn armed">★</button>',
    '<span class="q-badge">2</span>',
    '<span class="shortcut-chip matched">MATCHED</span>',
    '<button class="session-tab active">ACTIVE</button>',
    '<div class="xterm"><textarea class="xterm-helper-textarea"></textarea></div>',
  ].join('');
  document.body.appendChild(fixtures);
  const attentionEmptyFixture = document.createElement('div');
  attentionEmptyFixture.className = 'attention-empty';
  document.querySelector('#attention-list').appendChild(attentionEmptyFixture);

  const realTerminalHost = document.createElement('div');
  realTerminalHost.className = 'term-host';
  realTerminalHost.style.cssText = 'position:fixed;left:20px;top:120px;width:420px;height:180px;z-index:10000;background:var(--bg0)';
  document.body.appendChild(realTerminalHost);
  const realTerminal = new Terminal({
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: 12.5,
    lineHeight: 1.25,
    scrollback: 200,
    theme: terminalPalettes['liquid-glass-light'],
  });
  const realFitAddon = new FitAddon.FitAddon();
  realTerminal.loadAddon(realFitAddon);
  realTerminal.open(realTerminalHost);
  realFitAddon.fit();
  await new Promise((resolve) => realTerminal.write(
    Array.from({ length: realTerminal.rows + 30 }, (_, index) => 'scrollback line ' + index + '\\r\\n').join(''),
    resolve,
  ));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const realHelper = realTerminalHost.querySelector('.xterm-helper-textarea');
  const realViewport = realTerminalHost.querySelector('.xterm-viewport');
  const realScreen = realTerminalHost.querySelector('.xterm-screen');
  expect(realHelper instanceof HTMLTextAreaElement, 'real xterm should create its helper textarea');
  expect(realTerminal.buffer.active.baseY > 0, 'real xterm should retain written scrollback rows');
  expect(realViewport.scrollHeight > realViewport.clientHeight, 'real xterm should render scrollback in a scrollable viewport');

  const terminalGeometry = () => ({
    cols: realTerminal.cols,
    rows: realTerminal.rows,
    hostWidth: realTerminalHost.getBoundingClientRect().width,
    hostHeight: realTerminalHost.getBoundingClientRect().height,
    viewportWidth: realViewport.getBoundingClientRect().width,
    screenWidth: realScreen.getBoundingClientRect().width,
    gutter: realViewport.getBoundingClientRect().right - realScreen.getBoundingClientRect().right,
  });
  const assertRealTerminalPresentation = (theme, mode) => {
    const label = theme + ' ' + mode;
    const before = terminalGeometry();
    expect(before.gutter > 0, label + ' real xterm should retain a nonzero scrollbar gutter; got ' + before.gutter);
    realTerminal.focus();
    expect(document.activeElement === realHelper, label + ' should focus the actual xterm helper textarea');
    const helperStyle = getComputedStyle(realHelper);
    expect(helperStyle.backgroundColor === 'rgba(0, 0, 0, 0)', label + ' focused xterm helper background should be transparent; got ' + helperStyle.backgroundColor);
    expect(helperStyle.color === 'rgba(0, 0, 0, 0)', label + ' focused xterm helper text should be transparent; got ' + helperStyle.color);
    expect(helperStyle.borderTopWidth === '0px' && helperStyle.borderRightWidth === '0px' && helperStyle.borderBottomWidth === '0px' && helperStyle.borderLeftWidth === '0px', label + ' focused xterm helper should have zero border');
    expect(helperStyle.paddingTop === '0px' && helperStyle.paddingRight === '0px' && helperStyle.paddingBottom === '0px' && helperStyle.paddingLeft === '0px', label + ' focused xterm helper should have zero padding');
    expect(helperStyle.marginTop === '0px' && helperStyle.marginRight === '0px' && helperStyle.marginBottom === '0px' && helperStyle.marginLeft === '0px', label + ' focused xterm helper should have zero margin');
    expect(helperStyle.outlineStyle === 'none', label + ' focused xterm helper should have no outline; got ' + helperStyle.outlineStyle);
    expect(helperStyle.boxShadow === 'none', label + ' focused xterm helper should have no shadow; got ' + helperStyle.boxShadow);
    expect(helperStyle.resize === 'none', label + ' focused xterm helper should have no resize affordance');
    expect(helperStyle.appearance === 'none', label + ' focused xterm helper should disable native textarea appearance; got ' + helperStyle.appearance);
    let typed = '';
    const disposable = realTerminal.onData((data) => { typed += data; });
    realTerminal.input('x');
    disposable.dispose();
    expect(typed === 'x', label + ' focused real xterm should still accept keyboard input');
    const after = terminalGeometry();
    expect(JSON.stringify(after) === JSON.stringify(before), label + ' focus and typing should preserve terminal dimensions and scrollbar gutter; before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));
  };

  themes.reset();
  expect(!document.querySelector('.brand-sub'), 'top header should not render the Agent Cockpit badge');
  expect(document.querySelector('.brand-mark use')?.getAttribute('href') === '#chromux-mark', 'header should use the canonical Chromux mark');
  expect(document.querySelector('.empty-mark use')?.getAttribute('href') === '#chromux-mark', 'starting screen should use the canonical Chromux mark');
  expect(JSON.stringify(themes.ids()) === JSON.stringify(expected), 'all four theme ids should be registered');
  expect(JSON.stringify(themes.modes()) === JSON.stringify(modes), 'light and dark modes should be registered');
  expect(themes.current() === 'liquid-glass', 'liquid glass should be the default theme');
  expect(themes.bodyTheme() === 'liquid-glass', 'default theme should be applied to the body');
  expect(themes.currentMode() === 'light', 'light should be the default theme mode');
  expect(themes.bodyMode() === 'light', 'default theme mode should be applied to the body');
  expect(JSON.stringify(themes.selectedCards()) === JSON.stringify(['liquid-glass']), 'exactly one default card should be selected');
  expect(JSON.stringify(themes.selectedModes()) === JSON.stringify(['light']), 'exactly one default mode should be selected; got ' + JSON.stringify(themes.selectedModes()));

  const contextMenuSessionId = await themes.addContextMenuSession();
  const contextMenuTab = themes.sessionTab(contextMenuSessionId);
  expect(contextMenuTab instanceof HTMLButtonElement, 'context-menu coverage should use a real session tab');

  const terminalIds = [
    themes.addTerminalSession({ rows: 17, content: 'first prompt', inputBuffer: 'typed input', focused: true, turnState: 'working' }),
    themes.addTerminalSession({ rows: 29, content: 'second prompt', inputBuffer: 'other input', focused: false, turnState: 'needsInput' }),
  ];
  const incompleteTerminalId = themes.addTerminalSession({ complete: false, content: 'mock prompt', inputBuffer: 'mock input' });
  const disposedTerminalId = themes.addTerminalSession({ disposed: true, content: 'disposed prompt', inputBuffer: 'disposed input' });
  const assertTerminalSync = (theme, mode) => {
    const expectedPalette = terminalPalettes[theme + '-' + mode];
    for (const id of terminalIds) {
      const terminal = themes.terminalSession(id);
      const palette = terminal.assignments.at(-1);
      for (const [key, value] of Object.entries(expectedPalette)) {
        expect(palette?.[key] === value, theme + ' ' + mode + ' terminal ' + id + ' should assign ' + key + '; got ' + palette?.[key]);
      }
      expect(JSON.stringify(terminal.refreshes.at(-1)) === JSON.stringify([0, terminal.rows - 1]), theme + ' ' + mode + ' terminal ' + id + ' should refresh its full viewport');
      expect(terminal.distinctAssignments === terminal.assignments.length, theme + ' ' + mode + ' terminal ' + id + ' should receive a fresh palette object');
    }
    const incomplete = themes.terminalSession(incompleteTerminalId);
    expect(incomplete.assignments.length === 0 && incomplete.refreshes.length === 0, 'incomplete terminal sessions should be ignored');
    const disposed = themes.terminalSession(disposedTerminalId);
    expect(disposed.assignments.length === 0 && disposed.refreshes.length === 0, 'disposed terminal sessions should be ignored');
  };

  for (const theme of expected) {
    themes.clearTerminalEvents();
    themes.select(theme);
    expect(JSON.stringify(themes.windowButtonPosition()) === JSON.stringify({ x: 14, y: expectedWindowButtonY[theme] }), theme + ' should vertically center native window controls; got ' + JSON.stringify(themes.windowButtonPosition()));
    assertTerminalSync(theme, 'light');
    themes.selectMode('dark');
    expect(JSON.stringify(themes.windowButtonPosition()) === JSON.stringify({ x: 14, y: expectedWindowButtonY[theme] }), theme + ' mode switching should preserve the native window-control position');
    assertTerminalSync(theme, 'dark');
    themes.selectMode('light');
    assertTerminalSync(theme, 'light');
  }
  for (const id of [...terminalIds, incompleteTerminalId, disposedTerminalId]) {
    const terminal = themes.terminalSession(id);
    expect(terminal.content.includes('prompt'), 'theme switching should preserve terminal contents for ' + id);
    expect(terminal.inputBuffer.includes('input'), 'theme switching should preserve typed input for ' + id);
  }
  expect(themes.terminalSession(terminalIds[0]).focused, 'theme switching should preserve terminal focus');
  expect(themes.terminalSession(terminalIds[0]).turnState === 'working', 'theme switching should preserve working session state');
  expect(themes.terminalSession(terminalIds[1]).turnState === 'needsInput', 'theme switching should preserve input-required session state');

  for (const theme of expected) {
    for (const mode of modes) {
      expect(themes.select(theme) === theme, theme + ' should be selectable');
      expect(themes.selectMode(mode) === mode, theme + ' ' + mode + ' mode should be selectable');
      expect(themes.bodyTheme() === theme, theme + ' should update the body theme');
      expect(themes.bodyMode() === mode, mode + ' should update the body mode');
      expect(themes.stored() === theme, theme + ' should persist to localStorage');
      expect(themes.storedMode() === mode, mode + ' should persist to localStorage');
      expect(document.documentElement.style.colorScheme === mode, mode + ' should set the document color scheme');
      expect(JSON.stringify(themes.selectedCards()) === JSON.stringify([theme]), theme + ' should be the only pressed card');
      expect(JSON.stringify(themes.selectedModes()) === JSON.stringify([mode]), mode + ' should be the only pressed mode');
      expectContrast(document.querySelector('#settings-check-updates'), theme + ' ' + mode + ' primary button');
      expectContrast(document.querySelector('[data-theme-option="' + theme + '"] .theme-check'), theme + ' ' + mode + ' selected-theme check');
      assertRealTerminalPresentation(theme, mode);

      contextMenuTab.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 40,
        clientY: 40,
      }));
      const contextMenu = document.querySelector('.session-menu');
      expect(contextMenu, theme + ' ' + mode + ' synthetic right-click should open the real tab menu');
      const menuBackground = getComputedStyle(contextMenu).backgroundColor;
      const expectedForeground = mode === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
      expect(alpha(menuBackground) === 1, theme + ' ' + mode + ' context-menu background alpha should be exactly 1; got ' + menuBackground);
      const items = [...contextMenu.querySelectorAll('.session-menu-item')];
      expect(items.length >= 3, theme + ' ' + mode + ' menu should include duplicate, cross-agent, and close actions');
      for (const [index, item] of items.entries()) {
        const label = item.querySelector('.smi-label');
        const detail = item.querySelector('.smi-detail');
        expect(getComputedStyle(label).color === expectedForeground, theme + ' ' + mode + ' menu label ' + index + ' should use ' + expectedForeground);
        expect(getComputedStyle(detail).color === expectedForeground, theme + ' ' + mode + ' menu detail ' + index + ' should use ' + expectedForeground);
        expectContrastOn(label, menuBackground, theme + ' ' + mode + ' menu label ' + index);
        expectContrastOn(detail, menuBackground, theme + ' ' + mode + ' menu detail ' + index);
      }
    }
  }
  const captureNotesStyle = getComputedStyle(document.querySelector('#cap-notes'));
  expect(captureNotesStyle.backgroundColor !== 'rgba(0, 0, 0, 0)', 'capture notes textarea should retain a visible form background');
  expect(captureNotesStyle.borderTopWidth === '1px', 'capture notes textarea should retain its form border');
  expect(parseFloat(captureNotesStyle.paddingLeft) > 0, 'capture notes textarea should retain form padding');
  expect(captureNotesStyle.resize === 'vertical', 'capture notes textarea should retain vertical resize styling');

  themes.select('blueprint');
  themes.selectMode('dark');
  expectContrast(document.querySelector('#btn-update-ready'), 'blueprint update-ready button');
  expectContrast(fixtures.querySelector('.head-btn.armed'), 'blueprint armed header button');
  expectContrast(fixtures.querySelector('.favorite-btn.armed'), 'blueprint armed favorite button');
  expectContrast(fixtures.querySelector('.q-badge'), 'blueprint queue badge');
  expectContrast(fixtures.querySelector('.shortcut-chip.matched'), 'blueprint matched shortcut chip');

  expect(themes.select('streak') === 'streak', 'streak should remain selectable after interaction styles load; got ' + themes.current());
  themes.selectMode('light');
  expect(document.body.matches('body[data-theme="streak"][data-theme-mode="light"]'), 'streak light should be applied before interaction checks; got ' + themes.bodyTheme() + ' ' + themes.bodyMode());
  const styleRules = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule) => rule.type === CSSRule.STYLE_RULE);
  const streakHoverRule = styleRules.find((rule) => rule.selectorText?.includes('.top-btn:not(:disabled):hover'));
  const streakPressRule = styleRules.find((rule) => rule.selectorText?.includes('.top-btn:not(:disabled):active'));
  expect(streakHoverRule?.style.transform === 'translateY(1px)', 'streak buttons should move halfway down on hover');
  expect(streakHoverRule?.style.borderBottomWidth === '3px', 'streak buttons should retain half their tactile edge on hover');
  expect(streakPressRule?.style.transform === 'translateY(2px)', 'streak buttons should move fully down while pressed');
  expect(streakPressRule?.style.borderBottomWidth === '2px', 'streak buttons should flatten their tactile edge while pressed');
  for (const selector of ['.qi-btn:not(:disabled):hover', '.session-tab:not(:disabled):hover', '.theme-card:not(:disabled):hover']) {
    expect(streakHoverRule?.selectorText.includes(selector), selector + ' should share the streak half-press interaction');
  }
  for (const selector of ['.qi-btn:not(:disabled):active', '.session-tab:not(:disabled):active', '.theme-card:not(:disabled):active']) {
    expect(streakPressRule?.selectorText.includes(selector), selector + ' should share the streak press interaction');
  }
  expectContrast(document.querySelector('#settings-theme-current'), 'streak current-theme badge');
  expectContrast(fixtures.querySelector('.session-tab.active'), 'streak active session tab');
  expectContrast(fixtures.querySelector('.q-badge'), 'streak queue badge');
  themes.selectMode('dark');
  expectContrast(fixtures.querySelector('.session-tab.active'), 'streak dark active session tab');
  document.querySelector('#attention-list').appendChild(attentionEmptyFixture);
  const attentionHeadingLeft = document.querySelector('.rail-head .microlabel').getBoundingClientRect().left;
  const attentionEmptyLeft = attentionEmptyFixture.getBoundingClientRect().left;
  expect(Math.abs(attentionHeadingLeft - attentionEmptyLeft) <= 1, 'streak attention heading should align with the empty queue card; got ' + attentionHeadingLeft + ' vs ' + attentionEmptyLeft);
  const settingsHeight = document.querySelector('#btn-settings').getBoundingClientRect().height;
  const gaugeHeight = document.querySelector('.gauge').getBoundingClientRect().height;
  expect(Math.abs(settingsHeight - gaugeHeight) <= 1, 'streak settings button should match header gauge height; got ' + settingsHeight + ' vs ' + gaugeHeight);
  expect(getComputedStyle(document.querySelector('#stage')).marginLeft === '12px', 'streak stage should have a left gutter beside the attention rail');

  const helperStyle = getComputedStyle(fixtures.querySelector('.xterm-helper-textarea'));
  expect(helperStyle.paddingLeft === '0px' && helperStyle.paddingRight === '0px', 'xterm helper input should retain zero horizontal padding');
  expect(helperStyle.borderLeftWidth === '0px' && helperStyle.borderRightWidth === '0px', 'xterm helper input should retain zero horizontal border');
  expect(helperStyle.resize === 'none', 'xterm helper input should not expose a resize control over the terminal scrollbar');

  let rejected = false;
  try { themes.select('unknown-theme'); } catch { rejected = true; }
  expect(rejected, 'unknown themes should be rejected');
  let modeRejected = false;
  try { themes.selectMode('unknown-mode'); } catch { modeRejected = true; }
  expect(modeRejected, 'unknown theme modes should be rejected');
  localStorage.removeItem('chromux.themeMode');
  localStorage.setItem('chromux.theme', 'blueprint');
  expect(themes.modeFromStorage() === 'dark', 'legacy Blueprint selection should migrate to dark mode');
  localStorage.setItem('chromux.theme', 'liquid-glass');
  expect(themes.modeFromStorage() === 'light', 'legacy non-Blueprint selections should migrate to light mode');
  themes.reset();
  realTerminal.dispose();
  realTerminalHost.remove();
  attentionEmptyFixture.remove();
  fixtures.remove();
  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: { ...process.env, CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: e2eOutPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const out = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !out.includes('"ok":true')) {
    console.error('THEMES_RENDERER_FAIL', { code, signal, out, stdout, stderr });
    process.exit(1);
  }
  console.log('THEMES_RENDERER_OK');
});
