'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleanupOrphanedStorage } = require('../storage-cleanup');

function makeFixture(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    userDataDir: path.join(root, 'user-data'),
    partitionsDir: path.join(root, 'user-data', 'Partitions'),
    chromuxHome: path.join(root, 'home', '.chromux'),
  };
}

function makeLogger() {
  const warnings = [];
  const info = [];
  return {
    logger: {
      warn(message) { warnings.push(String(message)); },
      info(message) { info.push(String(message)); },
    },
    warnings,
    info,
  };
}

function touch(filePath, contents = 'fixture') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function removeFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function testRecognizedEntriesOnly() {
  const fixture = makeFixture('chromux-storage-cleanup-recognized-');
  const log = makeLogger();
  fs.mkdirSync(fixture.partitionsDir, { recursive: true });
  fs.mkdirSync(fixture.chromuxHome, { recursive: true });

  const recognizedPartitions = [
    'chromux',
    'chromux-123e4567-e89b-42d3-a456-426614174000',
    'chromux-1722000000000-acde1234567890',
  ];
  for (const name of recognizedPartitions) {
    touch(path.join(fixture.partitionsDir, name, 'Cache', 'entry'));
  }

  const unrelatedPartitions = [
    'Default',
    'chromux-not-a-session',
    'chromux-223E4567-E89B-42D3-A456-426614174000',
    'chromux-172200000000-acde1234',
    'chromux-1722000000001-ABCDE1234',
  ];
  for (const name of unrelatedPartitions) {
    touch(path.join(fixture.partitionsDir, name, 'keep'));
  }

  const ordinaryMatchingPartitionFile = path.join(
    fixture.partitionsDir,
    'chromux-00000000-0000-4000-8000-000000000001',
  );
  touch(ordinaryMatchingPartitionFile);

  const outsidePartition = path.join(fixture.root, 'outside-partition');
  touch(path.join(outsidePartition, 'keep'));
  const matchingPartitionSymlink = path.join(
    fixture.partitionsDir,
    'chromux-00000000-0000-4000-8000-000000000002',
  );
  fs.symlinkSync(outsidePartition, matchingPartitionSymlink);

  const staleSignals = [
    'signal-0123456789abcdef01234567.json',
    'signal-fedcba9876543210fedcba98.json',
  ];
  for (const name of staleSignals) touch(path.join(fixture.chromuxHome, name), '{}');

  const retainedHomeEntries = [
    'signal-classifier.js',
    'signal-0123456789abcdef0123456.json',
    'signal-AAAAAAAAAAAAAAAAAAAAAAAA.json',
    'delivery-log.jsonl',
    'restore-sessions.json',
    'prompt-history.json',
  ];
  for (const name of retainedHomeEntries) touch(path.join(fixture.chromuxHome, name));
  touch(path.join(fixture.chromuxHome, 'captures', 'capture-1', 'payload.yaml'));

  const matchingSignalDirectory = path.join(
    fixture.chromuxHome,
    'signal-000000000000000000000001.json',
  );
  fs.mkdirSync(matchingSignalDirectory);
  const outsideSignal = path.join(fixture.root, 'outside-signal.json');
  touch(outsideSignal, '{}');
  const matchingSignalSymlink = path.join(
    fixture.chromuxHome,
    'signal-000000000000000000000002.json',
  );
  fs.symlinkSync(outsideSignal, matchingSignalSymlink);

  const result = cleanupOrphanedStorage({
    userDataDir: fixture.userDataDir,
    chromuxHome: fixture.chromuxHome,
    logger: log.logger,
  });

  assert.deepStrictEqual(result, {
    partitions: { removed: 3, failed: 0 },
    signals: { removed: 2, failed: 0 },
    removed: 5,
    failed: 0,
  });
  for (const name of recognizedPartitions) {
    assert(!exists(path.join(fixture.partitionsDir, name)), `${name} should be removed`);
  }
  for (const name of unrelatedPartitions) {
    assert(exists(path.join(fixture.partitionsDir, name)), `${name} should remain`);
  }
  assert(exists(ordinaryMatchingPartitionFile), 'ordinary partition file should remain');
  assert(fs.lstatSync(matchingPartitionSymlink).isSymbolicLink(), 'matching partition symlink should remain');
  assert(exists(path.join(outsidePartition, 'keep')), 'partition symlink target should remain');
  for (const name of staleSignals) {
    assert(!exists(path.join(fixture.chromuxHome, name)), `${name} should be removed`);
  }
  for (const name of retainedHomeEntries) {
    assert(exists(path.join(fixture.chromuxHome, name)), `${name} should remain`);
  }
  assert(exists(path.join(fixture.chromuxHome, 'captures', 'capture-1', 'payload.yaml')), 'captures should remain');
  assert(fs.lstatSync(matchingSignalSymlink).isSymbolicLink(), 'matching signal symlink should remain');
  assert(exists(outsideSignal), 'signal symlink target should remain');
  assert(fs.lstatSync(matchingSignalDirectory).isDirectory(), 'matching signal directory should remain');
  assert.strictEqual(log.warnings.length, 0, 'successful cleanup should not warn');
  assert(log.info.some((line) => line.includes('removed=5') && line.includes('failed=0')), 'aggregate result should be logged');

  removeFixture(fixture.root);
}

