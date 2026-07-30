'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { SCENARIOS, createFixture } = require('./sidebar-lab/fixtures');
const { VARIANTS } = require('./sidebar-lab/variants');
const { sanitizeReport } = require('./sidebar-lab/core');
const pkg = require('./package.json');

if (!process.argv.includes('--sidebar-lab')) throw new Error('The isolated entry point requires --sidebar-lab.');

const explicitProfile = process.argv.find((arg) => arg.startsWith('--user-data-dir='));
const profile = explicitProfile
  ? explicitProfile.slice('--user-data-dir='.length)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-sidebar-lab-profile-'));
app.setPath('userData', profile);
let win;

ipcMain.handle('sidebar-lab-config', () => ({
  chromuxVersion: pkg.version,
  fixture: createFixture(),
  scenarios: SCENARIOS,
  variants: VARIANTS,
  isolatedProfile: /chromux-sidebar-lab/.test(profile),
  normalChromuxBypassed: true,
  profileKind: 'temporary',
  smokeMode: process.env.CHROMUX_SIDEBAR_LAB_SMOKE_MODE || 'gallery',
}));
ipcMain.handle('sidebar-lab-export', async (_event, input) => {
  const report = sanitizeReport(input);
  let filePath = process.env.CHROMUX_SIDEBAR_LAB_EXPORT_OUT;
  if (!filePath) {
    const chosen = await dialog.showSaveDialog(win, {
      title: 'Export sanitized sidebar study',
      defaultPath: `chromux-sidebar-study-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
    filePath = chosen.filePath;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return { ok: true, path: filePath };
});
ipcMain.handle('sidebar-lab-smoke-result', async (_event, result) => {
  if (!process.env.CHROMUX_SIDEBAR_LAB_SMOKE_OUT) return { ok: false };
  if (process.env.CHROMUX_SIDEBAR_LAB_SCREENSHOT_OUT && win) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(process.env.CHROMUX_SIDEBAR_LAB_SCREENSHOT_OUT, image.toPNG(), { mode: 0o600 });
  }
  fs.writeFileSync(process.env.CHROMUX_SIDEBAR_LAB_SMOKE_OUT, JSON.stringify(result), { mode: 0o600 });
  setTimeout(() => app.quit(), 25);
  return { ok: true };
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: Number(process.env.CHROMUX_SIDEBAR_LAB_WIDTH) || 1440,
    height: Number(process.env.CHROMUX_SIDEBAR_LAB_HEIGHT) || 940,
    minWidth: 720,
    minHeight: 600,
    title: 'Chromux Contextual Sidebar Lab',
    backgroundColor: '#090d13',
    show: process.env.CHROMUX_SIDEBAR_LAB_HEADLESS !== '1',
    webPreferences: {
      preload: path.join(__dirname, 'sidebar-lab-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'sidebar-lab', 'index.html'), {
    search: process.env.CHROMUX_SIDEBAR_LAB_SMOKE === '1' ? 'smoke=1' : '',
  });
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (!explicitProfile && fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
});
