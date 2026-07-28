'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CATALOG_SCHEMA_VERSION = 1;
const MAX_REPOSITORIES = 100;
const MAX_PATH_CHARS = 8192;
const MAX_LABEL_CHARS = 120;
const MAX_COMMIT_MESSAGE_CHARS = 1000;
const MAX_DIFF_BYTES = 256 * 1024;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function stableId(prefix, ...parts) {
  return `${prefix}-${crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 20)}`;
}

function isoTimestamp(value, fallback = null) {
  const time = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(time) || time < 0) return fallback;
  return new Date(time).toISOString();
}

function boundedText(value, limit) {
  return typeof value === 'string' && value.length <= limit && !value.includes('\0') ? value : null;
}

function parseWorktreePorcelain(output) {
  if (typeof output !== 'string') return [];
  const records = [];
  let current = null;
  for (const raw of output.split('\0')) {
    const field = raw.replace(/^\n+|\n+$/g, '');
    if (!field) {
      if (current && current.path) records.push(current);
      current = null;
      continue;
    }
    const space = field.indexOf(' ');
    const key = space < 0 ? field : field.slice(0, space);
    const value = space < 0 ? true : field.slice(space + 1);
    if (key === 'worktree') {
      if (current && current.path) records.push(current);
      current = {
        path: value,
        head: null,
        branch: null,
        detached: false,
        bare: false,
        locked: null,
        prunable: null,
      };
    } else if (current && key === 'HEAD') current.head = value;
    else if (current && key === 'branch') current.branch = value.replace(/^refs\/heads\//, '');
    else if (current && key === 'detached') current.detached = true;
    else if (current && key === 'bare') current.bare = true;
    else if (current && key === 'locked') current.locked = value === true ? 'locked' : value;
    else if (current && key === 'prunable') current.prunable = value === true ? 'prunable' : value;
  }
  if (current && current.path) records.push(current);
  return records;
}

function parseStatusPorcelainV2(output) {
  const result = {
    head: null,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    unborn: false,
    files: [],
  };
  if (typeof output !== 'string') return result;
  const fields = output.split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    if (field.startsWith('# ')) {
      const line = field.slice(2);
      if (line.startsWith('branch.oid ')) {
        const oid = line.slice(11);
        result.unborn = oid === '(initial)';
        result.head = result.unborn ? null : oid;
      } else if (line.startsWith('branch.head ')) {
        const branch = line.slice(12);
        result.branch = branch === '(detached)' ? null : branch;
      } else if (line.startsWith('branch.upstream ')) {
        result.upstream = line.slice(16);
      } else if (line.startsWith('branch.ab ')) {
        const match = /^\+(\d+) -(\d+)$/.exec(line.slice(10));
        if (match) {
          result.ahead = Number(match[1]);
          result.behind = Number(match[2]);
        }
      }
      continue;
    }
    const type = field[0];
    if (type === '?' || type === '!') {
      if (type === '?') result.files.push({
        path: field.slice(2),
        originalPath: null,
        index: '?',
        worktree: '?',
        kind: 'untracked',
        conflicted: false,
      });
      continue;
    }
    if (!['1', '2', 'u'].includes(type)) continue;
    const parts = field.split(' ');
    const xy = parts[1] || '  ';
    const pathIndex = type === '1' ? 8 : type === '2' ? 9 : 10;
    const filePath = parts.slice(pathIndex).join(' ');
    if (!filePath) continue;
    const originalPath = type === '2' ? (fields[++index] || null) : null;
    const conflicted = type === 'u' || xy.includes('U') || ['AA', 'DD'].includes(xy);
    result.files.push({
      path: filePath,
      originalPath,
      index: xy[0] || ' ',
      worktree: xy[1] || ' ',
      kind: conflicted ? 'conflict' : 'changed',
      conflicted,
    });
  }
  return result;
}

function rankWorktree(worktree) {
  if (worktree.conflicted || worktree.locked) return 0;
  if (worktree.stale && worktree.dirty) return 1;
  if (worktree.stale && (worktree.unpublished || worktree.ahead > 0)) return 2;
  if (worktree.dirty) return 3;
  if (worktree.ahead > 0 || worktree.unpublished) return 4;
  if (worktree.behind > 0) return 5;
  return 6;
}

