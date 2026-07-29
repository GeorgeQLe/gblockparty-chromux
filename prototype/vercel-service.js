'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CREDENTIAL_SCHEMA_VERSION = 1;
const PROJECT_SCHEMA_VERSION = 1;
const MAX_PROFILES = 20;
const MAX_PROJECTS = 200;
const MAX_PATH_CHARS = 8192;
const PROFILE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const VERCEL_ID_RE = /^[a-zA-Z0-9_-]{1,160}$/;

function base64url(value) {
  return Buffer.from(value).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPkce(randomBytes = crypto.randomBytes) {
  const verifier = base64url(randomBytes(32));
  return {
    verifier,
    challenge: base64url(crypto.createHash('sha256').update(verifier).digest()),
  };
}

function redactSecrets(value, secrets = []) {
  let output = String(value || '');
  for (const secret of secrets.filter((candidate) => typeof candidate === 'string' && candidate.length >= 4)) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bVERCEL_TOKEN\s*=\s*[^\s]+/gi, 'VERCEL_TOKEN=[REDACTED]');
}

function bounded(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max && !text.includes('\0') ? text : null;
}

function safeLocation(input) {
  if (!input || !['host', 'wsl'].includes(input.runtime)) return null;
  const cwd = bounded(input.cwd, MAX_PATH_CHARS);
  const distro = input.runtime === 'wsl' ? bounded(input.distro, 120) : null;
  if (!cwd || (input.runtime === 'host' ? !path.isAbsolute(cwd) : !cwd.startsWith('/'))) return null;
  if (input.runtime === 'wsl' && !distro) return null;
  return { runtime: input.runtime, distro, cwd };
}

function publicProfile(record) {
  return {
    id: record.id,
    label: record.label,
    kind: record.kind,
    account: record.account || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeProfile(record) {
  if (!record || !PROFILE_ID_RE.test(record.id || '') || !['cli', 'token', 'oauth'].includes(record.kind)) return null;
  const label = bounded(record.label, 120);
  if (!label) return null;
  const normalized = {
    id: record.id,
    label,
    kind: record.kind,
    account: bounded(record.account, 200),
    createdAt: bounded(record.createdAt, 40) || new Date(0).toISOString(),
    updatedAt: bounded(record.updatedAt, 40) || new Date(0).toISOString(),
  };
  if (record.kind === 'token') {
    const token = bounded(record.token, 8192);
    if (!token) return null;
    normalized.token = token;
  }
  if (record.kind === 'oauth') {
    const accessToken = bounded(record.accessToken, 8192);
    if (!accessToken) return null;
    normalized.accessToken = accessToken;
    normalized.refreshToken = bounded(record.refreshToken, 8192);
    normalized.expiresAt = Number.isFinite(record.expiresAt) ? record.expiresAt : null;
    normalized.tokenType = bounded(record.tokenType, 40) || 'Bearer';
  }
  return normalized;
}

function normalizeProject(record) {
  if (!record || typeof record !== 'object') return null;
  const location = safeLocation(record.location);
  const repositoryRoot = bounded(record.repositoryRoot, MAX_PATH_CHARS);
  const deployRoot = bounded(record.deployRoot, MAX_PATH_CHARS);
  if (!location || !repositoryRoot || !deployRoot) return null;
  const separator = location.runtime === 'wsl' ? '/' : path.sep;
  const root = repositoryRoot.replace(/[\\/]+$/, '');
  if (deployRoot !== root && !deployRoot.startsWith(`${root}${separator}`)) return null;
  const trigger = ['direct', 'git'].includes(record.trigger) ? record.trigger : null;
  const profileId = bounded(record.profileId, 64);
  const orgId = bounded(record.orgId, 160);
  const projectId = bounded(record.projectId, 160);
  if (!trigger || !profileId || !VERCEL_ID_RE.test(orgId || '') || !VERCEL_ID_RE.test(projectId || '')) {
    return null;
  }
  const key = [location.runtime, location.distro || '', repositoryRoot, deployRoot].join('\0');
  return {
    key: base64url(crypto.createHash('sha256').update(key).digest()).slice(0, 32),
    location: { runtime: location.runtime, distro: location.distro, cwd: repositoryRoot },
    repositoryRoot,
    deployRoot,
    profileId,
    orgId,
    projectId,
    trigger,
    productionBranch: bounded(record.productionBranch, 250),
    rememberedEnvironment: ['preview', 'production'].includes(record.rememberedEnvironment)
      ? record.rememberedEnvironment : null,
    updatedAt: bounded(record.updatedAt, 40) || new Date().toISOString(),
  };
}

function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort on filesystems without POSIX modes */ }
}

