'use strict';

const { execFile } = require('child_process');
const path = require('path');

const MIN_NODE_VERSION = Object.freeze([22, 12, 0]);
const WSL_EXE = 'wsl.exe';

function cleanWslOutput(value) {
  return String(value || '').replace(/\0/g, '').replace(/\r/g, '');
}

function parseWslList(output) {
  const lines = cleanWslOutput(output).split('\n').map((line) => line.trimEnd()).filter(Boolean);
  const distros = [];
  for (const raw of lines) {
    if (/^\s*NAME\s+STATE\s+VERSION\s*$/i.test(raw)) continue;
    const isDefault = /^\s*\*/.test(raw);
    const line = raw.replace(/^\s*\*\s*/, '').trim();
    const match = /^(.*?)\s{2,}(Running|Stopped|Installing|Uninstalling|Converting)\s+(\d+)\s*$/i.exec(line);
    if (!match) continue;
    distros.push({
      name: match[1].trim(),
      state: match[2].toLowerCase(),
      version: Number(match[3]),
      default: isDefault,
    });
  }
  return distros;
}

function compareVersion(actual, minimum = MIN_NODE_VERSION) {
  const parsed = String(actual || '').replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < minimum.length; index += 1) {
    if ((parsed[index] || 0) !== minimum[index]) return (parsed[index] || 0) > minimum[index];
  }
  return true;
}

function validateDistroName(name, distros) {
  if (typeof name !== 'string' || !name || name.includes('\0')) throw new Error('Choose a valid WSL distribution.');
  const distro = (distros || []).find((candidate) => candidate.name === name);
  if (!distro) throw new Error('The selected WSL distribution is no longer installed.');
  if (distro.version !== 2) throw new Error(`${distro.name} uses WSL${distro.version}; Chromux requires WSL2.`);
  return distro;
}

function normalizeLinuxPath(value) {
  const cwd = String(value || '').trim();
  if (!cwd.startsWith('/') || cwd.includes('\0') || cwd.includes('\\')) {
    throw new Error('WSL workspace paths must be absolute Linux paths.');
  }
  return path.posix.normalize(cwd);
}

function windowsPathToLinux(value) {
  const input = String(value || '').trim();
  if (input.includes('\0')) throw new Error('Workspace path contains an invalid character.');
  if (input.startsWith('/')) return normalizeLinuxPath(input);
  const unc = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(?:\\(.*))?$/i.exec(input);
  if (unc) return normalizeLinuxPath(`/${String(unc[1] || '').replace(/\\/g, '/')}`);
  const drive = /^([a-zA-Z]):[\\/](.*)$/.exec(input);
  if (!drive) throw new Error('Choose a Windows drive path or an absolute Linux path.');
  const tail = drive[2].replace(/\\/g, '/');
  return path.posix.normalize(`/mnt/${drive[1].toLowerCase()}/${tail}`);
}

function linuxPathToWindows(value, distro) {
  const cwd = normalizeLinuxPath(value);
  if (typeof distro !== 'string' || !distro || /[\\/\0]/.test(distro)) throw new Error('Invalid WSL distribution.');
  const drive = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(cwd);
  if (drive) {
    const suffix = drive[2] ? `\\${drive[2].replace(/\//g, '\\')}` : '\\';
    return `${drive[1].toUpperCase()}:${suffix}`;
  }
  return `\\\\wsl.localhost\\${distro}${cwd.replace(/\//g, '\\')}`;
}

function workspaceLocation(input, { platform = process.platform, selectedDistro = null } = {}) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    if (input.runtime === 'wsl') {
      return { runtime: 'wsl', distro: String(input.distro || selectedDistro || ''), cwd: normalizeLinuxPath(input.cwd) };
    }
    return { runtime: 'host', distro: null, cwd: path.resolve(String(input.cwd || '')) };
  }
  if (platform === 'win32') {
    return { runtime: 'wsl', distro: String(selectedDistro || ''), cwd: windowsPathToLinux(input) };
  }
  return { runtime: 'host', distro: null, cwd: path.resolve(String(input || '')) };
}

