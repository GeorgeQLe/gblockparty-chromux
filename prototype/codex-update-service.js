'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');

const GITHUB_LATEST_URL = 'https://api.github.com/repos/openai/codex/releases/latest';
const HOMEBREW_CASK_URL = 'https://formulae.brew.sh/api/cask/codex.json';
const NPM_PACKAGE_URL = 'https://registry.npmjs.org/@openai%2fcodex';
const RELEASE_URL = 'https://github.com/openai/codex/releases/latest';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 60 * 60 * 1000;
const MAX_OUTPUT_BYTES = 32 * 1024;

function boundedText(value, max = 1000) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
}

function sanitizeError(error) {
  const message = error && error.message ? error.message : error;
  return boundedText(message || 'Unknown Codex update error', 500);
}

function parseVersion(value) {
  const match = String(value || '').match(/(?:^|[^0-9])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:$|[^0-9A-Za-z.-])/);
  return match ? match[1] : null;
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    return match ? { parts: match.slice(1, 4).map(Number), prerelease: match[4] || null } : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) throw new Error('Malformed Codex release version');
  for (let i = 0; i < 3; i += 1) {
    if (a.parts[i] !== b.parts[i]) return a.parts[i] > b.parts[i] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

function resolveOnPath(name, envPath = process.env.PATH || '') {
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* keep searching */ }
  }
  return null;
}

function codexSearchPath({
  envPath = process.env.PATH || '',
  homeDir = os.homedir(),
} = {}) {
  return [
    envPath,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, '.npm-global', 'bin'),
    path.join(homeDir, '.bun', 'bin'),
    path.join(homeDir, '.volta', 'bin'),
    path.join(homeDir, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
  ].filter(Boolean).join(path.delimiter);
}

function resolveCodexExecutable({ envPath = codexSearchPath() } = {}) {
  return resolveOnPath('codex', envPath);
}

function installKindFor(executable) {
  let resolved = executable;
  try { resolved = fs.realpathSync(executable); } catch { /* retain the PATH entry */ }
  const normalized = `${executable}\n${resolved}`.replace(/\\/g, '/').toLowerCase();
  if (/\/cellar\/codex\/|\/homebrew\/caskroom\/codex\//.test(normalized)) return 'homebrew';
  if (/\/node_modules\/(?:@openai\/)?codex\//.test(normalized)
    || /\/(?:npm|pnpm|bun)\/.*codex/.test(normalized)) return 'npm';
  return 'standalone';
}

function requestJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GBlockParty-Chromux-Codex-Update-Check',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body, 'utf8') > 2 * 1024 * 1024) request.destroy(new Error('Codex update response was too large'));
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Codex update source returned HTTP ${response.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Codex update source returned malformed JSON')); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Codex update check timed out')));
    request.on('error', reject);
  });
}

function runFile(file, args, { timeoutMs = DEFAULT_TIMEOUT_MS, onOutput = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, {
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: 'utf8',
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = boundedText(stdout, MAX_OUTPUT_BYTES);
        error.stderr = boundedText(stderr, MAX_OUTPUT_BYTES);
        reject(error);
        return;
      }
      resolve({ stdout: boundedText(stdout, MAX_OUTPUT_BYTES), stderr: boundedText(stderr, MAX_OUTPUT_BYTES) });
    });
    if (typeof onOutput === 'function') {
      for (const stream of [child.stdout, child.stderr]) {
        if (stream) stream.on('data', (chunk) => onOutput(boundedText(chunk, 4000)));
      }
    }
  });
}

