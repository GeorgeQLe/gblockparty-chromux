'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STABLE_USER_DATA_DIRNAME = 'chromux';
const PRODUCT_USER_DATA_DIRNAME = 'GBlockParty Chromux';

function isExistingDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function hasExplicitUserDataDir(argv = []) {
  return Array.isArray(argv) && argv.some((arg) => (
    arg === '--user-data-dir'
    || (typeof arg === 'string' && arg.startsWith('--user-data-dir='))
  ));
}

function resolveProductionUserDataPath({
  appDataDir,
  directoryExists = isExistingDirectory,
} = {}) {
  if (typeof appDataDir !== 'string' || !appDataDir) {
    throw new TypeError('resolveProductionUserDataPath requires appDataDir');
  }
  if (typeof directoryExists !== 'function') {
    throw new TypeError('directoryExists must be a function');
  }

  const stablePath = path.join(appDataDir, STABLE_USER_DATA_DIRNAME);
  const productPath = path.join(appDataDir, PRODUCT_USER_DATA_DIRNAME);
  if (directoryExists(stablePath)) return stablePath;
  if (directoryExists(productPath)) return productPath;
  return stablePath;
}

function makeSmokeUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-smoke-user-data-'));
}

function resolveChromuxUserDataPath({
  appDataDir,
  argv = [],
  smoke = false,
  keepSmokeUserData = false,
  directoryExists = isExistingDirectory,
  makeSmokeUserDataDir: allocateSmokeUserDataDir = makeSmokeUserDataDir,
} = {}) {
  if (hasExplicitUserDataDir(argv)) return null;
  if (smoke) {
    return keepSmokeUserData ? null : allocateSmokeUserDataDir();
  }
  return resolveProductionUserDataPath({ appDataDir, directoryExists });
}

module.exports = {
  PRODUCT_USER_DATA_DIRNAME,
  STABLE_USER_DATA_DIRNAME,
  hasExplicitUserDataDir,
  resolveChromuxUserDataPath,
  resolveProductionUserDataPath,
};
