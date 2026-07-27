'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const outputDir = path.resolve(process.argv[2] || path.join(appDir, 'composer-theme-screenshots'));
const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const themes = ['blueprint', 'retro-os', 'streak', 'liquid-glass'];
const modes = ['light', 'dark'];

fs.mkdirSync(outputDir, { recursive: true });

for (const theme of themes) {
  for (const mode of modes) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `chromux-composer-${theme}-${mode}-`));
    const e2ePath = path.join(tmpDir, 'capture-composer-theme.js');
    const e2eOutPath = path.join(tmpDir, 'e2e.out');
    const screenshotPath = path.join(outputDir, `${theme}-${mode}.png`);
    fs.writeFileSync(e2ePath, `
      new Promise((resolve) => {
        const composer = window.chromuxTestFullBrowserComposer;
        window.chromuxTestThemes.select(${JSON.stringify(theme)});
        window.chromuxTestThemes.selectMode(${JSON.stringify(mode)});
        const sourceId = composer.addSession({
          name: 'page-review',
          agent: 'codex',
          cwd: '/workspace/chromux',
          url: 'https://example.test/product',
          title: 'Product dashboard',
        });
        composer.addSession({
          name: 'implementation',
          agent: 'claude',
          cwd: '/workspace/chromux',
          url: 'https://example.test/implementation',
        });
        composer.focus(sourceId);
        composer.enterFull(sourceId);
        composer.clickToggle(sourceId);
        composer.stageContext(sourceId, {
          captureId: 'capture-theme',
          payloadPath: '/workspace/chromux/captures/page-review/payload.yaml',
          screenshotPath: '/workspace/chromux/captures/page-review/screenshot.png',
          url: 'https://example.test/product',
          title: 'Product dashboard',
          capturedAt: new Date().toISOString(),
          visibleTextTruncated: false,
        });
        composer.setDraft(sourceId, 'Review the attached page and send a prioritized implementation plan.');
        setTimeout(() => resolve(JSON.stringify({
          ok: true,
          theme: ${JSON.stringify(theme)},
          mode: ${JSON.stringify(mode)},
        })), 400);
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
      console.error('COMPOSER_THEME_CAPTURE_FAIL', {
        theme,
        mode,
        status: result.status,
        signal: result.signal,
        report,
        stderr: result.stderr,
      });
      process.exit(1);
    }
    console.log(`COMPOSER_THEME_CAPTURE_OK ${theme} ${mode} ${screenshotPath}`);
  }
}
