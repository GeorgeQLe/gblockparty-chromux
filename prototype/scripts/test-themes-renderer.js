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
(() => {
  const themes = window.chromuxTestThemes;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const expected = ['blueprint', 'retro-os', 'streak', 'liquid-glass'];
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
  const expectContrast = (element, label) => {
    const style = getComputedStyle(element);
    const ratio = contrast(style.color, style.backgroundColor);
    expect(ratio >= 4.5, label + ' contrast should meet WCAG AA; got ' + ratio.toFixed(2) + ' from ' + style.color + ' on ' + style.backgroundColor);
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
    assertTerminalSync(theme, 'light');
    themes.selectMode('dark');
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
    }
  }

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
