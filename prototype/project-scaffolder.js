'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CATEGORY_TYPES = new Set(['flat', 'lifecycle', 'sandbox']);
const SAFE_SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/;
const PROJECT_NAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const DEFAULT_CATEGORIES = Object.freeze([
  Object.freeze({ name: 'libs', type: 'flat', description: 'Reusable libraries and SDKs' }),
  Object.freeze({ name: 'sandbox', type: 'sandbox', description: 'Experiments and learning' }),
  Object.freeze({ name: 'scripts', type: 'flat', description: 'CLI tools and dev utilities' }),
  Object.freeze({ name: 'mobile', type: 'lifecycle', description: 'Mobile applications' }),
  Object.freeze({ name: 'tools', type: 'lifecycle', description: 'Desktop and CLI tools' }),
  Object.freeze({ name: 'web', type: 'lifecycle', description: 'Web applications' }),
]);
const DEFAULT_SANDBOX_TYPES = Object.freeze(['web', 'tools']);
const HISTORY_LIMIT = 50;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_NAME_CHARS = 100;
const MAX_PATH_CHARS = 8192;
const MAX_CLONE_URL_CHARS = 4096;
const ACTIVE_TARGETS = new Set();

function cloneDefaults() {
  return {
    categories: DEFAULT_CATEGORIES.map((entry) => ({ ...entry })),
    sandboxTypes: [...DEFAULT_SANDBOX_TYPES],
    warnings: [],
  };
}

function parseCategories(text, source = '~/.config/p/categories.conf') {
  const categories = [];
  const sandboxTypes = [];
  const warnings = [];
  const seenCategories = new Set();
  const seenSandboxTypes = new Set();
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const lineNumber = index + 1;
    if (!line || line.length > 1000 || line.startsWith('#') || line.startsWith('ignore:') || line.startsWith('dev_tool:')) return;
    if (line.startsWith('sandbox_type:')) {
      const value = line.slice('sandbox_type:'.length).trim();
      if (!SAFE_SEGMENT_RE.test(value)) {
        warnings.push(`Ignored invalid sandbox type at ${source}:${lineNumber}.`);
      } else if (!seenSandboxTypes.has(value)) {
        seenSandboxTypes.add(value);
        sandboxTypes.push(value);
      }
      return;
    }
    const fields = line.split('|');
    const name = String(fields[0] || '').trim();
    const type = String(fields[1] || '').trim();
    const description = fields.slice(2).join('|').trim();
    if (fields.length < 3 || !SAFE_SEGMENT_RE.test(name) || !CATEGORY_TYPES.has(type)) {
      warnings.push(`Ignored malformed category at ${source}:${lineNumber}.`);
      return;
    }
    if (!seenCategories.has(name)) {
      seenCategories.add(name);
      categories.push({ name, type, description });
    }
  });
  const defaults = cloneDefaults();
  return {
    categories: categories.length ? categories : defaults.categories,
    sandboxTypes: sandboxTypes.length ? sandboxTypes : defaults.sandboxTypes,
    warnings,
  };
}

