'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');
const forge = require('../forge.config');
const infoPath = path.join(appDir, 'build', 'Info.plist');
const info = fs.readFileSync(infoPath, 'utf8');

assert.equal(packageJson.version, packageLock.version);
assert.equal(packageJson.version, packageLock.packages[''].version);
assert(
  packageJson.scripts['package:mac'].includes('--extend-info=build/Info.plist'),
  'electron-packager path must merge the capture privacy metadata',
);
assert.equal(path.resolve(forge.packagerConfig.extendInfo), infoPath);
assert(info.includes('<key>NSAudioCaptureUsageDescription</key>'));
assert(info.includes('records system audio only during a window recording you approve'));
assert(!info.includes('NSMicrophoneUsageDescription'), 'Chromux capture must not request microphone use');

console.log('capture packaging tests: ok');
