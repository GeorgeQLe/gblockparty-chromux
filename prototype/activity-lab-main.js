'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { ActivityLabRunner } = require('./activity-lab/runner');
const scenarios = require('./activity-lab/scenarios');
const { sanitizeReport } = require('./activity-lab/core');
const pkg = require('./package.json');

if (!process.argv.includes('--activity-lab')) {
  throw new Error('The isolated entry point requires --activity-lab.');
}

const explicitProfile = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
const profile = explicitProfile
  ? explicitProfile.slice('--user-data-dir='.length)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-activity-lab-profile-'));
app.setPath('userData', profile);

let win;
let runner;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function codexVersion() {
  return new Promise((resolve) => {
    execFile(process.env.CHROMUX_ACTIVITY_LAB_CODEX || 'codex', ['--version'],
      { timeout: 5000, maxBuffer: 16 * 1024 }, (error, stdout) => {
        resolve(error ? 'unavailable' : String(stdout).trim().slice(0, 120));
      });
  });
}

ipcMain.handle('activity-lab-info', async () => ({
  chromuxVersion: pkg.version,
  codexVersion: await codexVersion(),
  profile,
  isolatedProfile: /chromux-activity-lab/.test(profile),
  normalChromuxBypassed: true,
  scenarios,
}));
ipcMain.handle('activity-lab-run', (_event, input) => runner.start(input || {}));
ipcMain.handle('activity-lab-cancel', (_event, id) => runner.cancel(id));
ipcMain.handle('activity-lab-export', async (_event, input) => {
  const report = sanitizeReport(input || {});
  const chosen = await dialog.showSaveDialog(win, {
    title: 'Export sanitized activity lab report',
    defaultPath: `chromux-activity-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(chosen.filePath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { ok: true, path: chosen.filePath };
});
ipcMain.handle('activity-lab-smoke-result', (_event, result) => {
  if (!process.env.CHROMUX_ACTIVITY_LAB_SMOKE_OUT) return { ok: false };
  fs.writeFileSync(process.env.CHROMUX_ACTIVITY_LAB_SMOKE_OUT, JSON.stringify({
    ...result,
    windowVisible: win?.isVisible() ?? null,
  }), { mode: 0o600 });
  setTimeout(() => app.quit(), 25);
  return { ok: true };
});

app.whenReady().then(() => {
  runner = new ActivityLabRunner({ send });
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    show: process.env.CHROMUX_ACTIVITY_LAB_SMOKE !== '1',
    title: 'Chromux Activity Indicator Lab',
    backgroundColor: '#0c1017',
    webPreferences: {
      preload: path.join(__dirname, 'activity-lab-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'activity-lab', 'index.html'), {
    search: process.env.CHROMUX_ACTIVITY_LAB_SMOKE === '1' ? 'smoke=1' : '',
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  runner?.shutdown();
  if (!explicitProfile && fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
});
