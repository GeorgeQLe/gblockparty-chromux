'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  GITHUB_LATEST_URL,
  HOMEBREW_CASK_URL,
  NPM_PACKAGE_URL,
  createCodexUpdateService,
  resolveOnPath,
} = require('../codex-update-service');

function fixture({
  executable = '/opt/homebrew/Cellar/codex/1.2.3/bin/codex',
  current = '1.2.3',
  latest = '1.2.4',
  now = 1_800_000_000_000,
  npmReady = true,
  envPath = '/augmented/codex/path',
  retryDelaysMs = [],
  wait = async () => {},
} = {}) {
  let installed = current;
  let clock = now;
  const calls = [];
  const runPaths = [];
  const service = createCodexUpdateService({
    envPath,
    now: () => clock,
    retryDelaysMs,
    wait,
    resolveExecutable: () => executable,
    run: async (_file, args, options = {}) => {
      calls.push(['run', ...args]);
      runPaths.push(options.env && options.env.PATH);
      if (args[0] === '--version') return { stdout: `codex-cli ${installed}\n`, stderr: '' };
      if (args[0] === 'update') {
        if (options.onOutput) options.onOutput('installing fixture\n');
        installed = latest;
        return { stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected run: ${args.join(' ')}`);
    },
    request: async (url) => {
      calls.push(['request', url]);
      if (url === HOMEBREW_CASK_URL) return { version: latest };
      if (url === GITHUB_LATEST_URL) return { tag_name: `rust-v${latest}`, html_url: `https://github.com/openai/codex/releases/tag/rust-v${latest}` };
      if (url === `${NPM_PACKAGE_URL}/${latest}`) return npmReady ? { version: latest } : {};
      throw new Error(`Unexpected URL: ${url}`);
    },
  });
  return {
    service,
    calls,
    runPaths,
    envPath,
    advance: (ms) => { clock += ms; },
    setInstalled: (value) => { installed = value; },
  };
}

(async () => {
  const pathFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-codex-path-'));
  const pathFixtureExecutable = path.join(pathFixtureDir, 'codex.exe');
  fs.writeFileSync(pathFixtureExecutable, '', { mode: 0o755 });
  assert.equal(
    resolveOnPath('codex', pathFixtureDir, { platform: 'win32', pathExt: '.EXE;.CMD' }),
    pathFixtureExecutable,
    'Windows executable lookup should honor PATHEXT without shell interpolation',
  );
  fs.rmSync(pathFixtureDir, { recursive: true, force: true });

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-codex-update-'));
  const windowsFixture = process.platform === 'win32';
  const fixtureExecutable = path.join(fixtureDir, windowsFixture ? 'codex.exe' : 'codex');
  const fixtureVersion = process.version.replace(/^v/, '');
  if (windowsFixture) {
    fs.copyFileSync(process.execPath, fixtureExecutable);
  } else {
    fs.symlinkSync(process.execPath, fixtureExecutable);
  }
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '/usr/bin:/bin';
    const augmentedPath = [
      fixtureDir,
      path.dirname(process.execPath),
      '/usr/bin',
      '/bin',
    ].join(path.delimiter);
    const realChild = createCodexUpdateService({
      envPath: augmentedPath,
      request: async (url) => {
        assert.equal(url, GITHUB_LATEST_URL);
        return {
          tag_name: `rust-v${fixtureVersion}`,
          html_url: `https://github.com/openai/codex/releases/tag/rust-v${fixtureVersion}`,
        };
      },
    });
    const realChildStatus = await realChild.check();
    assert.equal(realChildStatus.error, null, `Node-based Codex launchers should execute with the augmented service PATH: ${realChildStatus.error}`);
    assert.equal(realChildStatus.currentVersion, fixtureVersion);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }

  const brew = fixture();
  const first = await brew.service.check();
  assert.equal(first.installKind, 'homebrew');
  assert.equal(first.currentVersion, '1.2.3');
  assert.equal(first.latestVersion, '1.2.4');
  assert.equal(first.updateAvailable, true);
  const callCount = brew.calls.length;
  await brew.service.check();
  assert.equal(brew.calls.length, callCount, 'fresh successful checks should use the one-hour cache');
  await brew.service.check({ force: true });
  assert.ok(brew.calls.length > callCount, 'forced checks should bypass the one-hour cache');
  const forcedCallCount = brew.calls.length;
  brew.advance(60 * 60 * 1000 + 1);
  await brew.service.check();
  assert.ok(brew.calls.length > forcedCallCount, 'stale cache should refresh');
  assert.ok(brew.calls.some((call) => call[1] === HOMEBREW_CASK_URL), 'Homebrew installs must use cask metadata');
  const brewLag = fixture({ current: '1.2.4', latest: '1.2.3' });
  assert.equal((await brewLag.service.check()).updateAvailable, false, 'Homebrew cask lag must not suggest an unavailable update');

  const standalone = fixture({ executable: '/usr/local/bin/codex' });
  const standaloneStatus = await standalone.service.check();
  assert.equal(standaloneStatus.installKind, 'standalone');
  assert.ok(standalone.calls.some((call) => call[1] === GITHUB_LATEST_URL));
  assert.ok(!standalone.calls.some((call) => call[1] === NPM_PACKAGE_URL));

  const npm = fixture({ executable: '/usr/local/lib/node_modules/@openai/codex/bin/codex.js' });
  const npmStatus = await npm.service.check();
  assert.equal(npmStatus.installKind, 'npm');
  assert.ok(npm.calls.some((call) => call[1] === `${NPM_PACKAGE_URL}/1.2.4`), 'npm installs must wait for npm readiness');

  const npmLag = fixture({
    executable: '/usr/local/lib/node_modules/@openai/codex/bin/codex.js',
    npmReady: false,
  });
  assert.match((await npmLag.service.check()).error, /not yet available from npm/);

  const missing = createCodexUpdateService({ resolveExecutable: () => null, retryDelaysMs: [] });
  assert.match((await missing.check()).error, /not found on PATH/);

  for (const error of [new Error('offline fixture'), new Error('Codex update check timed out')]) {
    const failing = createCodexUpdateService({
      resolveExecutable: () => '/usr/local/bin/codex',
      run: async () => ({ stdout: 'codex 1.2.3', stderr: '' }),
      request: async () => { throw error; },
      retryDelaysMs: [],
    });
    assert.match((await failing.check()).error, new RegExp(error.message));
  }

  const malformed = createCodexUpdateService({
    resolveExecutable: () => '/usr/local/bin/codex',
    run: async () => ({ stdout: 'codex 1.2.3', stderr: '' }),
    request: async () => ({ tag_name: 'nightly' }),
    retryDelaysMs: [],
  });
  assert.match((await malformed.check()).error, /malformed Codex release/);

  const retryWaits = [];
  let retryResolves = 0;
  let retryRuns = 0;
  let retryRequests = 0;
  const transient = createCodexUpdateService({
    resolveExecutable: () => {
      retryResolves += 1;
      return '/usr/local/bin/codex';
    },
    run: async () => {
      retryRuns += 1;
      return { stdout: 'codex 1.2.3', stderr: '' };
    },
    request: async () => {
      retryRequests += 1;
      if (retryRequests < 3) throw new Error(`transient attempt ${retryRequests}`);
      return {
        tag_name: 'rust-v1.2.4',
        html_url: 'https://github.com/openai/codex/releases/tag/rust-v1.2.4',
      };
    },
    retryDelaysMs: [1000, 2000],
    wait: async (delayMs) => { retryWaits.push(delayMs); },
  });
  const transientStatus = await transient.check();
  assert.equal(transientStatus.error, null, 'failure/failure/success should return only the successful status');
  assert.deepEqual(
    [retryResolves, retryRuns, retryRequests],
    [3, 3, 3],
    'failure/failure/success should rerun executable detection, version detection, and release lookup',
  );
  assert.deepEqual(retryWaits, [1000, 2000], 'automatic retries should wait one second and then two seconds');

  const failedWaits = [];
  let failedAttempts = 0;
  const exhausted = createCodexUpdateService({
    resolveExecutable: () => '/usr/local/bin/codex',
    run: async () => {
      failedAttempts += 1;
      throw new Error(`unsafe\u0000 final ${failedAttempts}`);
    },
    retryDelaysMs: [1000, 2000],
    wait: async (delayMs) => { failedWaits.push(delayMs); },
  });
  const exhaustedStatus = await exhausted.check();
  assert.equal(failedAttempts, 3, 'three consecutive failures should stop after the third attempt');
  assert.deepEqual(failedWaits, [1000, 2000], 'final failure should be returned only after both retry delays');
  assert.equal(exhaustedStatus.error, 'unsafe final 3', 'only the final sanitized failure should be exposed');

  const install = fixture();
  const progress = [];
  const installed = await install.service.install({ onProgress: (item) => progress.push(item.phase) });
  assert.equal(installed.ok, true);
  assert.equal(installed.currentVersion, '1.2.4');
  assert.ok(progress.includes('installing') && progress.includes('complete'));
  assert.deepEqual(
    install.runPaths,
    [install.envPath, install.envPath, install.envPath],
    'initial version detection, update execution, and verification must share the augmented PATH',
  );

  const verification = fixture();
  const originalCheck = await verification.service.check();
  assert.equal(originalCheck.updateAvailable, true);
  verification.setInstalled('1.2.3');
  const brokenService = createCodexUpdateService({
    resolveExecutable: () => '/opt/homebrew/Cellar/codex/1.2.3/bin/codex',
    run: async (_file, args) => args[0] === '--version'
      ? { stdout: 'codex 1.2.3', stderr: '' }
      : { stdout: '', stderr: '' },
    request: async () => ({ version: '1.2.4' }),
  });
  assert.match((await brokenService.install()).error, /verification failed/);

  console.log('CODEX_UPDATE_SERVICE_OK');
})().catch((error) => {
  console.error('CODEX_UPDATE_SERVICE_FAIL');
  console.error(error.stack || error.message);
  process.exit(1);
});
