'use strict';

const fs = require('fs');
const https = require('https');

const DEFAULT_RELEASES_URL = 'https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest';
const DEFAULT_LATEST_RELEASE_URL = 'https://github.com/GeorgeQLe/gblockparty-chromux/releases/latest';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RELEASE_TAG_RE = /^chromux-v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const LATEST_REDIRECT_PATH_RE = /^\/GeorgeQLe\/gblockparty-chromux\/releases\/tag\/(chromux-v(\d+\.\d+\.\d+))$/;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const NETWORK_ERROR_MESSAGE = 'Could not check for Chromux updates through GitHub Releases. Try again later.';

function compareVersions(a, b) {
  const normalize = (value) => String(value || '0').split(/[-+]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const aa = normalize(a);
  const bb = normalize(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
    const d = (aa[i] || 0) - (bb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function parseRelease(release) {
  if (!release || typeof release !== 'object') {
    return { ok: false, error: 'Latest release response was empty or invalid.' };
  }
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  const match = tag.match(RELEASE_TAG_RE);
  if (!match) {
    return { ok: false, tag, error: `Latest release tag must match chromux-vX.Y.Z; got ${tag || 'empty tag'}.` };
  }
  const releaseUrl = typeof release.html_url === 'string' && release.html_url
    ? release.html_url
    : `https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/${tag}`;
  const hasAssets = Array.isArray(release.assets);
  const assetList = hasAssets ? release.assets : [];
  const assets = Object.fromEntries(assetList
    .filter((asset) => asset && typeof asset.name === 'string' && typeof asset.browser_download_url === 'string')
    .map((asset) => [asset.name, asset.browser_download_url]));
  const windowsNames = {
    setup: `GBlockParty-Chromux-Setup-${match[1]}-x64.exe`,
    package: `GBlockPartyChromux-${match[1]}-full.nupkg`,
    releases: 'RELEASES',
  };
  const windows = {
    setupUrl: assets[windowsNames.setup] || null,
    packageUrl: assets[windowsNames.package] || null,
    releasesUrl: assets[windowsNames.releases] || null,
  };
  windows.complete = Boolean(windows.setupUrl && windows.packageUrl && windows.releasesUrl);
  return {
    ok: true,
    tag,
    version: match[1],
    releaseUrl,
    title: typeof release.name === 'string' ? release.name : '',
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    prerelease: Boolean(release.prerelease),
    ...(hasAssets ? { assets, windows } : {}),
  };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, value) {
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function cachedStatus(cacheFile, nowMs, cacheTtlMs, currentVersion) {
  const cached = readJson(cacheFile);
  if (!cached || !cached.checkedAt || cached.reason === 'network-error') return null;
  const checkedAtMs = Date.parse(cached.checkedAt);
  if (!Number.isFinite(checkedAtMs) || nowMs - checkedAtMs >= cacheTtlMs) return null;
  const status = { ...cached, currentVersion, cached: true };
  if (status.latestVersion) {
    const updateAvailable = compareVersions(status.latestVersion, currentVersion) > 0;
    status.updateAvailable = updateAvailable;
    status.reason = updateAvailable ? 'release' : 'current';
  }
  return status;
}

function requestError(message, { statusCode = null, code = null } = {}) {
  const error = new Error(message);
  error.requestFailure = true;
  if (Number.isInteger(statusCode)) error.statusCode = statusCode;
  if (typeof code === 'string' && code) error.code = code;
  return error;
}

function fetchJson(url, timeoutMs = 10000, requester = https.get) {
  return new Promise((resolve, reject) => {
    const req = requester(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GBlockParty-Chromux',
      },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(requestError(`GitHub Releases request failed with HTTP ${res.statusCode}.`, {
            statusCode: res.statusCode,
          }));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(requestError(`GitHub Releases response was not JSON: ${err.message}`, {
            statusCode: res.statusCode,
          }));
        }
      });
    });
    req.on('timeout', () => req.destroy(requestError('GitHub Releases request timed out.', {
      code: 'ETIMEDOUT',
    })));
    req.on('error', (error) => {
      if (error && error.requestFailure) {
        reject(error);
        return;
      }
      reject(requestError('GitHub Releases request failed.', {
        code: error && error.code,
      }));
    });
  });
}

