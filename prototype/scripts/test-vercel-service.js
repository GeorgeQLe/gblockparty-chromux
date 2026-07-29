'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createPkce,
  createVercelService,
  redactSecrets,
} = require('../vercel-service');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-vercel-'));
const credentialFile = path.join(temp, 'credentials.json');
const projectsFile = path.join(temp, 'projects.json');
const calls = [];
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').replace(/^sealed:/, ''),
};

async function run(location, args, options = {}) {
  calls.push({ location, args: [...args], options: { ...options, env: { ...options.env } } });
  if (args[0] === '--version') return { ok: true, stdout: 'Vercel CLI 42.1.0\n', stderr: '', code: 0 };
  if (args[0] === 'whoami') {
    return options.env?.VERCEL_TOKEN === 'pat-secret'
      ? { ok: true, stdout: 'george\n', stderr: '', code: 0 }
      : { ok: false, stdout: '', stderr: 'Not authenticated', code: 1 };
  }
  return { ok: false, stdout: '', stderr: 'unexpected', code: 1 };
}

(async () => {
  const pkce = createPkce(() => Buffer.alloc(32, 7));
  assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(pkce.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notStrictEqual(pkce.verifier, pkce.challenge);

  const redacted = redactSecrets(
    'argv pat-secret bearer oauth-secret',
    ['pat-secret', 'oauth-secret'],
  );
  assert.strictEqual(redacted, 'argv [REDACTED] bearer [REDACTED]');

  const service = createVercelService({
    credentialFile,
    projectsFile,
    safeStorage,
    run,
    canonicalize: async (location) => ({
      ...location,
      cwd: location.runtime === 'wsl'
        ? path.posix.normalize(location.cwd)
        : fs.realpathSync(location.cwd),
    }),
    readProjectLink: async (location) => {
      const file = path.join(location.cwd, '.vercel', 'project.json');
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    },
    gitRoot: async (location) => ({ ...location, cwd: path.dirname(location.cwd) }),
  });

  const unavailable = createVercelService({
    credentialFile: path.join(temp, 'unavailable.json'),
    projectsFile: path.join(temp, 'unavailable-projects.json'),
    safeStorage: { isEncryptionAvailable: () => false },
    run: async (_location, args) => (
      args[0] === 'whoami'
        ? { ok: true, stdout: 'cli-user\n', stderr: '', code: 0 }
        : { ok: true, stdout: 'Vercel CLI 42.1.0\n', stderr: '', code: 0 }
    ),
    canonicalize: async (location) => location,
    readProjectLink: async () => null,
    gitRoot: async () => null,
  });
  const refused = await unavailable.connectToken({
    id: 'personal',
    label: 'Personal',
    token: 'never-write-me',
    location: { runtime: 'host', cwd: temp },
  });
  assert.strictEqual(refused.error.code, 'SECURE_STORAGE_UNAVAILABLE');
  assert.strictEqual(fs.existsSync(path.join(temp, 'unavailable.json')), false);
  const cliWithoutEncryption = await unavailable.connectCli({
    id: 'cli-host',
    label: 'Host CLI',
    location: { runtime: 'host', cwd: temp },
  });
  assert.strictEqual(cliWithoutEncryption.ok, true);
  assert.strictEqual(unavailable.connections().profiles[0].kind, 'cli');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(temp, 'unavailable.json'), 'utf8')).encrypted, undefined);

  const capability = await service.capability({ runtime: 'host', cwd: temp });
  assert.strictEqual(capability.ok, true);
  assert.strictEqual(capability.cli.available, true);
  assert.strictEqual(capability.cli.version, '42.1.0');
  assert(!JSON.stringify(capability).includes('pat-secret'));

  const connected = await service.connectToken({
    id: 'personal',
    label: 'Personal account',
    token: 'pat-secret',
    location: { runtime: 'host', cwd: temp },
  });
  assert.strictEqual(connected.ok, true);
  assert.strictEqual(connected.profile.kind, 'token');
  assert.strictEqual(connected.profile.account, 'george');
  assert(!JSON.stringify(connected).includes('pat-secret'));
  const diskCredentials = fs.readFileSync(credentialFile, 'utf8');
  assert(!diskCredentials.includes('pat-secret'));
  assert.strictEqual(fs.statSync(credentialFile).mode & 0o777, 0o600);
  assert(calls.some((call) => call.args[0] === 'whoami'
    && call.options.env.VERCEL_TOKEN === 'pat-secret'));
  assert(calls.every((call) => !call.args.includes('pat-secret')));

  const profileList = service.connections();
  assert.strictEqual(profileList.profiles.length, 1);
  assert(!JSON.stringify(profileList).includes('pat-secret'));

  const repo = path.join(temp, 'repo');
  const app = path.join(repo, 'apps', 'web');
  fs.mkdirSync(path.join(app, '.vercel'), { recursive: true });
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, '.vercel', 'project.json'), JSON.stringify({
    orgId: 'team_123',
    projectId: 'prj_123',
  }));
  const discovery = await service.discoverProject({
    runtime: 'host',
    cwd: path.join(app, 'src'),
  });
  assert.strictEqual(discovery.ok, true);
  assert.strictEqual(discovery.deployRoot.cwd, fs.realpathSync(app));
  assert.strictEqual(discovery.repositoryRoot.cwd, fs.realpathSync(app));
  assert.strictEqual(discovery.source, 'vercel-link');
  assert.strictEqual(discovery.link.projectId, 'prj_123');

  const saved = await service.saveProject({
    location: { runtime: 'host', cwd: repo },
    repositoryRoot: repo,
    deployRoot: app,
    profileId: 'personal',
    orgId: 'team_123',
    projectId: 'prj_123',
    trigger: 'direct',
    productionBranch: 'main',
    rememberedEnvironment: 'preview',
  });
  assert.strictEqual(saved.ok, true);
  assert.strictEqual(service.projects().projects.length, 1);
  assert.strictEqual(fs.statSync(projectsFile).mode & 0o777, 0o600);

  const invalidIds = await service.saveProject({
    location: { runtime: 'host', cwd: repo },
    repositoryRoot: repo,
    deployRoot: app,
    profileId: 'personal',
    orgId: 'team id with spaces',
    projectId: 'prj_123',
    trigger: 'direct',
  });
  assert.strictEqual(invalidIds.error.code, 'INVALID_PROJECT');

  fs.writeFileSync(projectsFile, '{corrupt', { mode: 0o600 });
  assert.deepStrictEqual(service.projects().projects, []);

  const removed = await service.removeConnection('personal');
  assert.strictEqual(removed.ok, true);
  assert.strictEqual(service.connections().profiles.length, 0);

  let clock = Date.now();
  const oauthCalls = [];
  const oauthService = createVercelService({
    credentialFile: path.join(temp, 'oauth-credentials.json'),
    projectsFile: path.join(temp, 'oauth-projects.json'),
    safeStorage,
    run: async (location, args, options = {}) => {
      calls.push({ location, args, options });
      return options.env?.VERCEL_TOKEN === 'oauth-refreshed'
        ? { ok: true, stdout: 'oauth-user\n', stderr: '', code: 0 }
        : { ok: false, stdout: '', stderr: 'expired', code: 1 };
    },
    canonicalize: async (location) => location,
    readProjectLink: async () => null,
    gitRoot: async () => null,
    oauthClientId: 'cl_public',
    now: () => clock,
    randomBytes: (size) => Buffer.alloc(size, 9),
    oauthRequest: async (kind, payload) => {
      oauthCalls.push({ kind, payload });
      if (kind === 'exchange') return {
        accessToken: 'oauth-initial',
        refreshToken: 'oauth-refresh-1',
        expiresIn: 1,
        account: 'oauth-user',
      };
      if (kind === 'refresh') return {
        accessToken: 'oauth-refreshed',
        refreshToken: 'oauth-refresh-2',
        expiresIn: 3600,
      };
      if (kind === 'revoke') return {};
      throw new Error('unexpected oauth request');
    },
  });
  const oauthStart = oauthService.beginOAuth({
    id: 'oauth',
    label: 'OAuth account',
    redirectUri: 'http://127.0.0.1:43123/callback',
  });
  assert.strictEqual(oauthStart.ok, true);
  assert.match(oauthStart.authorizationUrl, /^https:\/\/vercel\.com\/oauth\/authorize\?/);
  assert.match(oauthStart.authorizationUrl, /code_challenge_method=S256/);
  const wrongState = await oauthService.completeOAuth({
    state: 'wrong',
    nonce: oauthStart.nonce,
    code: 'code',
  });
  assert.strictEqual(wrongState.error.code, 'OAUTH_STATE_MISMATCH');
  const oauthStart2 = oauthService.beginOAuth({
    id: 'oauth',
    label: 'OAuth account',
    redirectUri: 'http://127.0.0.1:43123/callback',
  });
  const oauthConnected = await oauthService.completeOAuth({
    state: oauthStart2.state,
    nonce: oauthStart2.nonce,
    code: 'short-lived-code',
  });
  assert.strictEqual(oauthConnected.ok, true);
  assert(!JSON.stringify(oauthConnected).includes('oauth-initial'));
  clock += 2_000;
  const oauthValidated = await oauthService.validateConnection('oauth', {
    runtime: 'host',
    cwd: temp,
  });
  assert.strictEqual(oauthValidated.ok, true);
  assert(oauthCalls.some((call) => call.kind === 'refresh'
    && call.payload.refreshToken === 'oauth-refresh-1'));
  const oauthRemoved = await oauthService.removeConnection('oauth');
  assert.strictEqual(oauthRemoved.ok, true);
  assert(oauthCalls.some((call) => call.kind === 'revoke'));
  console.log('VERCEL_SERVICE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
