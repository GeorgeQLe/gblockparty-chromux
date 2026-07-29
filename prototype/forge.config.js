'use strict';

const path = require('path');
const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives');
const { windowsSignOptions } = require('./windows-sign');

const windowsSign = windowsSignOptions();

module.exports = {
  packagerConfig: {
    name: 'GBlockPartyChromux',
    executableName: 'GBlockParty Chromux',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon'),
    appBundleId: 'dev.georgele.chromux',
    extendInfo: path.join(__dirname, 'build', 'Info.plist'),
    asar: true,
    ignore: [/^\/dist/, /^\/out/, /^\/build\/icon\.iconset/],
    ...(windowsSign ? { windowsSign } : {}),
  },
  rebuildConfig: { onlyModules: ['node-pty'] },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'GBlockPartyChromux',
        authors: 'George Le',
        description: 'Agent and browser workspaces powered by WSL2.',
        setupExe: `GBlockParty-Chromux-Setup-${require('./package.json').version}-x64.exe`,
        setupIcon: path.join(__dirname, 'build', 'icon.ico'),
        noMsi: true,
        ...(windowsSign ? { windowsSign } : {}),
      },
    },
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
};
