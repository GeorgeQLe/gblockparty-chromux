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
    expect(ratio >= 4.5, label + ' contrast should meet WCAG AA; got ' + ratio.toFixed(2));
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
  expect(themes.current() === 'blueprint', 'blueprint should be the default theme');
  expect(themes.bodyTheme() === 'blueprint', 'default theme should be applied to the body');
  expect(JSON.stringify(themes.selectedCards()) === JSON.stringify(['blueprint']), 'exactly one default card should be selected');

  for (const theme of expected) {
    expect(themes.select(theme) === theme, theme + ' should be selectable');
    expect(themes.bodyTheme() === theme, theme + ' should update the body theme');
    expect(themes.stored() === theme, theme + ' should persist to localStorage');
    expect(JSON.stringify(themes.selectedCards()) === JSON.stringify([theme]), theme + ' should be the only pressed card');
    expectContrast(document.querySelector('#settings-check-updates'), theme + ' primary button');
    expectContrast(document.querySelector('[data-theme-option="' + theme + '"] .theme-check'), theme + ' selected-theme check');
  }

  themes.select('blueprint');
  expectContrast(document.querySelector('#btn-update-ready'), 'blueprint update-ready button');
  expectContrast(fixtures.querySelector('.head-btn.armed'), 'blueprint armed header button');
  expectContrast(fixtures.querySelector('.favorite-btn.armed'), 'blueprint armed favorite button');
  expectContrast(fixtures.querySelector('.q-badge'), 'blueprint queue badge');
  expectContrast(fixtures.querySelector('.shortcut-chip.matched'), 'blueprint matched shortcut chip');

  themes.select('streak');
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
