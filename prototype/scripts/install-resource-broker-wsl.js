#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { WslRuntime, windowsPathToLinux } = require('../platform/runtime');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function spawnWithInput(file, args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${file} exited ${code}`)));
    if (input !== null) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function main() {
  if (process.platform !== 'win32') throw new Error('The WSL broker installer must run from Windows.');
  const runtime = new WslRuntime();
  const distros = await runtime.list();
  const requested = process.argv[2];
  const distro = requested
    ? runtime.select(requested)
    : (distros.find((row) => row.default && row.version === 2) || distros.find((row) => row.version === 2))?.name;
  if (!distro) throw new Error('No WSL2 distribution is installed.');

  const executableLinux = windowsPathToLinux(process.execPath);
  const mcpWindows = process.resourcesPath
    ? path.win32.join(process.resourcesPath, 'app.asar', 'resource-broker', 'mcp-server.js')
    : path.resolve(__dirname, '..', 'resource-broker', 'mcp-server.js');
  const wrapper = [
    '#!/bin/sh',
    'set -eu',
    'export ELECTRON_RUN_AS_NODE=1',
    `exec ${shellQuote(executableLinux)} ${shellQuote(mcpWindows)} "$@"`,
    '',
  ].join('\n');
  const installScript = [
    'set -eu',
    'umask 077',
    'mkdir -p "$HOME/.chromux/bin"',
    'cat > "$HOME/.chromux/bin/chromux-resource-broker-mcp"',
    'chmod 700 "$HOME/.chromux/bin/chromux-resource-broker-mcp"',
  ].join('; ');
  await spawnWithInput('wsl.exe', ['--distribution', distro, '--exec', 'bash', '-lc', installScript], wrapper);
  const home = (await runtime.run(distro, ['bash', '-lc', 'printf %s \"$HOME\"'])).stdout.trim();
  const launcher = `${home}/.chromux/bin/chromux-resource-broker-mcp`;
  await runtime.run(distro, ['codex', 'mcp', 'remove', 'chromux']).catch(() => {});
  await runtime.run(distro, ['codex', 'mcp', 'add', 'chromux', '--', launcher]);
  await runtime.run(distro, ['codex', 'mcp', 'list']);
  console.log(`Installed and registered the Chromux broker MCP launcher in ${distro}: ${launcher}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
