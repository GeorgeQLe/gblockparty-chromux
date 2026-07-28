'use strict';

const fs = require('fs');
const path = require('path');

const mainPath = path.resolve(__dirname, '..', 'main.js');
const preloadPath = path.resolve(__dirname, '..', 'preload.js');
const source = fs.readFileSync(mainPath, 'utf8');
const preloadSource = fs.readFileSync(preloadPath, 'utf8');
const windowOptions = source.match(/new BrowserWindow\(\{([\s\S]*?)\n  \}\);/);

if (!windowOptions) throw new Error('Could not locate Chromux BrowserWindow options');
const backgroundE2EHelper = source.match(
  /function isBackgroundE2E\(\{ smoke, e2ePath, showE2EWindow \}\) \{[\s\S]*?\n\}/,
);
if (!backgroundE2EHelper) throw new Error('Could not locate background E2E visibility helper');
const isBackgroundE2E = Function(`${backgroundE2EHelper[0]}; return isBackgroundE2E;`)();
if (!isBackgroundE2E({ smoke: true, e2ePath: '/tmp/e2e.js' })) {
  throw new Error('Scripted smoke E2E windows must start hidden');
}
if (isBackgroundE2E({ smoke: true, e2ePath: '' })) {
  throw new Error('Manual smoke windows must remain visible');
}
if (isBackgroundE2E({ smoke: false, e2ePath: '/tmp/e2e.js' })) {
  throw new Error('Production windows must remain visible');
}
if (isBackgroundE2E({
  smoke: true,
  e2ePath: '/tmp/e2e.js',
  showE2EWindow: '1',
})) {
  throw new Error('CHROMUX_E2E_SHOW_WINDOW=1 must show scripted E2E windows');
}
if (!/\bshow:\s*!BACKGROUND_E2E\b/.test(windowOptions[1])) {
  throw new Error('Chromux BrowserWindow visibility must follow the background E2E flag');
}
if (!/\bacceptFirstMouse:\s*true\b/.test(windowOptions[1])) {
  throw new Error('Chromux must accept the first click while its macOS window is inactive');
}
if (!/\.\.\.windowOptions\(process\.platform\)/.test(windowOptions[1])
  || !/\btrafficLightPosition:\s*\{\s*x:\s*14,\s*y:\s*14\s*\}/.test(
    fs.readFileSync(path.resolve(__dirname, '..', 'platform', 'host.js'), 'utf8'),
  )) {
  throw new Error('Chromux must retain its startup traffic-light fallback');
}
if (!/setWindowButtonPosition:\s*\(position\)\s*=>\s*ipcRenderer\.send\('set-window-button-position', position\)/.test(preloadSource)) {
  throw new Error('Preload must expose only the window-button position payload');
}
const handler = source.match(/ipcMain\.on\('set-window-button-position',[\s\S]*?\n\}\);/);
if (!handler) throw new Error('Could not locate window-button position IPC handler');
for (const required of [
  /event\.sender\s*!==\s*win\.webContents/,
  /validWindowButtonPosition\(position\)/,
  /process\.platform\s*!==\s*'darwin'/,
  /win\.setWindowButtonPosition\(\{\s*x:\s*position\.x,\s*y:\s*position\.y\s*\}\)/,
]) {
  if (!required.test(handler[0])) throw new Error('Window-button handler is missing a required validation or Electron API call');
}
const validator = source.match(/function validWindowButtonPosition\(position\) \{[\s\S]*?\n\}/);
if (!validator
  || !/Number\.isFinite\(position\.x\)/.test(validator[0])
  || !/Number\.isFinite\(position\.y\)/.test(validator[0])
  || !/Number\.isInteger\(position\.x\)/.test(validator[0])
  || !/Number\.isInteger\(position\.y\)/.test(validator[0])
  || !/position\.x\s*>=\s*0/.test(validator[0])
  || !/position\.y\s*>=\s*0/.test(validator[0])
  || !/position\.x\s*<=\s*WINDOW_BUTTON_COORD_MAX/.test(validator[0])
  || !/position\.y\s*<=\s*WINDOW_BUTTON_COORD_MAX/.test(validator[0])) {
  throw new Error('Window-button coordinates must be finite, bounded integers');
}
const validateWindowButtonPosition = Function(
  'WINDOW_BUTTON_COORD_MAX',
  `${validator[0]}; return validWindowButtonPosition;`,
)(200);
if (!validateWindowButtonPosition({ x: 14, y: 22 })) {
  throw new Error('Window-button validator must accept the expected theme position');
}
for (const invalid of [
  null,
  { x: 14.5, y: 22 },
  { x: 14, y: Number.NaN },
  { x: -1, y: 22 },
  { x: 14, y: 201 },
]) {
  if (validateWindowButtonPosition(invalid)) {
    throw new Error(`Window-button validator accepted invalid coordinates: ${JSON.stringify(invalid)}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  backgroundE2E: true,
  acceptFirstMouse: true,
  trafficLightPosition: true,
}));