function createCodexUpdateService({
  envPath = codexSearchPath(),
  now = () => Date.now(),
  request = requestJson,
  run = runFile,
  resolveExecutable = () => resolveCodexExecutable({ envPath }),
  cacheMs = DEFAULT_CACHE_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let cache = null;

  async function installedVersion(executable) {
    const result = await run(executable, ['--version'], { timeoutMs });
    const version = parseVersion(result.stdout || result.stderr);
    if (!version) throw new Error('Could not read the installed Codex version');
    return version;
  }

  async function latestFor(installKind) {
    if (installKind === 'homebrew') {
      const payload = await request(HOMEBREW_CASK_URL, { timeoutMs });
      const version = parseVersion(payload && payload.version);
      if (!version) throw new Error('Homebrew returned a malformed Codex release');
      return { version, releaseUrl: RELEASE_URL };
    }

    const release = await request(GITHUB_LATEST_URL, { timeoutMs });
    const version = parseVersion(release && release.tag_name);
    if (!version) throw new Error('GitHub returned a malformed Codex release');
    if (installKind === 'npm') {
      let packageInfo;
      try {
        packageInfo = await request(`${NPM_PACKAGE_URL}/${encodeURIComponent(version)}`, { timeoutMs });
      } catch {
        throw new Error(`Codex ${version} is not yet available from npm`);
      }
      if (!packageInfo || parseVersion(packageInfo.version) !== version) {
        throw new Error(`Codex ${version} is not yet available from npm`);
      }
    }
    return {
      version,
      releaseUrl: typeof release.html_url === 'string' ? release.html_url : RELEASE_URL,
    };
  }

  async function check({ force = false } = {}) {
    if (!force && cache && now() - Date.parse(cache.checkedAt) < cacheMs) return { ...cache };
    try {
      const executable = resolveExecutable();
      if (!executable) throw new Error('Codex executable was not found on PATH');
      const currentVersion = await installedVersion(executable);
      const installKind = installKindFor(executable);
      const latest = await latestFor(installKind);
      const status = {
        currentVersion,
        latestVersion: latest.version,
        updateAvailable: compareVersions(latest.version, currentVersion) > 0,
        installKind,
        releaseUrl: latest.releaseUrl,
        checkedAt: new Date(now()).toISOString(),
        error: null,
      };
      cache = status;
      return { ...status };
    } catch (error) {
      return {
        currentVersion: null,
        latestVersion: null,
        updateAvailable: null,
        installKind: null,
        releaseUrl: RELEASE_URL,
        checkedAt: new Date(now()).toISOString(),
        error: sanitizeError(error),
      };
    }
  }

  async function install({ onProgress = null } = {}) {
    const before = await check();
    if (before.error) return { ...before, ok: false };
    const executable = resolveExecutable();
    if (!executable) return { ...before, ok: false, error: 'Codex executable was not found on PATH' };
    const output = [];
    const emit = (chunk) => {
      const text = boundedText(chunk, 4000);
      if (!text) return;
      output.push(text);
      while (Buffer.byteLength(output.join(''), 'utf8') > MAX_OUTPUT_BYTES) output.shift();
      if (typeof onProgress === 'function') onProgress({ phase: 'installing', output: text });
    };
    try {
      await run(executable, ['update'], { timeoutMs: 5 * 60 * 1000, onOutput: emit });
      cache = null;
      const afterExecutable = resolveExecutable();
      if (!afterExecutable) throw new Error('Codex disappeared after the update');
      const resultingVersion = await installedVersion(afterExecutable);
      if (compareVersions(resultingVersion, before.currentVersion) <= 0
        || (before.updateAvailable && compareVersions(resultingVersion, before.latestVersion) < 0)) {
        throw new Error(`Codex update verification failed (still ${resultingVersion})`);
      }
      const status = {
        currentVersion: resultingVersion,
        latestVersion: before.latestVersion,
        updateAvailable: compareVersions(before.latestVersion, resultingVersion) > 0,
        installKind: installKindFor(afterExecutable),
        releaseUrl: before.releaseUrl,
        checkedAt: new Date(now()).toISOString(),
        error: null,
      };
      cache = status;
      const result = { ...status, ok: true, output: boundedText(output.join(''), MAX_OUTPUT_BYTES) };
      if (typeof onProgress === 'function') onProgress({ phase: 'complete', output: '', status: result });
      return result;
    } catch (error) {
      const result = {
        ...before,
        ok: false,
        error: sanitizeError(error),
        output: boundedText(output.join(''), MAX_OUTPUT_BYTES),
      };
      if (typeof onProgress === 'function') onProgress({ phase: 'failed', output: '', status: result });
      return result;
    }
  }

  return { check, install };
}

module.exports = {
  DEFAULT_CACHE_MS,
  DEFAULT_TIMEOUT_MS,
  GITHUB_LATEST_URL,
  HOMEBREW_CASK_URL,
  NPM_PACKAGE_URL,
  codexSearchPath,
  compareVersions,
  createCodexUpdateService,
  installKindFor,
  parseVersion,
  resolveCodexExecutable,
  resolveOnPath,
  sanitizeError,
};
