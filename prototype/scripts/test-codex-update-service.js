'use strict';

const assert = require('assert');
const {
  GITHUB_LATEST_URL,
  HOMEBREW_CASK_URL,
  NPM_PACKAGE_URL,
  createCodexUpdateService,
} = require('../codex-update-service');

function fixture({
  executable = '/opt/homebrew/Cellar/codex/1.2.3/bin/codex',
  current = '1.2.3',
  latest = '1.2.4',
  now = 1_800_000_000_000,
  npmReady = true,
} = {}) {
  let installed = current;
  let clock = now;
  const calls = [];
  const service = createCodexUpdateService({
    now: () => clock,
    resolveExecutable: () => executable,
    run: async (_file, args, options = {}) => {
      calls.push(['run', ...args]);
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
  return { service, calls, advance: (ms) => { clock += ms; }, setInstalled: (value) => { installed = value; } };
}

(async () => {
  const brew = fixture();
  const first = await brew.service.check();
  assert.equal(first.installKind, 'homebrew');
  assert.equal(first.currentVersion, '1.2.3');
  assert.equal(first.latestVersion, '1.2.4');
  assert.equal(first.updateAvailable, true);
  const callCount = brew.calls.length;
  await brew.service.check();
  assert.equal(brew.calls.length, callCount, 'fresh successful checks should use the one-hour cache');
  brew.advance(60 * 60 * 1000 + 1);
  await brew.service.check();
  assert.ok(brew.calls.length > callCount, 'stale cache should refresh');
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

  const missing = createCodexUpdateService({ resolveExecutable: () => null });
  assert.match((await missing.check()).error, /not found on PATH/);

  for (const error of [new Error('offline fixture'), new Error('Codex update check timed out')]) {
    const failing = createCodexUpdateService({
      resolveExecutable: () => '/usr/local/bin/codex',
      run: async () => ({ stdout: 'codex 1.2.3', stderr: '' }),
      request: async () => { throw error; },
    });
    assert.match((await failing.check()).error, new RegExp(error.message));
  }

  const malformed = createCodexUpdateService({
    resolveExecutable: () => '/usr/local/bin/codex',
    run: async () => ({ stdout: 'codex 1.2.3', stderr: '' }),
    request: async () => ({ tag_name: 'nightly' }),
  });
  assert.match((await malformed.check()).error, /malformed Codex release/);

  const install = fixture();
  const progress = [];
  const installed = await install.service.install({ onProgress: (item) => progress.push(item.phase) });
  assert.equal(installed.ok, true);
  assert.equal(installed.currentVersion, '1.2.4');
  assert.ok(progress.includes('installing') && progress.includes('complete'));

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
