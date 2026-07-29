'use strict';

const path = require('path');
const { compareVersion } = require('./platform/runtime');
const { windowsSupport } = require('./platform/host');

const SETUP_SCHEMA_VERSION = 1;
const MAX_DETAIL_LENGTH = 500;
const AGENTS = Object.freeze(['claude', 'codex', 'grok']);
const REQUIRED_TOOL_IDS = Object.freeze(['bash', 'git', 'node']);
const DOCUMENTATION_URLS = Object.freeze({
  windows: 'https://support.microsoft.com/windows/windows-10-system-requirements-6d4e9a79-66bf-7950-467c-795cf0386715',
  wsl: 'https://learn.microsoft.com/windows/wsl/install',
  node: 'https://nodejs.org/en/download',
  chromux: 'https://github.com/GeorgeQLe/gblockparty-chromux/blob/main/prototype/docs/windows-setup.md',
});

function boundedDetail(value) {
  const detail = String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  return detail ? detail.slice(0, MAX_DETAIL_LENGTH) : null;
}

function check(id, label, { required, ok, detail, command = null, documentationUrl = null } = {}) {
  const documentationKey = Object.entries(DOCUMENTATION_URLS)
    .find(([, url]) => url === documentationUrl)?.[0] || null;
  return {
    id,
    label,
    required: Boolean(required),
    ok: Boolean(ok),
    detail: boundedDetail(detail),
    remediation: {
      command: typeof command === 'string' && command.length <= 500 ? command : null,
      documentationUrl: Object.values(DOCUMENTATION_URLS).includes(documentationUrl) ? documentationUrl : null,
      documentationKey,
    },
  };
}

function completionPreference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== SETUP_SCHEMA_VERSION) return null;
  if (typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt))) return null;
  return { schemaVersion: SETUP_SCHEMA_VERSION, completedAt: new Date(value.completedAt).toISOString() };
}

function windowsBuild(release) {
  const match = String(release || '').match(/^\d+\.\d+\.(\d+)(?:\.\d+)?$/);
  return match ? Number(match[1]) : null;
}

function chooseDistro(distros, persisted) {
  const rows = Array.isArray(distros) ? distros : [];
  return rows.find((row) => row.name === persisted && row.version === 2)
    || rows.find((row) => row.default && row.version === 2)
    || rows.find((row) => row.version === 2)
    || null;
}

function normalizeToolChecks(readiness) {
  const byId = new Map((Array.isArray(readiness?.checks) ? readiness.checks : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => [row.id, row]));
  return [
    check('bash', 'Bash', {
      required: true,
      ok: byId.get('bash')?.ok,
      detail: byId.get('bash')?.detail || 'Bash is required inside the selected WSL2 distribution.',
      documentationUrl: DOCUMENTATION_URLS.wsl,
    }),
    check('git', 'Git', {
      required: true,
      ok: byId.get('git')?.ok,
      detail: byId.get('git')?.detail || 'Git is required inside the selected WSL2 distribution.',
      command: 'sudo apt-get update && sudo apt-get install -y git',
      documentationUrl: DOCUMENTATION_URLS.chromux,
    }),
    check('node', 'Node 22.12+', {
      required: true,
      ok: byId.get('node')?.ok && compareVersion(byId.get('node')?.detail),
      detail: byId.get('node')?.detail || 'Node.js 22.12 or newer is required inside WSL2.',
      documentationUrl: DOCUMENTATION_URLS.node,
    }),
    ...AGENTS.map((agent) => check(`agent-${agent}`, `${agent[0].toUpperCase()}${agent.slice(1)} CLI`, {
      required: false,
      ok: byId.get(agent)?.ok,
      detail: byId.get(agent)?.detail || `${agent} is optional and was not found in the selected distribution.`,
      documentationUrl: DOCUMENTATION_URLS.chromux,
    })),
  ];
}

function rootCheck(rootResult, root) {
  const value = typeof root === 'string' ? root : '';
  return check('projects-root', 'Projects Root', {
    required: true,
    ok: rootResult?.ok,
    detail: rootResult?.detail || (value
      ? `${value} must exist and be writable.`
      : 'Choose or create an absolute Projects Root inside WSL2.'),
    documentationUrl: DOCUMENTATION_URLS.chromux,
  });
}

function calculateCapabilities(checks) {
  const byId = new Map(checks.map((row) => [row.id, row]));
  const runtimeIds = ['windows-build', 'windows-architecture', 'wsl2-distro', ...REQUIRED_TOOL_IDS];
  const canOpenSession = runtimeIds.every((id) => byId.get(id)?.ok);
  const agents = Object.fromEntries(AGENTS.map((agent) => [
    agent,
    canOpenSession && Boolean(byId.get(`agent-${agent}`)?.ok),
  ]));
  return {
    canOpenSession,
    canCreateProject: canOpenSession && Boolean(byId.get('projects-root')?.ok),
    agents: { shell: canOpenSession, ...agents },
  };
}

