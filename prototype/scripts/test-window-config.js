'use strict';

const fs = require('fs');
const path = require('path');

const mainPath = path.resolve(__dirname, '..', 'main.js');
const activityLabMainPath = path.resolve(__dirname, '..', 'activity-lab-main.js');
const scriptsPath = path.resolve(__dirname);
const preloadPath = path.resolve(__dirname, '..', 'preload.js');
const source = fs.readFileSync(mainPath, 'utf8');
const activityLabSource = fs.readFileSync(activityLabMainPath, 'utf8');
const preloadSource = fs.readFileSync(preloadPath, 'utf8');
const windowOptions = source.match(/new BrowserWindow\(\{([\s\S]*?)\n  \}\);/);

if (!windowOptions) throw new Error('Could not locate Chromux BrowserWindow options');
const e2eWindowModeHelper = source.match(
  /function resolveE2EWindowMode\(\{ smoke, e2ePath, showE2EWindow \}\) \{[\s\S]*?\n\}/,
);
if (!e2eWindowModeHelper) throw new Error('Could not locate E2E window-mode helper');
const resolveE2EWindowMode = Function(`${e2eWindowModeHelper[0]}; return resolveE2EWindowMode;`)();
if (resolveE2EWindowMode({ smoke: true, e2ePath: '/tmp/e2e.js' }) !== 'hidden') {
  throw new Error('Ordinary scripted smoke E2E windows must remain hidden');
}
if (resolveE2EWindowMode({ smoke: true, e2ePath: '' }) !== 'normal') {
  throw new Error('Manual smoke windows must remain normally visible');
}
if (resolveE2EWindowMode({ smoke: false, e2ePath: '/tmp/e2e.js' }) !== 'normal') {
  throw new Error('Production windows must remain normally visible');
}
if (resolveE2EWindowMode({
  smoke: true,
  e2ePath: '/tmp/e2e.js',
  showE2EWindow: '1',
}) !== 'inactive') {
  throw new Error('CHROMUX_E2E_SHOW_WINDOW=1 must use non-activating presentation');
}
if (!/\bshow:\s*E2E_WINDOW_MODE\s*===\s*'normal'/.test(windowOptions[1])) {
  throw new Error('Every scripted E2E BrowserWindow must be created hidden');
}
if (!/if\s*\(E2E_WINDOW_MODE\s*===\s*'inactive'\)\s*win\.showInactive\(\);\s*\n\s*const result = await win\.webContents\.executeJavaScript/.test(source)) {
  throw new Error('Visible E2E windows must be shown without activation immediately before their script runs');
}
if (!/\bshow:\s*process\.env\.CHROMUX_ACTIVITY_LAB_SMOKE\s*!==\s*'1'/.test(activityLabSource)) {
  throw new Error('Activity Lab smoke windows must be created hidden while manual labs remain visible');
}
const visibleOrdinaryTests = fs.readdirSync(scriptsPath)
  .filter((file) => /^test-.*\.js$/.test(file))
  .filter((file) => !['test-streak-attention-click-targets-renderer.js', 'test-window-config.js'].includes(file))
  .filter((file) => fs.readFileSync(path.join(scriptsPath, file), 'utf8').includes('CHROMUX_E2E_SHOW_WINDOW'));
if (visibleOrdinaryTests.length > 0) {
  throw new Error(`Only the native pointer test may request a visible E2E window: ${visibleOrdinaryTests.join(', ')}`);
}
if (!/\bpaintWhenInitiallyHidden:\s*true\b/.test(windowOptions[1])) {
  throw new Error('Hidden scripted E2E windows must keep painting for layout and capture checks');
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
  e2eWindowModes: ['normal', 'hidden', 'inactive'],
  activityLabSmokeHidden: true,
  acceptFirstMouse: true,
  trafficLightPosition: true,
}));
