'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const electron = path.join(appDir, 'node_modules', '.bin', 'electron');

function runSmoke(width) {
  return new Promise((resolve, reject) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `chromux-sidebar-lab-${width}-`));
    const output = path.join(temp, 'result.json');
    const report = path.join(temp, 'report.json');
    const child = spawn(electron, ['sidebar-lab-main.js', '--sidebar-lab',
      `--user-data-dir=${path.join(temp, 'chromux-sidebar-lab-profile')}`], {
      cwd: appDir,
      env: {
        ...process.env,
        CHROMUX_SIDEBAR_LAB_SMOKE: '1',
        CHROMUX_SIDEBAR_LAB_HEADLESS: '1',
        CHROMUX_SIDEBAR_LAB_WIDTH: String(width),
        CHROMUX_SIDEBAR_LAB_SMOKE_OUT: output,
        CHROMUX_SIDEBAR_LAB_EXPORT_OUT: report,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 25_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        assert.strictEqual(code, 0, stderr);
        const result = JSON.parse(fs.readFileSync(output, 'utf8'));
        assert.strictEqual(result.isolatedProfile, true);
        assert.strictEqual(result.normalChromuxBypassed, true);
        assert.strictEqual(result.variantCount, 10);
        assert.strictEqual(result.sessionCount, 18);
        assert.strictEqual(result.everyVariantComplete, true);
        assert.strictEqual(result.stableIdentity, true);
        assert.strictEqual(result.galleryRendered, true);
        assert.strictEqual(result.studyRendered, true);
        assert.strictEqual(result.narrowLayoutSupported, true);
        assert.strictEqual(result.reducedMotionSupported, true);
        assert.strictEqual(result.exportOk, true);
        const exported = JSON.parse(fs.readFileSync(report, 'utf8'));
        assert.strictEqual(exported.schemaVersion, 1);
        assert.strictEqual(exported.safety.syntheticDataOnly, true);
        resolve(result);
      } catch (error) { reject(error); }
      finally { fs.rmSync(temp, { recursive: true, force: true }); }
    });
  });
}

(async () => {
  const desktop = await runSmoke(1440);
  const narrow = await runSmoke(760);
  assert.ok(desktop.galleryColumns >= 3);
  assert.strictEqual(narrow.galleryColumns, 1);
  assert.ok(narrow.viewportWidth <= 820);
  console.log('SIDEBAR_LAB_SMOKE_OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
