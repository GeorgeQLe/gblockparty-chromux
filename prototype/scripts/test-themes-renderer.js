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