function deriveCloneName(url) {
  const input = String(url || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const segment = input.slice(input.lastIndexOf('/') + 1)
    .toLowerCase()
    .replace(/[_.\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return segment;
}

function validateProjectName(name) {
  const value = String(name || '').trim();
  if (value.length > MAX_NAME_CHARS || !PROJECT_NAME_RE.test(value)) {
    throw new Error('Use lowercase letters, numbers, and hyphens with no leading or trailing hyphen.');
  }
  return value;
}

function validateAbsoluteRoot(root, pathApi = path) {
  const value = String(root || '').trim();
  if (!value || value.length > MAX_PATH_CHARS || value.includes('\0') || !pathApi.isAbsolute(value)) {
    throw new Error('Projects Root must be an absolute path.');
  }
  return pathApi.normalize(value);
}

function assertContained(root, target, pathApi = path) {
  const relative = pathApi.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
    throw new Error('Project destination must remain inside Projects Root.');
  }
  return target;
}

function destinationFor({ root, name, category, sandboxType = null, categories, sandboxTypes, pathApi = path }) {
  const safeRoot = validateAbsoluteRoot(root, pathApi);
  const safeName = validateProjectName(name);
  const selected = (categories || []).find((entry) => entry.name === category);
  if (!selected) throw new Error('Choose a configured project category.');
  let parts;
  if (selected.type === 'lifecycle') {
    parts = [selected.name, 'dev', safeName];
  } else if (selected.type === 'sandbox') {
    if (!(sandboxTypes || []).includes(sandboxType)) throw new Error('Choose a configured sandbox type.');
    parts = ['sandbox', sandboxType, safeName];
  } else {
    parts = [selected.name, safeName];
  }
  const target = pathApi.resolve(safeRoot, ...parts);
  assertContained(safeRoot, target, pathApi);
  return { root: safeRoot, target, name: safeName, category: { ...selected }, sandboxType };
}

function execFileResult(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args.map(String), {
      windowsHide: true,
      timeout: 600_000,
      maxBuffer: MAX_TEXT_BYTES,
      ...options,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = String(stderr || '').trim();
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function createHostAdapter({
  home = os.homedir(),
  env = process.env,
  fsApi = fs.promises,
  run = execFileResult,
} = {}) {
  return {
    kind: 'host',
    distro: null,
    home,
    path: path,
    env,
    async readText(file) { return fsApi.readFile(file, 'utf8'); },
    async exists(file) {
      try { await fsApi.access(file); return true; } catch { return false; }
    },
    async isDirectory(file) {
      try { return (await fsApi.stat(file)).isDirectory(); } catch { return false; }
    },
    async realpath(file) { return fsApi.realpath(file); },
    async mkdirp(dir) { await fsApi.mkdir(dir, { recursive: true }); },
    async rename(from, to) { await fsApi.rename(from, to); },
    async removeTree(dir) { await fsApi.rm(dir, { recursive: true, force: true }); },
    async writeTextAtomic(file, text) {
      const dir = path.dirname(file);
      await fsApi.mkdir(dir, { recursive: true });
      const temporary = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
      try {
        await fsApi.writeFile(temporary, text, { mode: 0o600 });
        await fsApi.rename(temporary, file);
        try { await fsApi.chmod(file, 0o600); } catch { /* best effort */ }
      } finally {
        try { await fsApi.unlink(temporary); } catch { /* renamed or absent */ }
      }
    },
    async unlink(file) {
      try { await fsApi.unlink(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    },
    async runGit(args) { return run('git', args); },
    async isExecutable(file) {
      try { await fsApi.access(file, fs.constants.X_OK); return true; } catch { return false; }
    },
    async runExecutable(file, args) { return run(file, args); },
  };
}

function createWslAdapter({ runtime, distro, home, env = {} }) {
  if (!runtime || typeof runtime.run !== 'function') throw new Error('WSL runtime adapter is unavailable.');
  const run = (args, options = {}) => runtime.run(distro, args, {
    timeout: 600_000,
    maxBuffer: MAX_TEXT_BYTES,
    ...options,
  });
  const test = async (flag, file) => {
    try { await run(['test', flag, file]); return true; } catch { return false; }
  };
  return {
    kind: 'wsl',
    distro,
    home,
    path: path.posix,
    env,
    async readText(file) { return (await run(['cat', '--', file])).stdout; },
    async exists(file) { return test('-e', file); },
    async isDirectory(file) { return test('-d', file); },
    async realpath(file) { return (await run(['readlink', '-f', '--', file])).stdout.trim(); },
    async mkdirp(dir) { await run(['mkdir', '-p', '--', dir]); },
    async rename(from, to) {
      const script = 'mv -T -n -- "$1" "$2"\ntest ! -e "$1"';
      await run(['bash', '-c', script, 'chromux-project-rename', from, to]);
    },
    async removeTree(dir) { await run(['rm', '-rf', '--', dir]); },
    async writeTextAtomic(file, text) {
      const script = [
        'set -eu',
        'target=$1',
        'data=$2',
        'mkdir -p -- "$(dirname -- "$target")"',
        'tmp=$(mktemp -- "${target}.XXXXXX")',
        'trap \'rm -f -- "$tmp"\' EXIT',
        'printf %s "$data" > "$tmp"',
        'chmod 600 "$tmp"',
        'mv -f -- "$tmp" "$target"',
        'trap - EXIT',
      ].join('\n');
      await run(['bash', '-c', script, 'chromux-project-write', file, text]);
    },
    async unlink(file) { try { await run(['rm', '-f', '--', file]); } catch { /* rm -f should not fail for absence */ } },
    async runGit(args) { return run(['git', ...args]); },
    async isExecutable(file) { return test('-x', file); },
    async runExecutable(file, args) { return run([file, ...args]); },
  };
}

async function readOptional(adapter, file) {
  try {
    const text = await adapter.readText(file);
    return Buffer.byteLength(text, 'utf8') <= MAX_TEXT_BYTES ? text : null;
  } catch { return null; }
}

async function loadScaffolderConfig({ adapter, projectsRoot = null } = {}) {
  if (!adapter) throw new Error('Project runtime adapter is unavailable.');
  const pathApi = adapter.path;
  const configPath = pathApi.join(adapter.home, '.config', 'p', 'categories.conf');
  const contents = await readOptional(adapter, configPath);
  const parsed = contents === null ? cloneDefaults() : parseCategories(contents, configPath);
  const inheritedRoot = String(adapter.env && adapter.env.P_BASE || '').trim();
  const root = validateAbsoluteRoot(projectsRoot || inheritedRoot || pathApi.join(adapter.home, 'projects'), pathApi);
  return {
    runtime: adapter.kind,
    distro: adapter.distro,
    root,
    configPath,
    categories: parsed.categories,
    sandboxTypes: parsed.sandboxTypes,
    warnings: parsed.warnings,
  };
}

async function updateHistory(adapter, target) {
  const pathApi = adapter.path;
  const cacheRoot = String(adapter.env && adapter.env.XDG_CACHE_HOME || '').trim()
    || pathApi.join(adapter.home, '.cache');
  const historyPath = pathApi.join(cacheRoot, 'p', 'p_history');
  const existing = await readOptional(adapter, historyPath);
  const rows = String(existing || '').split(/\r?\n/).filter((row) => row && row !== target);
  rows.push(target);
  const trimmed = rows.slice(-HISTORY_LIMIT);
  await adapter.writeTextAtomic(historyPath, `${trimmed.join('\n')}\n`);
  return historyPath;
}

async function invalidateCompletionCaches(adapter) {
  const pathApi = adapter.path;
  const cacheRoot = String(adapter.env && adapter.env.XDG_CACHE_HOME || '').trim()
    || pathApi.join(adapter.home, '.cache');
  await adapter.unlink(pathApi.join(cacheRoot, 'p', 'p_completion'));
  await adapter.unlink(pathApi.join(cacheRoot, 'p', 'sp_completion'));
}

async function invokeHook(adapter, details) {
  const hook = String(adapter.env && adapter.env.P_NP_HOOK || '').trim();
  if (!hook || !adapter.path.isAbsolute(hook) || !(await adapter.isExecutable(hook))) return false;
  await adapter.runExecutable(hook, [
    details.name,
    details.category.name,
    details.category.type,
    details.target,
  ]);
  return true;
}

async function previewProject({ adapter, config, request }) {
  const source = request && request.source === 'clone' ? 'clone' : 'fresh';
  const derivedName = source === 'clone' && !String(request.name || '').trim()
    ? deriveCloneName(request.cloneUrl)
    : request.name;
  const destination = destinationFor({
    root: config.root,
    name: derivedName,
    category: request.category,
    sandboxType: request.sandboxType,
    categories: config.categories,
    sandboxTypes: config.sandboxTypes,
    pathApi: adapter.path,
  });
  const cloneUrl = String(request.cloneUrl || '').trim();
  if (source === 'clone' && (!cloneUrl || cloneUrl.length > MAX_CLONE_URL_CHARS || cloneUrl.includes('\0'))) {
    throw new Error('Enter a valid Git clone URL.');
  }
  return {
    ...destination,
    source,
    cloneUrl: source === 'clone' ? cloneUrl : null,
    runtime: adapter.kind,
    distro: adapter.distro,
    exists: await adapter.exists(destination.target),
  };
}

async function createProject({ adapter, config, request, randomBytes = crypto.randomBytes } = {}) {
  const details = await previewProject({ adapter, config, request });
  const activeKey = `${adapter.kind}\n${adapter.distro || ''}\n${details.target}`;
  if (ACTIVE_TARGETS.has(activeKey)) throw new Error(`Project creation is already in progress: ${details.target}`);
  ACTIVE_TARGETS.add(activeKey);
  try {
    if (await adapter.exists(details.target)) throw new Error(`Destination already exists: ${details.target}`);
    await adapter.mkdirp(details.root);
    const parent = adapter.path.dirname(details.target);
    await adapter.mkdirp(parent);
    const [physicalRoot, physicalParent] = await Promise.all([
      adapter.realpath(details.root),
      adapter.realpath(parent),
    ]);
    assertContained(physicalRoot, adapter.path.join(physicalParent, details.name), adapter.path);
    const staging = adapter.path.join(parent, `.chromux-${details.name}-${randomBytes(8).toString('hex')}.staging`);
    if (await adapter.exists(staging)) throw new Error('Could not allocate a unique project staging directory.');
    let committed = false;
    try {
      if (details.source === 'clone') {
        await adapter.runGit(['clone', '--', details.cloneUrl, staging]);
      } else {
        await adapter.mkdirp(staging);
        await adapter.runGit(['-C', staging, 'init']);
      }
      if (await adapter.exists(details.target)) throw new Error(`Destination already exists: ${details.target}`);
      await adapter.rename(staging, details.target);
      committed = true;
    } catch (error) {
      if (!committed) {
        try { await adapter.removeTree(staging); } catch { /* surface the creation failure */ }
      }
      throw new Error(error.stderr || error.message || 'Project creation failed.');
    }

    const warnings = [];
    try { await updateHistory(adapter, details.target); } catch (error) {
      warnings.push(`Project created, but p history could not be updated: ${error.message}`);
    }
    try { await invalidateCompletionCaches(adapter); } catch (error) {
      warnings.push(`Project created, but p completion caches could not be invalidated: ${error.message}`);
    }
    try { await invokeHook(adapter, details); } catch (error) {
      warnings.push(`Project created, but P_NP_HOOK failed: ${error.stderr || error.message}`);
    }
    return { ...details, warnings };
  } finally {
    ACTIVE_TARGETS.delete(activeKey);
  }
}

module.exports = {
  DEFAULT_CATEGORIES,
  DEFAULT_SANDBOX_TYPES,
  HISTORY_LIMIT,
  assertContained,
  createHostAdapter,
  createProject,
  createWslAdapter,
  deriveCloneName,
  destinationFor,
  invalidateCompletionCaches,
  invokeHook,
  loadScaffolderConfig,
  parseCategories,
  previewProject,
  updateHistory,
  validateAbsoluteRoot,
  validateProjectName,
};
