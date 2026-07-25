'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { EventEmitter } = require('events');
const {
  DEFAULT_RELEASES_URL,
  checkForUpdates,
  fetchJson,
  parseRelease,
} = require('../update-checker');

const VALID_REDIRECT = '/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.59.0';

function cachePath(tmp, name) {
  return path.join(tmp, `${name}-cache.json`);
}

function requestFailure(message, statusCode = null) {
  const error = new Error(message);
  error.requestFailure = true;
  if (statusCode !== null) error.statusCode = statusCode;
  return error;
}

async function expectFallbackRecovery(tmp, name, primaryError) {
  let apiCalls = 0;
  let redirectCalls = 0;
  const status = await checkForUpdates({
    currentVersion: '0.58.3',
    cacheFile: cachePath(tmp, name),
    fetcher: async (url) => {
      apiCalls += 1;
      assert.equal(url, DEFAULT_RELEASES_URL);
      throw primaryError;
    },
    redirectFetcher: async (url) => {
      redirectCalls += 1;
      assert.equal(url, 'https://github.com/GeorgeQLe/gblockparty-chromux/releases/latest');
      return { statusCode: 302, location: VALID_REDIRECT };
    },
  });
  assert.equal(apiCalls, 1);
  assert.equal(redirectCalls, 1);
  assert.equal(status.reason, 'release');
  assert.equal(status.latestTag, 'chromux-v0.59.0');
  assert.equal(status.releaseTitle, 'chromux-v0.59.0');
  assert.equal(status.publishedAt, null);
  assert.equal(status.prerelease, false);
  return status;
}

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
  let redirectCalls = 0;
  const success = await checkForUpdates({
    currentVersion: '0.8.0',
    cacheFile,
    now: new Date('2026-07-06T12:00:00Z'),
    fetcher: async () => {
      calls += 1;
      return release;
    },
    redirectFetcher: async () => {
      redirectCalls += 1;
      throw new Error('fallback must not run after API success');
    },
  });
  assert.equal(success.updateAvailable, true);
  assert.equal(success.latestTag, 'chromux-v0.9.0');
  assert.equal(calls, 1);
  assert.equal(redirectCalls, 0);

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

  await expectFallbackRecovery(tmp, 'http-403', requestFailure('rate limited', 403));
  await expectFallbackRecovery(tmp, 'http-429', requestFailure('too many requests', 429));
  await expectFallbackRecovery(tmp, 'timeout', requestFailure('request timed out'));
  await expectFallbackRecovery(tmp, 'dns', requestFailure('getaddrinfo ENOTFOUND api.github.com'));
  await expectFallbackRecovery(tmp, 'http-503', requestFailure('service unavailable', 503));

  const currentFromRedirect = await checkForUpdates({
    currentVersion: '0.59.0',
    cacheFile: cachePath(tmp, 'redirect-current'),
    fetcher: async () => { throw requestFailure('rate limited', 403); },
    redirectFetcher: async () => ({
      statusCode: 302,
      location: `https://github.com${VALID_REDIRECT}`,
    }),
  });
  assert.equal(currentFromRedirect.updateAvailable, false);
  assert.equal(currentFromRedirect.reason, 'current');

  const invalidRedirects = [
    { statusCode: 200, location: VALID_REDIRECT },
    { statusCode: 302 },
    { statusCode: 302, location: 'https://evil.example/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.59.0' },
    { statusCode: 302, location: '//evil.example/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.59.0' },
    { statusCode: 302, location: `https://github.com:443${VALID_REDIRECT}` },
    { statusCode: 302, location: `https://GITHUB.com${VALID_REDIRECT}` },
    { statusCode: 302, location: '/OtherOwner/gblockparty-chromux/releases/tag/chromux-v0.59.0' },
    { statusCode: 302, location: '/GeorgeQLe/other-repo/releases/tag/chromux-v0.59.0' },
    { statusCode: 302, location: '/GeorgeQLe/gblockparty-chromux/releases/latest' },
    { statusCode: 302, location: '/GeorgeQLe/gblockparty-chromux/releases/tag/v0.59.0' },
    { statusCode: 302, location: `${VALID_REDIRECT}?from=latest` },
  ];
  for (const [index, redirect] of invalidRedirects.entries()) {
    const invalidCache = cachePath(tmp, `invalid-redirect-${index}`);
    const status = await checkForUpdates({
      currentVersion: '0.58.3',
      cacheFile: invalidCache,
      fetcher: async () => { throw requestFailure('rate limited', 403); },
      redirectFetcher: async () => redirect,
    });
    assert.equal(status.reason, 'network-error');
    assert.equal(status.updateAvailable, false);
    assert.equal(fs.existsSync(invalidCache), false);
  }

  let customFallbackCalls = 0;
  const customCache = cachePath(tmp, 'custom-url');
  const custom = await checkForUpdates({
    currentVersion: '0.58.3',
    cacheFile: customCache,
    releasesUrl: 'https://updates.example.test/releases/latest',
    fetcher: async () => { throw requestFailure('custom endpoint unavailable', 503); },
    redirectFetcher: async () => {
      customFallbackCalls += 1;
      return { statusCode: 302, location: VALID_REDIRECT };
    },
  });
  assert.equal(custom.reason, 'network-error');
  assert.equal(customFallbackCalls, 0);
  assert.equal(fs.existsSync(customCache), false);

  const retryCache = cachePath(tmp, 'retry');
  let retryApiCalls = 0;
  let retryRedirectCalls = 0;
  const firstAttempt = await checkForUpdates({
    currentVersion: '0.58.3',
    cacheFile: retryCache,
    fetcher: async () => {
      retryApiCalls += 1;
      throw requestFailure('private primary failure detail', 403);
    },
    redirectFetcher: async () => {
      retryRedirectCalls += 1;
      throw requestFailure('private fallback failure detail', 503);
    },
  });
  assert.equal(firstAttempt.reason, 'network-error');
  assert.equal(fs.existsSync(retryCache), false);
  assert.ok(firstAttempt.error.length <= 180);
  assert.doesNotMatch(firstAttempt.error, /private|403|503/i);

  const retried = await checkForUpdates({
    currentVersion: '0.58.3',
    cacheFile: retryCache,
    fetcher: async () => {
      retryApiCalls += 1;
      return { ...release, tag_name: 'chromux-v0.59.0' };
    },
    redirectFetcher: async () => {
      retryRedirectCalls += 1;
      throw new Error('fallback must not run after retry succeeds');
    },
  });
  assert.equal(retried.reason, 'release');
  assert.equal(retryApiCalls, 2);
  assert.equal(retryRedirectCalls, 1);
  assert.equal(fs.existsSync(retryCache), true);

  const legacyCache = cachePath(tmp, 'legacy-network-error');
  fs.writeFileSync(legacyCache, JSON.stringify({
    currentVersion: '0.58.2',
    releasesUrl: DEFAULT_RELEASES_URL,
    checkedAt: '2026-07-24T10:00:00.000Z',
    cached: false,
    updateAvailable: false,
    reason: 'network-error',
    error: 'old cached failure',
  }, null, 2));
  let legacyApiCalls = 0;
  const legacyRetried = await checkForUpdates({
    currentVersion: '0.58.3',
    cacheFile: legacyCache,
    now: new Date('2026-07-24T11:00:00.000Z'),
    fetcher: async () => {
      legacyApiCalls += 1;
      return { ...release, tag_name: 'chromux-v0.59.0' };
    },
  });
  assert.equal(legacyApiCalls, 1);
  assert.equal(legacyRetried.cached, false);
  assert.equal(legacyRetried.reason, 'release');
  assert.equal(JSON.parse(fs.readFileSync(legacyCache, 'utf8')).reason, 'release');

  const response = new EventEmitter();
  response.statusCode = 429;
  response.headers = {};
  response.setEncoding = () => {};
  const request = new EventEmitter();
  request.destroy = (error) => request.emit('error', error);
  const structuredFailure = fetchJson(
    DEFAULT_RELEASES_URL,
    1000,
    (_url, _options, callback) => {
      process.nextTick(() => {
        callback(response);
        response.emit('end');
      });
      return request;
    },
  );
  await assert.rejects(structuredFailure, (error) => {
    assert.equal(error.requestFailure, true);
    assert.equal(error.statusCode, 429);
    return true;
  });

  console.log('GITHUB_UPDATE_CHECK_OK');
}

main().catch((err) => {
  console.error('GITHUB_UPDATE_CHECK_FAIL');
  console.error(err.stack || err.message);
  process.exit(1);
});
