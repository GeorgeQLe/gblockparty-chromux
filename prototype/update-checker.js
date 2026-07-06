'use strict';

const fs = require('fs');
const https = require('https');

const DEFAULT_RELEASES_URL = 'https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RELEASE_TAG_RE = /^chromux-v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

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
  return {
    ok: true,
    tag,
    version: match[1],
    releaseUrl,
    title: typeof release.name === 'string' ? release.name : '',
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    prerelease: Boolean(release.prerelease),
  };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, value) {
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function cachedStatus(cacheFile, nowMs, cacheTtlMs) {
  const cached = readJson(cacheFile);
  if (!cached || !cached.checkedAt) return null;
  const checkedAtMs = Date.parse(cached.checkedAt);
  if (!Number.isFinite(checkedAtMs) || nowMs - checkedAtMs >= cacheTtlMs) return null;
  return { ...cached, cached: true };
}

function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
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
          reject(new Error(`GitHub Releases request failed with HTTP ${res.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`GitHub Releases response was not JSON: ${err.message}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('GitHub Releases request timed out.')));
    req.on('error', reject);
  });
}

async function checkForUpdates({
  currentVersion,
  cacheFile,
  manual = false,
  now = new Date(),
  releasesUrl = DEFAULT_RELEASES_URL,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  fetcher = fetchJson,
}) {
  const nowMs = now.getTime();
  if (!manual) {
    const cached = cachedStatus(cacheFile, nowMs, cacheTtlMs);
    if (cached) return cached;
  }

  const base = {
    currentVersion,
    releasesUrl,
    checkedAt: now.toISOString(),
    cached: false,
  };

  try {
    const release = parseRelease(await fetcher(releasesUrl));
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
    };
    writeJson(cacheFile, status);
    return status;
  } catch (err) {
    const status = {
      ...base,
      updateAvailable: false,
      reason: 'network-error',
      error: err.message,
    };
    writeJson(cacheFile, status);
    return status;
  }
}

module.exports = {
  DEFAULT_RELEASES_URL,
  RELEASE_TAG_RE,
  compareVersions,
  parseRelease,
  checkForUpdates,
};