function createVercelService({
  credentialFile,
  projectsFile,
  safeStorage,
  run,
  canonicalize,
  readProjectLink,
  gitRoot,
  oauthRequest = null,
  oauthClientId = null,
  oauthAuthorizeUrl = 'https://vercel.com/oauth/authorize',
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
}) {
  const pendingOAuth = new Map();

  function error(code, message, details = '') {
    return {
      ok: false,
      error: {
        code,
        message,
        details: redactSecrets(String(details || '')).slice(0, 4000),
      },
    };
  }

  function readCredentials() {
    try {
      const envelope = JSON.parse(fs.readFileSync(credentialFile, 'utf8'));
      if (envelope.schemaVersion !== CREDENTIAL_SCHEMA_VERSION) return [];
      const publicProfiles = Array.isArray(envelope.publicProfiles)
        ? envelope.publicProfiles.map(normalizeProfile).filter((profile) => profile?.kind === 'cli')
        : [];
      if (!safeStorage?.isEncryptionAvailable?.() || typeof envelope.encrypted !== 'string') {
        return publicProfiles.slice(0, MAX_PROFILES);
      }
      const plaintext = safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'));
      const payload = JSON.parse(plaintext);
      const secretProfiles = Array.isArray(payload.profiles)
        ? payload.profiles.map(normalizeProfile).filter((profile) => profile && profile.kind !== 'cli')
        : [];
      return [...publicProfiles, ...secretProfiles].slice(0, MAX_PROFILES);
    } catch {
      return [];
    }
  }

  function writeCredentials(profiles) {
    const clean = profiles.map(normalizeProfile).filter(Boolean).slice(0, MAX_PROFILES);
    const publicProfiles = clean.filter((profile) => profile.kind === 'cli');
    const secretProfiles = clean.filter((profile) => profile.kind !== 'cli');
    if (secretProfiles.length && !safeStorage?.isEncryptionAvailable?.()) {
      return error('SECURE_STORAGE_UNAVAILABLE', 'OS-backed encryption is unavailable. Use the Vercel CLI login instead.');
    }
    const envelope = {
      schemaVersion: CREDENTIAL_SCHEMA_VERSION,
      publicProfiles,
    };
    if (secretProfiles.length) {
      const encrypted = safeStorage.encryptString(JSON.stringify({
        schemaVersion: CREDENTIAL_SCHEMA_VERSION,
        profiles: secretProfiles,
      }));
      envelope.encrypted = Buffer.from(encrypted).toString('base64');
    }
    atomicJson(credentialFile, envelope);
    return { ok: true };
  }

  function readProjects() {
    try {
      const parsed = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
      if (parsed.schemaVersion !== PROJECT_SCHEMA_VERSION || !Array.isArray(parsed.projects)) return [];
      return parsed.projects.map(normalizeProject).filter(Boolean).slice(0, MAX_PROJECTS);
    } catch {
      return [];
    }
  }

  function writeProjects(projects) {
    const clean = projects.map(normalizeProject).filter(Boolean).slice(0, MAX_PROJECTS);
    atomicJson(projectsFile, { schemaVersion: PROJECT_SCHEMA_VERSION, projects: clean });
    return clean;
  }

  async function command(location, args, options = {}) {
    const valid = safeLocation(location);
    if (!valid || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      return { ok: false, stdout: '', stderr: 'Invalid Vercel command request.', code: -1 };
    }
    const response = await run(valid, args, options);
    const secrets = Object.values(options.env || {}).filter((value) => typeof value === 'string');
    return {
      ok: Boolean(response?.ok),
      stdout: redactSecrets(response?.stdout, secrets),
      stderr: redactSecrets(response?.stderr, secrets),
      code: Number.isInteger(response?.code) ? response.code : (response?.ok ? 0 : 1),
    };
  }

  async function tokenFor(profile) {
    if (profile.kind === 'token') return profile.token;
    if (profile.kind !== 'oauth') return null;
    if (!profile.expiresAt || profile.expiresAt - now() > 60_000) return profile.accessToken;
    if (!profile.refreshToken || typeof oauthRequest !== 'function') throw new Error('OAuth access expired; sign in again.');
    const refreshed = await oauthRequest('refresh', {
      clientId: oauthClientId,
      refreshToken: profile.refreshToken,
    });
    if (!refreshed?.accessToken) throw new Error('Vercel OAuth refresh failed.');
    const profiles = readCredentials();
    const target = profiles.find((candidate) => candidate.id === profile.id);
    if (!target) throw new Error('Connection was removed during refresh.');
    target.accessToken = refreshed.accessToken;
    target.refreshToken = refreshed.refreshToken || target.refreshToken;
    target.expiresAt = refreshed.expiresIn ? now() + (Number(refreshed.expiresIn) * 1000) : null;
    target.updatedAt = new Date(now()).toISOString();
    const saved = writeCredentials(profiles);
    if (!saved.ok) throw new Error(saved.error.message);
    return target.accessToken;
  }

  async function capability(location) {
    const valid = safeLocation(location);
    if (!valid) return error('INVALID_RUNTIME', 'Choose a valid macOS or WSL project runtime.');
    const response = await command(valid, ['--version'], { timeout: 8000 });
    const version = response.ok
      ? (response.stdout.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/) || [])[1] || null
      : null;
    return {
      ok: true,
      kind: 'capability',
      runtime: { runtime: valid.runtime, distro: valid.distro },
      cli: {
        available: response.ok,
        version,
        setupCommand: 'npm install --global vercel',
      },
      secureStorage: Boolean(safeStorage?.isEncryptionAvailable?.()),
    };
  }

  function connections() {
    return { ok: true, kind: 'connections', profiles: readCredentials().map(publicProfile) };
  }

  async function connectCli({ id = 'cli', label = 'Vercel CLI', location } = {}) {
    if (!PROFILE_ID_RE.test(id) || !bounded(label, 120)) return error('INVALID_PROFILE', 'Connection name is invalid.');
    const response = await command(location, ['whoami'], { timeout: 15000 });
    if (!response.ok) return error('CLI_NOT_AUTHENTICATED', 'Run `vercel login` in this runtime, then try again.', response.stderr);
    const timestamp = new Date(now()).toISOString();
    const profiles = readCredentials();
    const existing = profiles.find((profile) => profile.id === id);
    const profile = {
      id,
      label: label.trim(),
      kind: 'cli',
      account: bounded(response.stdout, 200),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const saved = writeCredentials([profile, ...profiles.filter((candidate) => candidate.id !== id)]);
    return saved.ok ? { ok: true, kind: 'connected', profile: publicProfile(profile) } : saved;
  }

  async function connectToken({ id, label, token, location } = {}) {
    if (!PROFILE_ID_RE.test(id || '') || !bounded(label, 120)) return error('INVALID_PROFILE', 'Connection name is invalid.');
    const cleanToken = bounded(token, 8192);
    if (!cleanToken) return error('INVALID_TOKEN', 'Enter a Vercel personal access token.');
    if (!safeStorage?.isEncryptionAvailable?.()) {
      return error('SECURE_STORAGE_UNAVAILABLE', 'OS-backed encryption is unavailable. Use the Vercel CLI login instead.');
    }
    const response = await command(location, ['whoami'], {
      timeout: 15000,
      env: { VERCEL_TOKEN: cleanToken },
    });
    if (!response.ok) return error('TOKEN_REJECTED', 'Vercel rejected this token.', redactSecrets(response.stderr, [cleanToken]));
    const timestamp = new Date(now()).toISOString();
    const profiles = readCredentials();
    const existing = profiles.find((profile) => profile.id === id);
    const profile = {
      id,
      label: label.trim(),
      kind: 'token',
      token: cleanToken,
      account: bounded(response.stdout, 200),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const saved = writeCredentials([profile, ...profiles.filter((candidate) => candidate.id !== id)]);
    return saved.ok ? { ok: true, kind: 'connected', profile: publicProfile(profile) } : saved;
  }

  function beginOAuth({ id, label, redirectUri } = {}) {
    if (!oauthClientId || typeof oauthRequest !== 'function') {
      return error('OAUTH_NOT_CONFIGURED', 'This Chromux build does not have a Vercel public OAuth client configured.');
    }
    if (!PROFILE_ID_RE.test(id || '') || !bounded(label, 120)) return error('INVALID_PROFILE', 'Connection name is invalid.');
    let callback;
    try { callback = new URL(redirectUri); } catch { return error('INVALID_CALLBACK', 'OAuth callback URL is invalid.'); }
    if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1') {
      return error('INVALID_CALLBACK', 'OAuth callbacks must use a temporary 127.0.0.1 loopback listener.');
    }
    const pkce = createPkce(randomBytes);
    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));
    pendingOAuth.set(state, {
      id,
      label: label.trim(),
      redirectUri: callback.toString(),
      verifier: pkce.verifier,
      nonce,
      expiresAt: now() + (10 * 60 * 1000),
    });
    const url = new URL(oauthAuthorizeUrl);
    url.searchParams.set('client_id', oauthClientId);
    url.searchParams.set('redirect_uri', callback.toString());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile offline_access');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { ok: true, kind: 'oauth-start', authorizationUrl: url.toString(), state, nonce };
  }

  async function completeOAuth({ state, code, nonce } = {}) {
    const pending = pendingOAuth.get(state);
    pendingOAuth.delete(state);
    if (!pending || pending.expiresAt < now() || pending.nonce !== nonce || !bounded(code, 4096)) {
      return error('OAUTH_STATE_MISMATCH', 'Vercel sign-in could not be verified. Start sign-in again.');
    }
    let tokens;
    try {
      tokens = await oauthRequest('exchange', {
        clientId: oauthClientId,
        code,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.verifier,
      });
    } catch (requestError) {
      return error('OAUTH_EXCHANGE_FAILED', 'Vercel sign-in failed.', requestError?.message);
    }
    if (!bounded(tokens?.accessToken, 8192)) return error('OAUTH_EXCHANGE_FAILED', 'Vercel did not return an access token.');
    const timestamp = new Date(now()).toISOString();
    const profiles = readCredentials();
    const existing = profiles.find((profile) => profile.id === pending.id);
    const profile = {
      id: pending.id,
      label: pending.label,
      kind: 'oauth',
      account: bounded(tokens.account, 200),
      accessToken: tokens.accessToken,
      refreshToken: bounded(tokens.refreshToken, 8192),
      expiresAt: tokens.expiresIn ? now() + (Number(tokens.expiresIn) * 1000) : null,
      tokenType: bounded(tokens.tokenType, 40) || 'Bearer',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const saved = writeCredentials([profile, ...profiles.filter((candidate) => candidate.id !== profile.id)]);
    return saved.ok ? { ok: true, kind: 'connected', profile: publicProfile(profile) } : saved;
  }

  async function validateConnection(id, location) {
    const profile = readCredentials().find((candidate) => candidate.id === id);
    if (!profile) return error('UNKNOWN_CONNECTION', 'The selected Vercel connection no longer exists.');
    let token;
    try { token = await tokenFor(profile); } catch (tokenError) {
      return error('CONNECTION_EXPIRED', tokenError.message);
    }
    const response = await command(location, ['whoami'], {
      timeout: 15000,
      env: token ? { VERCEL_TOKEN: token } : {},
    });
    return response.ok
      ? { ok: true, kind: 'validated', profile: publicProfile({ ...profile, account: bounded(response.stdout, 200) || profile.account }) }
      : error('CONNECTION_REJECTED', 'Vercel rejected this connection.', response.stderr);
  }

  async function removeConnection(id) {
    const profiles = readCredentials();
    const profile = profiles.find((candidate) => candidate.id === id);
    if (!profile) return error('UNKNOWN_CONNECTION', 'The Vercel connection no longer exists.');
    let revokeWarning = null;
    if (profile.kind === 'oauth' && typeof oauthRequest === 'function') {
      try {
        await oauthRequest('revoke', {
          clientId: oauthClientId,
          token: profile.accessToken,
          refreshToken: profile.refreshToken,
        });
      } catch {
        revokeWarning = 'The local connection was removed, but remote token revocation could not be confirmed.';
      }
    }
    const saved = writeCredentials(profiles.filter((candidate) => candidate.id !== id));
    return saved.ok ? { ok: true, kind: 'removed', profileId: id, warning: revokeWarning } : saved;
  }

  async function discoverProject(input) {
    const initial = safeLocation(input);
    if (!initial) return error('INVALID_RUNTIME', 'Choose a valid project directory.');
    let canonical;
    try { canonical = safeLocation(await canonicalize(initial)); } catch {
      return error('PROJECT_UNAVAILABLE', 'The selected project directory is unavailable.');
    }
    if (!canonical) return error('PROJECT_UNAVAILABLE', 'The selected project directory is unavailable.');
    const modulePath = canonical.runtime === 'wsl' ? path.posix : path;
    let cursor = canonical.cwd;
    let linked = null;
    while (true) {
      const location = { ...canonical, cwd: cursor };
      const link = await readProjectLink(location);
      if (link && VERCEL_ID_RE.test(link.orgId || '') && VERCEL_ID_RE.test(link.projectId || '')) {
        linked = {
          deployRoot: location,
          link: { orgId: link.orgId, projectId: link.projectId },
        };
        break;
      }
      const parent = modulePath.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    const root = await gitRoot(canonical);
    const repository = safeLocation(root);
    if (linked) {
      return {
        ok: true,
        kind: 'project-discovery',
        source: 'vercel-link',
        repositoryRoot: repository || linked.deployRoot,
        deployRoot: linked.deployRoot,
        link: linked.link,
      };
    }
    return {
      ok: true,
      kind: 'project-discovery',
      source: repository ? 'git-root' : 'current-directory',
      repositoryRoot: repository || canonical,
      deployRoot: repository || canonical,
      link: null,
    };
  }

  function projects() {
    return { ok: true, kind: 'projects', projects: readProjects() };
  }

  async function saveProject(record) {
    const location = safeLocation(record?.location);
    if (!location) return error('INVALID_PROJECT', 'Vercel project runtime is invalid.');
    let repositoryRoot;
    let deployRoot;
    try {
      repositoryRoot = (await canonicalize({ ...location, cwd: record.repositoryRoot })).cwd;
      deployRoot = (await canonicalize({ ...location, cwd: record.deployRoot })).cwd;
    } catch {
      return error('PROJECT_UNAVAILABLE', 'The repository or deploy root is unavailable.');
    }
    const normalized = normalizeProject({
      ...record,
      location: { ...location, cwd: repositoryRoot },
      repositoryRoot,
      deployRoot,
      updatedAt: new Date(now()).toISOString(),
    });
    if (!normalized) return error('INVALID_PROJECT', 'Vercel project configuration is incomplete or outside the repository.');
    if (!readCredentials().some((profile) => profile.id === normalized.profileId)) {
      return error('UNKNOWN_CONNECTION', 'Connect the selected Vercel account before saving this project.');
    }
    const saved = writeProjects([
      normalized,
      ...readProjects().filter((candidate) => candidate.key !== normalized.key),
    ]);
    return { ok: true, kind: 'project-saved', project: saved.find((candidate) => candidate.key === normalized.key) };
  }

  function removeProject(key) {
    if (!bounded(key, 64)) return error('INVALID_PROJECT', 'Vercel project key is invalid.');
    const existing = readProjects();
    if (!existing.some((project) => project.key === key)) return error('UNKNOWN_PROJECT', 'Vercel project configuration no longer exists.');
    writeProjects(existing.filter((project) => project.key !== key));
    return { ok: true, kind: 'project-removed', key };
  }

  return {
    capability,
    connections,
    connectCli,
    connectToken,
    beginOAuth,
    completeOAuth,
    validateConnection,
    removeConnection,
    discoverProject,
    projects,
    saveProject,
    removeProject,
  };
}

module.exports = {
  CREDENTIAL_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  createPkce,
  createVercelService,
  normalizeProject,
  redactSecrets,
};