function sanitizeCompletion(completion, setupReady, migrateExisting, now) {
  const stored = completionPreference(completion);
  if (stored) return stored;
  if (!migrateExisting || !setupReady) return null;
  return { schemaVersion: SETUP_SCHEMA_VERSION, completedAt: now().toISOString() };
}

async function inspectRoot(runtime, distro, root) {
  if (typeof root !== 'string' || !root.startsWith('/') || root.includes('\0') || root.includes('\\')) {
    return { ok: false, detail: 'Projects Root must be an absolute Linux path.' };
  }
  try {
    const result = await runtime.run(distro, [
      'bash', '-lc',
      'test -d "$1" && test -w "$1" && printf "writable directory: %s" "$1"',
      'chromux-root-check',
      path.posix.normalize(root),
    ]);
    return { ok: true, detail: result.stdout };
  } catch (error) {
    return { ok: false, detail: error.stderr || error.message };
  }
}

async function createRoot(runtime, distro, root) {
  if (typeof root !== 'string' || !root.startsWith('/') || root.includes('\0') || root.includes('\\')) {
    throw new Error('Projects Root must be an absolute Linux path.');
  }
  const normalized = path.posix.normalize(root);
  await runtime.run(distro, ['mkdir', '-p', '--', normalized]);
  const verified = await inspectRoot(runtime, distro, normalized);
  if (!verified.ok) throw new Error(verified.detail || 'Projects Root is not writable.');
  return { root: normalized, ...verified };
}

async function buildSetupStatus({
  platform = process.platform,
  arch = process.arch,
  release,
  runtime,
  distros = [],
  selectedDistro = null,
  root = null,
  home = '/home',
  completion = null,
  hookWarning = null,
  migrateExisting = false,
  now = () => new Date(),
} = {}) {
  if (platform !== 'win32') return null;
  const support = windowsSupport({ platform, arch, release });
  const build = windowsBuild(release);
  const selected = chooseDistro(distros, selectedDistro);
  let readiness = { checks: [] };
  let rootResult = { ok: false, detail: 'Choose a ready WSL2 distribution first.' };
  if (support.supported && selected && runtime) {
    readiness = await runtime.readiness(selected.name);
    rootResult = await inspectRoot(runtime, selected.name, root);
  }
  const checks = [
    check('windows-build', 'Windows build', {
      required: true,
      ok: build !== null && build >= 19045,
      detail: build === null ? support.error : `Windows build ${build}`,
      documentationUrl: DOCUMENTATION_URLS.windows,
    }),
    check('windows-architecture', 'Windows architecture', {
      required: true,
      ok: arch === 'x64',
      detail: arch === 'x64' ? 'x64' : `${arch || 'unknown'} is unsupported; Chromux requires x64.`,
      documentationUrl: DOCUMENTATION_URLS.windows,
    }),
    check('wsl2-distro', 'WSL2 distribution', {
      required: true,
      ok: Boolean(selected),
      detail: selected ? `${selected.name} (WSL2)` : 'Install and initialize a WSL2 distribution.',
      command: 'wsl --update',
      documentationUrl: DOCUMENTATION_URLS.wsl,
    }),
    ...normalizeToolChecks(readiness),
    rootCheck(rootResult, root),
    check('resource-integration', 'Agent hooks and resource integration', {
      required: false,
      ok: !hookWarning,
      detail: hookWarning || 'Chromux integrations are available.',
      documentationUrl: DOCUMENTATION_URLS.chromux,
    }),
  ];
  const capabilities = calculateCapabilities(checks);
  const setupReady = capabilities.canCreateProject;
  const normalizedCompletion = sanitizeCompletion(completion, setupReady, migrateExisting, now);
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    checkedAt: now().toISOString(),
    selectedDistro: selected?.name || null,
    distros: distros.map((row) => ({
      name: String(row.name || '').slice(0, 200),
      version: Number(row.version) || null,
      default: Boolean(row.default),
      state: String(row.state || '').slice(0, 40),
    })),
    projectsRoot: typeof root === 'string' ? root : null,
    defaultProjectsRoot: selected
      ? `${String(home || '/home').replace(/\/+$/, '')}/projects`
      : null,
    checks,
    completion: normalizedCompletion,
    setupReady,
    needsSetup: !normalizedCompletion,
    capabilities,
  };
}

module.exports = {
  AGENTS,
  DOCUMENTATION_URLS,
  SETUP_SCHEMA_VERSION,
  boundedDetail,
  buildSetupStatus,
  calculateCapabilities,
  chooseDistro,
  completionPreference,
  createRoot,
  inspectRoot,
  windowsBuild,
};
