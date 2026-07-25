'use strict';

const fs = require('fs');
const path = require('path');

const UUID_PARTITION_RE = /^chromux-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FALLBACK_PARTITION_RE = /^chromux-[0-9]{13}-[0-9a-f]{1,14}$/;
const SIGNAL_FILE_RE = /^signal-[0-9a-f]{24}\.json$/;
const MAX_FAILURE_DETAIL_LOGS = 8;

function isOrphanedPartitionName(name) {
  return name === 'chromux' || UUID_PARTITION_RE.test(name) || FALLBACK_PARTITION_RE.test(name);
}

function cleanupOrphanedStorage({
  userDataDir,
  chromuxHome,
  fsImpl = fs,
  logger = console,
} = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir
    || typeof chromuxHome !== 'string' || !chromuxHome) {
    throw new TypeError('cleanupOrphanedStorage requires userDataDir and chromuxHome');
  }

  const result = {
    partitions: { removed: 0, failed: 0 },
    signals: { removed: 0, failed: 0 },
    removed: 0,
    failed: 0,
  };
  let loggedFailures = 0;

  function recordFailure(kind, name, error) {
    result[kind].failed += 1;
    result.failed += 1;
    if (loggedFailures >= MAX_FAILURE_DETAIL_LOGS) return;
    loggedFailures += 1;
    const code = typeof error?.code === 'string'
      ? error.code.slice(0, 32)
      : (typeof error?.name === 'string' ? error.name.slice(0, 32) : 'UNKNOWN');
    if (typeof logger?.warn === 'function') {
      logger.warn(`[storage-cleanup] ${kind} entry ${JSON.stringify(name)} failed (${code})`);
    }
  }

  function readEntries(directory, kind) {
    try {
      return fsImpl.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') recordFailure(kind, path.basename(directory), error);
      return [];
    }
  }

  const partitionsDir = path.join(userDataDir, 'Partitions');
  for (const entry of readEntries(partitionsDir, 'partitions')) {
    if (!isOrphanedPartitionName(entry.name)) continue;
    const target = path.join(partitionsDir, entry.name);
    try {
      const stat = fsImpl.lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
      fsImpl.rmSync(target, { recursive: true, force: false });
      result.partitions.removed += 1;
      result.removed += 1;
    } catch (error) {
      if (error?.code !== 'ENOENT') recordFailure('partitions', entry.name, error);
    }
  }

  for (const entry of readEntries(chromuxHome, 'signals')) {
    if (!SIGNAL_FILE_RE.test(entry.name)) continue;
    const target = path.join(chromuxHome, entry.name);
    try {
      const stat = fsImpl.lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      fsImpl.unlinkSync(target);
      result.signals.removed += 1;
      result.removed += 1;
    } catch (error) {
      if (error?.code !== 'ENOENT') recordFailure('signals', entry.name, error);
    }
  }

  if (typeof logger?.info === 'function') {
    const suppressed = Math.max(0, result.failed - loggedFailures);
    logger.info(
      `[storage-cleanup] removed=${result.removed} failed=${result.failed}`
      + ` partitions=${result.partitions.removed}/${result.partitions.failed}`
      + ` signals=${result.signals.removed}/${result.signals.failed}`
      + (suppressed ? ` failure_details_suppressed=${suppressed}` : ''),
    );
  }
  return result;
}

module.exports = {
  cleanupOrphanedStorage,
  isOrphanedPartitionName,
};