function execFileResult(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = cleanWslOutput(stderr).trim();
        reject(error);
        return;
      }
      resolve({ stdout: cleanWslOutput(stdout), stderr: cleanWslOutput(stderr) });
    });
  });
}

class WslRuntime {
  constructor({ exec = execFileResult, platform = process.platform } = {}) {
    this.exec = exec;
    this.platform = platform;
    this.distros = [];
  }

  async list() {
    if (this.platform !== 'win32') return [];
    const result = await this.exec(WSL_EXE, ['--list', '--verbose']);
    this.distros = parseWslList(result.stdout);
    return this.distros.map((distro) => ({ ...distro }));
  }

  select(name) {
    return validateDistroName(name, this.distros).name;
  }

  async run(distro, args, options = {}) {
    validateDistroName(distro, this.distros);
    return this.exec(WSL_EXE, ['--distribution', distro, '--exec', ...args.map(String)], options);
  }

  async readiness(distro, agents = ['claude', 'codex', 'grok']) {
    const checks = [];
    try {
      validateDistroName(distro, this.distros);
    } catch (error) {
      return { ready: false, checks, error: error.message };
    }
    const commands = [
      ['bash', ['bash', '--version'], (out) => /\bversion\b/i.test(out), 'Bash'],
      ['git', ['git', '--version'], (out) => /^git version /i.test(out.trim()), 'Git'],
      ['node', ['node', '--version'], (out) => compareVersion(out.trim()), 'Node 22.12+'],
      ...agents.map((agent) => [agent, ['bash', '-lc', `command -v ${agent}`], (out) => Boolean(out.trim()), `${agent} CLI`]),
    ];
    for (const [id, argv, valid, label] of commands) {
      try {
        const result = await this.run(distro, argv);
        checks.push({ id, label, ok: valid(result.stdout), detail: result.stdout.trim().split('\n')[0] || null });
      } catch (error) {
        checks.push({ id, label, ok: false, detail: error.stderr || error.message });
      }
    }
    const requiredReady = checks.filter((check) => ['bash', 'git', 'node'].includes(check.id)).every((check) => check.ok);
    const missingAgents = checks.filter((check) => !['bash', 'git', 'node'].includes(check.id) && !check.ok).map((check) => check.id);
    return {
      ready: requiredReady,
      checks,
      error: requiredReady ? null : 'WSL requires Bash, Git, and Node 22.12 or newer.',
      warning: missingAgents.length ? `Install agent CLIs in ${distro}: ${missingAgents.join(', ')}.` : null,
    };
  }

  ptySpec(location, env = process.env) {
    const distro = validateDistroName(location.distro, this.distros).name;
    const cwd = normalizeLinuxPath(location.cwd);
    const forwarded = ['CHROMUX', 'CHROMUX_SESSION_ID', 'CHROMUX_SIGNAL_TOKEN', 'CHROMUX_STATE_DIR'];
    const prior = String(env.WSLENV || '').split(':').filter(Boolean);
    return {
      file: WSL_EXE,
      args: ['--distribution', distro, '--cd', cwd, '--exec', 'bash', '-l'],
      cwd: env.SystemRoot || 'C:\\Windows',
      env: {
        ...env,
        SystemRoot: env.SystemRoot || 'C:\\Windows',
        WSLENV: [...new Set([...prior, ...forwarded])].join(':'),
      },
    };
  }
}

module.exports = {
  MIN_NODE_VERSION,
  WSL_EXE,
  WslRuntime,
  cleanWslOutput,
  compareVersion,
  linuxPathToWindows,
  normalizeLinuxPath,
  parseWslList,
  validateDistroName,
  windowsPathToLinux,
  workspaceLocation,
};
