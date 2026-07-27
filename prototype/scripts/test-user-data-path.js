'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PRODUCT_USER_DATA_DIRNAME,
  STABLE_USER_DATA_DIRNAME,
  hasExplicitUserDataDir,
  resolveChromuxUserDataPath,
  resolveProductionUserDataPath,
} = require('../user-data-path');

function makeFixture(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function testProductionProfileResolution() {
  const root = makeFixture('chromux-user-data-path-');
  const appDataDir = path.join(root, 'Application Support');
  const stablePath = path.join(appDataDir, STABLE_USER_DATA_DIRNAME);
  const productPath = path.join(appDataDir, PRODUCT_USER_DATA_DIRNAME);

  assert.strictEqual(
    resolveProductionUserDataPath({ appDataDir }),
    stablePath,
    'a clean install should use the stable chromux profile even when the parent is missing',
  );

  fs.mkdirSync(productPath, { recursive: true });
  assert.strictEqual(
    resolveProductionUserDataPath({ appDataDir }),
    productPath,
    'an existing product-name-only profile should remain available',
  );

  fs.mkdirSync(stablePath, { recursive: true });
  assert.strictEqual(
    resolveProductionUserDataPath({ appDataDir }),
    stablePath,
    'the legacy stable profile should win when both profiles exist',
  );

  fs.rmSync(stablePath, { recursive: true, force: true });
  fs.writeFileSync(stablePath, 'not a profile directory');
  assert.strictEqual(
    resolveProductionUserDataPath({ appDataDir }),
    productPath,
    'an ordinary file must not count as an existing profile directory',
  );

  fs.rmSync(productPath, { recursive: true, force: true });
  assert.strictEqual(
    resolveProductionUserDataPath({ appDataDir }),
    stablePath,
    'missing profile directories should fall back to the stable path',
  );

  removeFixture(root);
}

function testExplicitAndSmokeOverrides() {
  assert.strictEqual(hasExplicitUserDataDir(['electron', '.', '--user-data-dir=/tmp/one']), true);
  assert.strictEqual(hasExplicitUserDataDir(['electron', '.', '--user-data-dir', '/tmp/two']), true);
  assert.strictEqual(hasExplicitUserDataDir(['electron', '.', '--user-data-directory=/tmp/no']), false);

  const common = {
    appDataDir: path.join('/tmp', 'unused-app-data'),
    makeSmokeUserDataDir() {
      throw new Error('explicit and preserved smoke profiles must not allocate a directory');
    },
  };
  assert.strictEqual(
    resolveChromuxUserDataPath({
      ...common,
      argv: ['electron', '.', '--smoke', '--user-data-dir=/tmp/explicit'],
      smoke: true,
    }),
    null,
    'an explicit user-data directory should not be overridden, including in smoke mode',
  );
  assert.strictEqual(
    resolveChromuxUserDataPath({
      ...common,
      argv: ['electron', '.', '--smoke'],
      smoke: true,
      keepSmokeUserData: true,
    }),
    null,
    'a preserved smoke profile should remain untouched',
  );

  let smokeAllocations = 0;
  const isolatedSmokePath = path.join('/tmp', 'isolated-smoke-profile');
  assert.strictEqual(
    resolveChromuxUserDataPath({
      appDataDir: common.appDataDir,
      argv: ['electron', '.', '--smoke'],
      smoke: true,
      makeSmokeUserDataDir() {
        smokeAllocations += 1;
        return isolatedSmokePath;
      },
    }),
    isolatedSmokePath,
    'an ordinary smoke run should receive an isolated profile',
  );
  assert.strictEqual(smokeAllocations, 1, 'smoke isolation should allocate exactly one profile');
}

function testPackagingMetadataCannotChooseProductionProfile() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  assert.notStrictEqual(
    packageJson.productName,
    STABLE_USER_DATA_DIRNAME,
    'the regression fixture requires a display product name distinct from the stable profile name',
  );

  const appDataDir = path.join('/profiles', 'fixture');
  assert.strictEqual(
    resolveProductionUserDataPath({
      appDataDir,
      directoryExists: () => false,
    }),
    path.join(appDataDir, STABLE_USER_DATA_DIRNAME),
    'clean profile resolution must not derive from package productName',
  );
}

function testStartupOrdering() {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const resolveIndex = mainSource.indexOf('resolveChromuxUserDataPath({');
  const setPathIndex = mainSource.indexOf(
    "app.setPath('userData', resolvedUserDataPath)",
    resolveIndex,
  );
  const lockIndex = mainSource.indexOf('app.requestSingleInstanceLock()');
  const readyIndex = mainSource.indexOf('app.whenReady().then');

  assert(resolveIndex >= 0, 'main should resolve an explicit stable user-data path');
  assert(setPathIndex > resolveIndex, 'main should set the resolved user-data path');
  assert(lockIndex > setPathIndex, 'main should set userData before requesting the single-instance lock');
  assert(readyIndex > setPathIndex, 'main should set userData before creating windows or sessions');
}

testProductionProfileResolution();
testExplicitAndSmokeOverrides();
testPackagingMetadataCannotChooseProductionProfile();
testStartupOrdering();
console.log('USER_DATA_PATH_OK');
