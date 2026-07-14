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

  themes.reset();
  expect(JSON.stringify(themes.ids()) === JSON.stringify(expected), 'all four theme ids should be registered');
  expect(themes.current() === 'blueprint', 'blueprint should be the default theme');
  expect(themes.bodyTheme() === 'blueprint', 'default theme should be applied to the body');
  expect(JSON.stringify(themes.selectedCards()) === JSON.stringify(['blueprint']), 'exactly one default card should be selected');

  for (const theme of expected) {
    expect(themes.select(theme) === theme, theme + ' should be selectable');
    expect(themes.bodyTheme() === theme, theme + ' should update the body theme');
    expect(themes.stored() === theme, theme + ' should persist to localStorage');
    expect(JSON.stringify(themes.selectedCards()) === JSON.stringify([theme]), theme + ' should be the only pressed card');
  }

  let rejected = false;
  try { themes.select('unknown-theme'); } catch { rejected = true; }
  expect(rejected, 'unknown themes should be rejected');
  themes.reset();
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
