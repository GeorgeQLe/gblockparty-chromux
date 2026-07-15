'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'theme-screenshots'));
const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const themes = ['blueprint', 'retro-os', 'streak', 'liquid-glass'];
const modes = ['light', 'dark'];

fs.mkdirSync(outputDir, { recursive: true });

for (const theme of themes) {
  for (const mode of modes) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `chromux-${theme}-${mode}-`));
    const e2ePath = path.join(tmpDir, 'capture-theme.js');
    const e2eOutPath = path.join(tmpDir, 'e2e.out');
    const screenshotPath = path.join(outputDir, `${theme}-${mode}.png`);
    fs.writeFileSync(e2ePath, `
      new Promise((resolve) => {
        window.chromuxTestThemes.select(${JSON.stringify(theme)});
        window.chromuxTestThemes.selectMode(${JSON.stringify(mode)});
        document.querySelector('#btn-settings').click();
        setTimeout(() => resolve(JSON.stringify({ ok: true, theme: ${JSON.stringify(theme)}, mode: ${JSON.stringify(mode)} })), 350);
      })
    `);
    const result = spawnSync(process.execPath, [electronCli, '.', '--smoke'], {
      cwd: appDir,
      env: {
        ...process.env,
        CHROMUX_E2E: e2ePath,
        CHROMUX_E2E_OUT: e2eOutPath,
        CHROMUX_SHOT: screenshotPath,
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    const report = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
    if (result.status !== 0 || !report.includes('"ok":true') || !fs.existsSync(screenshotPath)) {
      console.error('THEME_CAPTURE_FAIL', { theme, mode, status: result.status, signal: result.signal, report, stderr: result.stderr });
      process.exit(1);
    }
    console.log(`THEME_CAPTURE_OK ${theme} ${mode} ${screenshotPath}`);
  }
}
