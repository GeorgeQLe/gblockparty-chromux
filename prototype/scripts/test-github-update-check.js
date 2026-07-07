'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { checkForUpdates, parseRelease } = require('../update-checker');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-github-update-'));
  const cacheFile = path.join(tmp, 'update-cache.json');
  const release = {
    tag_name: 'chromux-v0.9.0',
    name: 'GBlockParty Chromux v0.9.0',
    html_url: 'https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.9.0',
    published_at: '2026-07-06T00:00:00Z',
    prerelease: true,
  };

  assert.deepEqual(parseRelease(release), {
    ok: true,
    tag: 'chromux-v0.9.0',
    version: '0.9.0',
    releaseUrl: release.html_url,
    title: release.name,
    publishedAt: release.published_at,
    prerelease: true,
  });

  assert.equal(parseRelease({ tag_name: 'v0.9.0' }).ok, false);

  let calls = 0;
  const success = await checkForUpdates({
    currentVersion: '0.8.0',
    cacheFile,
    now: new Date('2026-07-06T12:00:00Z'),
    fetcher: async () => {
      calls += 1;
      return release;
    },
  });
  assert.equal(success.updateAvailable, true);
  assert.equal(success.latestTag, 'chromux-v0.9.0');
  assert.equal(calls, 1);

  const cached = await checkForUpdates({
    currentVersion: '0.8.0',
    cacheFile,
    now: new Date('2026-07-06T13:00:00Z'),
    fetcher: async () => {
      calls += 1;
      throw new Error('cache should prevent this call');
    },
  });
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);

  const staleCacheFile = path.join(tmp, 'stale-version-cache.json');
  fs.writeFileSync(staleCacheFile, JSON.stringify({
    currentVersion: '0.9.0',
    releasesUrl: 'https://example.test/releases/latest',
    checkedAt: '2026-07-06T12:00:00.000Z',
    cached: false,
    updateAvailable: true,
    reason: 'release',
    latestVersion: '0.11.0',
    latestTag: 'chromux-v0.11.0',
    releaseUrl: 'https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.11.0',
    releaseTitle: 'GBlockParty Chromux v0.11.0',
    publishedAt: '2026-07-06T00:00:00Z',
    prerelease: false,
  }, null, 2));
  const freshRuntimeFromStaleCache = await checkForUpdates({
    currentVersion: '0.12.1',
    cacheFile: staleCacheFile,
    now: new Date('2026-07-06T13:00:00Z'),
    fetcher: async () => {
      calls += 1;
      throw new Error('stale cache should prevent this call');
    },
  });
  assert.equal(freshRuntimeFromStaleCache.currentVersion, '0.12.1');
  assert.equal(freshRuntimeFromStaleCache.cached, true);
  assert.equal(freshRuntimeFromStaleCache.updateAvailable, false);
  assert.equal(freshRuntimeFromStaleCache.reason, 'current');
  assert.equal(freshRuntimeFromStaleCache.latestTag, 'chromux-v0.11.0');
  assert.equal(calls, 1);

  const manual = await checkForUpdates({
    currentVersion: '0.8.0',
    cacheFile,
    manual: true,
    now: new Date('2026-07-06T13:00:00Z'),
    fetcher: async () => {
      calls += 1;
      return { ...release, tag_name: 'chromux-v0.10.0' };
    },
  });
  assert.equal(manual.latestTag, 'chromux-v0.10.0');
  assert.equal(calls, 2);

  const malformed = await checkForUpdates({
    currentVersion: '0.8.0',
    cacheFile: path.join(tmp, 'malformed-cache.json'),
    fetcher: async () => ({ tag_name: '0.9.0' }),
  });
  assert.equal(malformed.updateAvailable, false);
  assert.equal(malformed.reason, 'invalid-release');

  const network = await checkForUpdates({
    currentVersion: '0.8.0',
    cacheFile: path.join(tmp, 'network-cache.json'),
    fetcher: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(network.updateAvailable, false);
  assert.equal(network.reason, 'network-error');
  assert.match(network.error, /offline/);

  console.log('GITHUB_UPDATE_CHECK_OK');
}

main().catch((err) => {
  console.error('GITHUB_UPDATE_CHECK_FAIL');
  console.error(err.stack || err.message);
  process.exit(1);
});