function fetchLatestReleaseRedirect(url, timeoutMs = 10000, requester = https.get) {
  return new Promise((resolve, reject) => {
    const req = requester(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'GBlockParty-Chromux',
      },
      timeout: timeoutMs,
    }, (res) => {
      res.resume();
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          location: typeof res.headers.location === 'string' ? res.headers.location : null,
        });
      });
    });
    req.on('timeout', () => req.destroy(requestError('GitHub latest-release request timed out.', {
      code: 'ETIMEDOUT',
    })));
    req.on('error', (error) => {
      if (error && error.requestFailure) {
        reject(error);
        return;
      }
      reject(requestError('GitHub latest-release request failed.', {
        code: error && error.code,
      }));
    });
  });
}

function releaseFromLatestRedirect(response) {
  if (!response || !REDIRECT_STATUS_CODES.has(response.statusCode) || typeof response.location !== 'string') {
    throw requestError('GitHub latest-release response was not a redirect.', {
      statusCode: response && response.statusCode,
    });
  }

  let redirectUrl;
  try {
    redirectUrl = new URL(response.location, DEFAULT_LATEST_RELEASE_URL);
  } catch {
    throw requestError('GitHub latest-release redirect was malformed.', {
      statusCode: response.statusCode,
    });
  }

  if (
    redirectUrl.protocol !== 'https:'
    || redirectUrl.hostname !== 'github.com'
    || redirectUrl.port
    || redirectUrl.username
    || redirectUrl.password
    || redirectUrl.search
    || redirectUrl.hash
  ) {
    throw requestError('GitHub latest-release redirect target was invalid.', {
      statusCode: response.statusCode,
    });
  }

  const match = redirectUrl.pathname.match(LATEST_REDIRECT_PATH_RE);
  if (!match) {
    throw requestError('GitHub latest-release redirect target was not a Chromux release.', {
      statusCode: response.statusCode,
    });
  }
  if (
    response.location !== redirectUrl.pathname
    && response.location !== `https://github.com${redirectUrl.pathname}`
  ) {
    throw requestError('GitHub latest-release redirect location was not canonical.', {
      statusCode: response.statusCode,
    });
  }

  return {
    tag_name: match[1],
    name: match[1],
    html_url: `https://github.com${redirectUrl.pathname}`,
    published_at: null,
    prerelease: false,
  };
}

async function checkForUpdates({
  currentVersion,
  cacheFile,
  manual = false,
  now = new Date(),
  releasesUrl = DEFAULT_RELEASES_URL,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  fetcher = fetchJson,
  redirectFetcher = fetchLatestReleaseRedirect,
}) {
  const nowMs = now.getTime();
  if (!manual) {
    const cached = cachedStatus(cacheFile, nowMs, cacheTtlMs, currentVersion);
    if (cached) return cached;
  }

  const base = {
    currentVersion,
    releasesUrl,
    checkedAt: now.toISOString(),
    cached: false,
  };

  try {
    let releaseResponse;
    try {
      releaseResponse = await fetcher(releasesUrl);
    } catch (error) {
      if (releasesUrl !== DEFAULT_RELEASES_URL) throw error;
      releaseResponse = releaseFromLatestRedirect(await redirectFetcher(DEFAULT_LATEST_RELEASE_URL));
    }
    const release = parseRelease(releaseResponse);
    if (!release.ok) {
      const status = {
        ...base,
        updateAvailable: false,
        reason: 'invalid-release',
        error: release.error,
        latestTag: release.tag || null,
      };
      writeJson(cacheFile, status);
      return status;
    }
    const status = {
      ...base,
      updateAvailable: compareVersions(release.version, currentVersion) > 0,
      reason: compareVersions(release.version, currentVersion) > 0 ? 'release' : 'current',
      latestVersion: release.version,
      latestTag: release.tag,
      releaseUrl: release.releaseUrl,
      releaseTitle: release.title,
      publishedAt: release.publishedAt,
      prerelease: release.prerelease,
      ...(release.windows ? { assets: release.assets, windows: release.windows } : {}),
    };
    writeJson(cacheFile, status);
    return status;
  } catch (err) {
    const status = {
      ...base,
      updateAvailable: false,
      reason: 'network-error',
      error: releasesUrl === DEFAULT_RELEASES_URL ? NETWORK_ERROR_MESSAGE : err.message,
    };
    return status;
  }
}

module.exports = {
  DEFAULT_LATEST_RELEASE_URL,
  DEFAULT_RELEASES_URL,
  RELEASE_TAG_RE,
  compareVersions,
  parseRelease,
  fetchJson,
  fetchLatestReleaseRedirect,
  releaseFromLatestRedirect,
  checkForUpdates,
};