function testFailuresRemainBestEffort() {
  const fixture = makeFixture('chromux-storage-cleanup-failures-');
  const log = makeLogger();
  fs.mkdirSync(fixture.partitionsDir, { recursive: true });
  fs.mkdirSync(fixture.chromuxHome, { recursive: true });

  const failedPartition = path.join(fixture.partitionsDir, 'chromux');
  const removedPartition = path.join(
    fixture.partitionsDir,
    'chromux-123e4567-e89b-42d3-a456-426614174000',
  );
  touch(path.join(failedPartition, 'keep'));
  touch(path.join(removedPartition, 'remove'));

  const failedSignal = path.join(fixture.chromuxHome, 'signal-000000000000000000000001.json');
  const removedSignal = path.join(fixture.chromuxHome, 'signal-000000000000000000000002.json');
  touch(failedSignal, '{}');
  touch(removedSignal, '{}');

  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (target === failedPartition) {
        const error = new Error('permission denied while removing a partition');
        error.code = 'EACCES';
        throw error;
      }
      return fs.rmSync(target, options);
    },
    unlinkSync(target) {
      if (target === failedSignal) {
        const error = new Error('permission denied while removing a signal');
        error.code = 'EACCES';
        throw error;
      }
      return fs.unlinkSync(target);
    },
  };

  const result = cleanupOrphanedStorage({
    userDataDir: fixture.userDataDir,
    chromuxHome: fixture.chromuxHome,
    fsImpl,
    logger: log.logger,
  });

  assert.deepStrictEqual(result, {
    partitions: { removed: 1, failed: 1 },
    signals: { removed: 1, failed: 1 },
    removed: 2,
    failed: 2,
  });
  assert(exists(failedPartition), 'failed partition should remain');
  assert(!exists(removedPartition), 'later partition cleanup should still run');
  assert(exists(failedSignal), 'failed signal should remain');
  assert(!exists(removedSignal), 'later signal cleanup should still run');
  assert.strictEqual(log.warnings.length, 2, 'each failure should be reported');
  assert(log.warnings.every((line) => line.includes('EACCES')), 'failure details should include bounded error codes');
  assert(log.info.some((line) => line.includes('removed=2') && line.includes('failed=2')), 'failures should appear in aggregate result');

  removeFixture(fixture.root);
}

function testMissingDirectoriesAndBoundedWarnings() {
  const missingFixture = makeFixture('chromux-storage-cleanup-missing-');
  const missingLog = makeLogger();
  const missingResult = cleanupOrphanedStorage({
    userDataDir: missingFixture.userDataDir,
    chromuxHome: missingFixture.chromuxHome,
    logger: missingLog.logger,
  });
  assert.deepStrictEqual(missingResult, {
    partitions: { removed: 0, failed: 0 },
    signals: { removed: 0, failed: 0 },
    removed: 0,
    failed: 0,
  });
  assert.strictEqual(missingLog.warnings.length, 0, 'missing cleanup roots should be ignored');
  removeFixture(missingFixture.root);

  const fixture = makeFixture('chromux-storage-cleanup-bounded-');
  const log = makeLogger();
  fs.mkdirSync(fixture.partitionsDir, { recursive: true });
  fs.mkdirSync(fixture.chromuxHome, { recursive: true });
  const failedPaths = [];
  for (let index = 0; index < 12; index += 1) {
    const name = `chromux-00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
    const target = path.join(fixture.partitionsDir, name);
    touch(path.join(target, 'keep'));
    failedPaths.push(target);
  }
  const fsImpl = {
    ...fs,
    rmSync(target) {
      if (failedPaths.includes(target)) {
        const error = new Error('a deliberately long failure detail that should not be repeated without a bound');
        error.code = 'EACCES';
        throw error;
      }
      return fs.rmSync(target, { recursive: true, force: true });
    },
  };
  const result = cleanupOrphanedStorage({
    userDataDir: fixture.userDataDir,
    chromuxHome: fixture.chromuxHome,
    fsImpl,
    logger: log.logger,
  });
  assert.strictEqual(result.failed, 12, 'all failures should be counted');
  assert(log.warnings.length < result.failed, 'individual failure logs should be capped');
  assert(log.info.some((line) => line.includes('failed=12')), 'aggregate should retain the complete failure count');
  removeFixture(fixture.root);
}

function testStartupOrdering() {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const readyMatch = /app\.whenReady\(\)\.then\((?:async )?\(\) => \{/.exec(mainSource);
  const readyIndex = readyMatch ? readyMatch.index : -1;
  const cleanupIndex = mainSource.indexOf('cleanupOrphanedStorage({', readyIndex);
  const createWindowIndex = mainSource.indexOf('createWindow();', readyIndex);
  assert(readyIndex >= 0, 'Electron ready handler should exist');
  assert(cleanupIndex > readyIndex, 'cleanup should run after Electron becomes ready');
  assert(createWindowIndex > cleanupIndex, 'cleanup should run before the first window is created');
  assert(
    mainSource.slice(cleanupIndex, createWindowIndex).includes("userDataDir: app.getPath('userData')")
      && mainSource.slice(cleanupIndex, createWindowIndex).includes('chromuxHome: CHROMUX_HOME'),
    'startup cleanup should receive explicit storage roots',
  );
}

testRecognizedEntriesOnly();
testFailuresRemainBestEffort();
testMissingDirectoriesAndBoundedWarnings();
testStartupOrdering();
console.log('STORAGE_CLEANUP_OK');