async function mapWithConcurrency(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function lane() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, lane));
  return results;
}

function normalizeCatalogRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const runtime = record.runtime === 'wsl' ? 'wsl' : 'host';
  const root = boundedText(record.root, MAX_PATH_CHARS);
  const distro = runtime === 'wsl' ? boundedText(record.distro, 120) : null;
  if (!root || (runtime === 'host' && !path.isAbsolute(root)) || (runtime === 'wsl' && !root.startsWith('/'))) return null;
  const id = stableId('repo', runtime, distro || '', root);
  return {
    id,
    runtime,
    distro,
    root,
    label: boundedText(record.label, MAX_LABEL_CHARS) || path.basename(root) || root,
    firstSeenAt: isoTimestamp(record.firstSeenAt, new Date(0).toISOString()),
    lastSeenAt: isoTimestamp(record.lastSeenAt, new Date(0).toISOString()),
    lastSessionActivityAt: isoTimestamp(record.lastSessionActivityAt, new Date(0).toISOString()),
  };
}

function createGitWorktreeService({
  catalogFile,
  run,
  canonicalize,
  statMtime,
  now = () => Date.now(),
}) {
  function error(code, message, details = '') {
    return { ok: false, error: { code, message, details: String(details || '').slice(0, 4000) } };
  }

  function readCatalog() {
    try {
      const parsed = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
      if (!parsed || !Array.isArray(parsed.repositories)) return [];
      return parsed.repositories.map(normalizeCatalogRecord).filter(Boolean)
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
        .slice(0, MAX_REPOSITORIES);
    } catch {
      return [];
    }
  }

  function writeCatalog(repositories) {
    fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
    const normalized = repositories.map(normalizeCatalogRecord).filter(Boolean)
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .slice(0, MAX_REPOSITORIES);
    const temporary = `${catalogFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({
      schemaVersion: CATALOG_SCHEMA_VERSION,
      repositories: normalized,
    }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, catalogFile);
    try { fs.chmodSync(catalogFile, 0o600); } catch { /* best effort */ }
    return normalized;
  }

  async function resolveRoot(location) {
    if (!location || !['host', 'wsl'].includes(location.runtime)) return null;
    if (!boundedText(location.cwd, MAX_PATH_CHARS)) return null;
    const response = await run(location, ['rev-parse', '--show-toplevel'], { timeout: 4000 });
    if (!response.ok) return null;
    const root = response.stdout.trim();
    if (!root || root.includes('\0')) return null;
    try {
      return await canonicalize({ ...location, cwd: root });
    } catch {
      return null;
    }
  }

  async function observe(location) {
    const root = await resolveRoot(location);
    if (!root) return { ok: true, kind: 'observed', repository: null };
    const stamp = new Date(now()).toISOString();
    const repositories = readCatalog();
    const id = stableId('repo', location.runtime, location.distro || '', root);
    const existing = repositories.find((repository) => repository.id === id);
    const activity = isoTimestamp(location.activityAt, stamp);
    const repository = normalizeCatalogRecord({
      id,
      runtime: location.runtime,
      distro: location.distro || null,
      root,
      label: existing?.label || path.basename(root) || root,
      firstSeenAt: existing?.firstSeenAt || stamp,
      lastSeenAt: stamp,
      lastSessionActivityAt: Date.parse(activity) > Date.parse(existing?.lastSessionActivityAt || 0)
        ? activity : existing?.lastSessionActivityAt,
    });
    writeCatalog([repository, ...repositories.filter((candidate) => candidate.id !== id)]);
    return { ok: true, kind: 'observed', repository };
  }

  function catalog() {
    return { ok: true, kind: 'catalog', repositories: readCatalog() };
  }

  function forget(repositoryId) {
    if (typeof repositoryId !== 'string') return error('INVALID_REPOSITORY', 'Repository identifier is invalid.');
    const repositories = readCatalog();
    if (!repositories.some((repository) => repository.id === repositoryId)) {
      return error('UNKNOWN_REPOSITORY', 'Repository is no longer in the local catalog.');
    }
    writeCatalog(repositories.filter((repository) => repository.id !== repositoryId));
    return { ok: true, kind: 'forgotten', repositoryId };
  }

  async function command(repository, cwd, args, options = {}) {
    return run({
      runtime: repository.runtime,
      distro: repository.distro,
      cwd,
    }, args, options);
  }

  async function fileMtime(repository, worktreePath, files) {
    let latest = 0;
    let complete = true;
    for (const file of files.slice(0, 1000)) {
      try {
        const value = await statMtime({
          runtime: repository.runtime,
          distro: repository.distro,
          cwd: worktreePath,
          path: file.path,
        });
        if (Number.isFinite(value) && value > 0) latest = Math.max(latest, value);
        else complete = false;
      } catch {
        complete = false;
      }
    }
    return { latest, complete };
  }

  async function inspectWorktree(repository, raw, sessions) {
    const statusResponse = await command(repository, raw.path, [
      'status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all',
    ], { timeout: 8000 });
    if (!statusResponse.ok) {
      return {
        id: stableId('worktree', repository.id, raw.path),
        path: raw.path,
        branch: raw.branch,
        head: raw.head,
        detached: raw.detached,
        locked: raw.locked,
        prunable: raw.prunable,
        error: statusResponse.stderr || 'Unable to read worktree status.',
        rank: 0,
      };
    }
    const status = parseStatusPorcelainV2(statusResponse.stdout);
    const stashResponse = await command(repository, raw.path, ['rev-list', '--count', 'refs/stash'], { timeout: 3000 });
    const headTimeResponse = status.head
      ? await command(repository, raw.path, ['show', '-s', '--format=%ct', 'HEAD'], { timeout: 3000 })
      : { ok: true, stdout: '0' };
    const stashCount = stashResponse.ok && /^\d+$/.test(stashResponse.stdout.trim())
      ? Number(stashResponse.stdout.trim()) : 0;
    const headAt = Number(headTimeResponse.stdout.trim()) * 1000 || 0;
    const changedTime = await fileMtime(repository, raw.path, status.files);
    const changedAt = changedTime.latest;
    const associated = [];
    for (const session of sessions) {
      if (session.repositoryId && session.repositoryId !== repository.id) continue;
      if (session.runtime && session.runtime !== repository.runtime) continue;
      if (repository.runtime === 'wsl' && session.distro && session.distro !== repository.distro) continue;
      let sessionPath = session.worktreePath || session.cwd;
      try {
        sessionPath = await canonicalize({
          runtime: repository.runtime,
          distro: repository.distro,
          cwd: sessionPath,
        });
      } catch { /* retain the supplied canonical-looking path */ }
      if (sessionPath === raw.path || sessionPath.startsWith(`${raw.path.replace(/\/+$/, '')}/`)) associated.push(session);
    }
    const activityAt = Math.max(
      Date.parse(repository.lastSessionActivityAt || 0) || 0,
      ...associated.map((session) => Number(session.activityAt) || Date.parse(session.activityAt || '') || 0),
    );
    const dirty = status.files.length > 0;
    const unpublished = Boolean(status.branch && !status.upstream);
    const obligation = dirty || unpublished || status.ahead > 0;
    const latestRelevantAt = Math.max(activityAt, changedAt, headAt);
    const stale = Boolean(obligation
      && (!dirty || changedTime.complete)
      && latestRelevantAt > 0
      && now() - latestRelevantAt >= STALE_AFTER_MS);
    const conflicted = status.files.some((file) => file.conflicted);
    const staged = status.files.filter((file) => ![' ', '?', '.'].includes(file.index)).length;
    const unstaged = status.files.filter((file) => ![' ', '.'].includes(file.worktree)).length;
    const worktree = {
      id: stableId('worktree', repository.id, raw.path),
      repositoryId: repository.id,
      path: raw.path,
      head: status.head || raw.head,
      branch: status.branch || raw.branch,
      upstream: status.upstream,
      detached: raw.detached || !status.branch,
      unborn: status.unborn,
      locked: raw.locked,
      prunable: raw.prunable,
      files: status.files,
      totals: {
        files: status.files.length,
        staged,
        unstaged,
        untracked: status.files.filter((file) => file.index === '?' && file.worktree === '?').length,
        conflicted: status.files.filter((file) => file.conflicted).length,
      },
      stashCount,
      ahead: status.ahead,
      behind: status.behind,
      dirty,
      unpublished,
      conflicted,
      stale,
      latestRelevantAt: latestRelevantAt ? new Date(latestRelevantAt).toISOString() : null,
      associatedSessionIds: associated.map((session) => session.sessionId).filter(Boolean),
    };
    worktree.rank = rankWorktree(worktree);
    worktree.nextAction = conflicted ? 'resolve-conflicts'
      : staged > 0 ? 'commit'
        : unpublished ? 'publish'
          : status.ahead > 0 && status.behind > 0 ? 'sync'
            : status.behind > 0 ? 'pull'
              : status.ahead > 0 ? 'push'
                : 'fetch';
    return worktree;
  }

  async function inspectRepository(repository, sessions = []) {
    const response = await command(repository, repository.root, ['worktree', 'list', '--porcelain', '-z'], { timeout: 8000 });
    if (!response.ok) return {
      ...repository,
      worktrees: [],
      error: response.stderr || 'Unable to enumerate worktrees.',
    };
    const rawWorktrees = parseWorktreePorcelain(response.stdout);
    const worktrees = await mapWithConcurrency(
      rawWorktrees.filter((raw) => !raw.bare),
      4,
      (raw) => inspectWorktree(repository, raw, sessions),
    );
    worktrees.sort((a, b) => (a.rank - b.rank)
      || (Date.parse(a.latestRelevantAt || 0) - Date.parse(b.latestRelevantAt || 0))
      || a.path.localeCompare(b.path));
    return { ...repository, worktrees };
  }

  async function inventory({ sessions = [] } = {}) {
    const repositories = await mapWithConcurrency(
      readCatalog(),
      4,
      (repository) => inspectRepository(repository, Array.isArray(sessions) ? sessions : []),
    );
    repositories.sort((a, b) => {
      const ar = Math.min(...a.worktrees.map((worktree) => worktree.rank), 7);
      const br = Math.min(...b.worktrees.map((worktree) => worktree.rank), 7);
      return ar - br || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt) || a.label.localeCompare(b.label);
    });
    return { ok: true, kind: 'inventory', repositories };
  }

  async function resolveTarget(request) {
    if (!request || typeof request.repositoryId !== 'string' || typeof request.worktreeId !== 'string') {
      return { failure: error('INVALID_TARGET', 'Repository and worktree identifiers are required.') };
    }
    const repository = readCatalog().find((candidate) => candidate.id === request.repositoryId);
    if (!repository) return { failure: error('UNKNOWN_REPOSITORY', 'Repository is no longer in the local catalog.') };
    const inspected = await inspectRepository(repository, []);
    const worktree = inspected.worktrees.find((candidate) => candidate.id === request.worktreeId);
    if (!worktree) return { failure: error('STALE_WORKTREE', 'The selected worktree no longer belongs to this repository.') };
    if (worktree.error) return { failure: error('WORKTREE_UNAVAILABLE', worktree.error) };
    return { repository, worktree };
  }

  function selectedFiles(worktree, paths) {
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 1000) return null;
    const available = new Set(worktree.files.flatMap((file) => [file.path, file.originalPath].filter(Boolean)));
    const clean = [...new Set(paths)];
    return clean.every((filePath) => boundedText(filePath, MAX_PATH_CHARS) && available.has(filePath)) ? clean : null;
  }

  async function fingerprint(repository, worktree) {
    const response = await command(repository, worktree.path, [
      'status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all',
    ], { timeout: 8000 });
    return response.ok
      ? crypto.createHash('sha256').update(response.stdout).digest('hex')
      : null;
  }

  async function diff(request) {
    const target = await resolveTarget(request);
    if (target.failure) return target.failure;
    const { repository, worktree } = target;
    const paths = selectedFiles(worktree, [request.path]);
    if (!paths) return error('STALE_FILE', 'The selected file is no longer changed in this worktree.');
    const file = worktree.files.find((candidate) => candidate.path === request.path || candidate.originalPath === request.path);
    if (file.index === '?' && file.worktree === '?') {
      let absolute;
      try {
        absolute = await canonicalize({ runtime: repository.runtime, distro: repository.distro, cwd: worktree.path, child: file.path });
      } catch {
        return error('FILE_UNAVAILABLE', 'The untracked file could not be resolved safely.');
      }
      if (repository.runtime !== 'host') {
        const response = await command(repository, worktree.path, ['diff', '--no-index', '--no-color', '--', '/dev/null', file.path], { timeout: 8000 });
        const text = response.stdout || response.stderr || '';
        return { ok: true, kind: 'diff', text: text.slice(0, MAX_DIFF_BYTES), truncated: text.length > MAX_DIFF_BYTES, binary: false };
      }
      let data;
      try {
        const stats = fs.statSync(absolute);
        if (!stats.isFile()) return error('FILE_UNAVAILABLE', 'The selected path is not a regular file.');
        if (stats.size > MAX_DIFF_BYTES) return { ok: true, kind: 'diff', text: '', truncated: true, binary: false, size: stats.size };
        data = fs.readFileSync(absolute);
      } catch {
        return error('FILE_UNAVAILABLE', 'The selected file could not be read.');
      }
      if (data.includes(0)) return { ok: true, kind: 'diff', text: '', truncated: false, binary: true, size: data.length };
      return { ok: true, kind: 'diff', text: data.toString('utf8'), truncated: false, binary: false, untracked: true };
    }
    const args = ['diff', '--no-ext-diff', '--no-color'];
    if (request.staged) args.push('--cached');
    args.push('--', request.path);
    const response = await command(repository, worktree.path, args, { timeout: 8000, maxBuffer: MAX_DIFF_BYTES * 2 });
    if (!response.ok) return error('DIFF_FAILED', 'Git could not produce this diff.', response.stderr);
    const bytes = Buffer.byteLength(response.stdout);
    const binary = /Binary files .* differ|GIT binary patch/.test(response.stdout);
    return {
      ok: true,
      kind: 'diff',
      text: binary ? '' : Buffer.from(response.stdout).subarray(0, MAX_DIFF_BYTES).toString('utf8'),
      truncated: bytes > MAX_DIFF_BYTES,
      binary,
      size: bytes,
    };
  }

  async function mutateFiles(request, mode) {
    const target = await resolveTarget(request);
    if (target.failure) return target.failure;
    const { repository, worktree } = target;
    if (worktree.locked) return error('LOCKED_WORKTREE', `Git reports this worktree as locked: ${worktree.locked}`);
    if (worktree.conflicted && mode === 'unstage') {
      return error('CONFLICTED_WORKTREE', 'Resolve conflicts before changing the staged conflict state.');
    }
    const paths = selectedFiles(worktree, request.paths);
    if (!paths) return error('STALE_FILE', 'One or more selected files are no longer changed.');
    const args = mode === 'stage'
      ? ['add', '--', ...paths]
      : ['restore', '--staged', '--', ...paths];
    if (mode === 'unstage' && worktree.unborn) {
      args.splice(0, args.length, 'rm', '--cached', '--', ...paths);
    }
    const response = await command(repository, worktree.path, args, { timeout: 15000 });
    if (!response.ok) return error(`${mode.toUpperCase()}_FAILED`, `Git ${mode} failed.`, response.stderr);
    return { ok: true, kind: mode, repositoryId: repository.id, worktreeId: worktree.id };
  }

  async function commitPreview(request) {
    const target = await resolveTarget(request);
    if (target.failure) return target.failure;
    const { repository, worktree } = target;
    if (worktree.locked) return error('LOCKED_WORKTREE', `Git reports this worktree as locked: ${worktree.locked}`);
    const message = typeof request.message === 'string' ? request.message.trim() : '';
    if (!message || message.length > MAX_COMMIT_MESSAGE_CHARS || message.includes('\0')) {
      return error('INVALID_MESSAGE', `Enter a commit message between 1 and ${MAX_COMMIT_MESSAGE_CHARS} characters.`);
    }
    const stagedFiles = worktree.files.filter((file) => ![' ', '?', '.'].includes(file.index));
    if (stagedFiles.length === 0) return error('NOTHING_STAGED', 'Stage at least one whole file before committing.');
    return {
      ok: true,
      kind: 'commit-preview',
      repositoryId: repository.id,
      worktreeId: worktree.id,
      target: worktree.path,
      branch: worktree.branch,
      message,
      files: stagedFiles.map((file) => file.path),
      fingerprint: await fingerprint(repository, worktree),
      warning: 'Repository commit hooks will execute.',
    };
  }

  async function commit(request) {
    const preview = await commitPreview(request);
    if (!preview.ok) return preview;
    if (!request.fingerprint || request.fingerprint !== preview.fingerprint) {
      return error('PREVIEW_STALE', 'The staged state changed after preview. Review the commit again.');
    }
    const repository = readCatalog().find((candidate) => candidate.id === request.repositoryId);
    if (!repository) return error('UNKNOWN_REPOSITORY', 'Repository was forgotten after the commit preview.');
    const response = await command(repository, preview.target, ['commit', '-m', preview.message], { timeout: 120000 });
    if (!response.ok) return error('COMMIT_FAILED', 'Commit failed. Hooks may have rejected or changed the commit.', response.stderr);
    return { ok: true, kind: 'commit', output: response.stdout.trim(), target: preview.target };
  }

  async function remoteAction(request, action) {
    const target = await resolveTarget(request);
    if (target.failure) return target.failure;
    const { repository, worktree } = target;
    if (worktree.locked) return error('LOCKED_WORKTREE', `Git reports this worktree as locked: ${worktree.locked}`);
    if (worktree.conflicted) return error('CONFLICTED_WORKTREE', 'Resolve conflicts before running remote operations.');
    const remotesResponse = await command(repository, worktree.path, ['remote'], { timeout: 3000 });
    const remotes = remotesResponse.ok ? remotesResponse.stdout.split(/\r?\n/).filter(Boolean) : [];
    const upstreamRemote = worktree.upstream && worktree.upstream.includes('/')
      ? worktree.upstream.split('/')[0] : null;
    const remote = upstreamRemote || (remotes.includes('origin') ? 'origin' : remotes[0]);
    let args;
    if (action === 'fetch') args = remote ? ['fetch', remote] : ['fetch', '--all'];
    else if (action === 'pull') {
      if (!worktree.upstream) return error('NO_UPSTREAM', 'Publish this branch before pulling.');
      args = ['pull', '--ff-only'];
    } else if (action === 'push') {
      if (!worktree.upstream) return error('NO_UPSTREAM', 'Publish this branch before pushing.');
      args = ['push'];
    } else if (action === 'publish') {
      if (!remote || !worktree.branch || worktree.detached) return error('CANNOT_PUBLISH', 'A named branch and configured remote are required.');
      args = ['push', '--set-upstream', remote, worktree.branch];
    } else if (action === 'sync') {
      if (!worktree.upstream) return error('NO_UPSTREAM', 'Publish this branch before syncing.');
      const pull = await command(repository, worktree.path, ['pull', '--ff-only'], { timeout: 120000, network: true });
      if (!pull.ok) return error('SYNC_PULL_FAILED', 'Sync stopped because the fast-forward pull failed.', pull.stderr);
      args = ['push'];
    } else {
      return error('INVALID_ACTION', 'Unsupported Git action.');
    }
    const response = await command(repository, worktree.path, args, { timeout: 120000, network: true });
    if (!response.ok) return error(`${action.toUpperCase()}_FAILED`, `Git ${action} failed.`, response.stderr);
    return { ok: true, kind: action, target: worktree.path, effect: args.join(' '), output: response.stdout.trim() };
  }

  return {
    catalog,
    forget,
    observe,
    inventory,
    diff,
    stage: (request) => mutateFiles(request, 'stage'),
    unstage: (request) => mutateFiles(request, 'unstage'),
    commitPreview,
    commit,
    fetch: (request) => remoteAction(request, 'fetch'),
    pull: (request) => remoteAction(request, 'pull'),
    publish: (request) => remoteAction(request, 'publish'),
    push: (request) => remoteAction(request, 'push'),
    sync: (request) => remoteAction(request, 'sync'),
  };
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  MAX_DIFF_BYTES,
  STALE_AFTER_MS,
  createGitWorktreeService,
  normalizeCatalogRecord,
  parseStatusPorcelainV2,
  parseWorktreePorcelain,
  rankWorktree,
};
