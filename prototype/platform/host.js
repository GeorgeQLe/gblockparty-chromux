'use strict';

function capabilities(platform = process.platform) {
  return {
    preventSleep: platform === 'darwin' || platform === 'win32',
    foregroundInputBroker: platform === 'darwin' || platform === 'win32',
    iosSimulator: platform === 'darwin',
  };
}

function resourceIds(platform = process.platform) {
  return {
    foregroundInput: platform === 'win32' ? 'windows:foreground-input' : 'macos:foreground-input',
  };
}

function windowOptions(platform = process.platform) {
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#0b0e11', symbolColor: '#c9d1d9', height: 40 },
    };
  }
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
  };
}

function windowsSupport({ platform = process.platform, arch = process.arch, release = require('os').release() } = {}) {
  if (platform !== 'win32') return { supported: true, error: null };
  const build = Number(String(release).split('.')[2] || 0);
  if (arch !== 'x64') return { supported: false, error: 'Chromux v0.62 requires Windows 11 x64.' };
  if (build < 22621) return { supported: false, error: 'Chromux v0.62 requires Windows 11 22H2 (build 22621) or newer.' };
  return { supported: true, error: null };
}

module.exports = { capabilities, resourceIds, windowOptions, windowsSupport };
