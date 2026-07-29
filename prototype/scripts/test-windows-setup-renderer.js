#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-windows-setup-renderer-'));
const home = path.join(temporary, 'home');
const e2ePath = path.join(temporary, 'e2e.js');
const outputPath = path.join(temporary, 'e2e.out');
fs.mkdirSync(home, { recursive: true });

fs.writeFileSync(e2ePath, `
(() => {
  const setup = window.chromuxTestWindowsSetup;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const baseChecks = [
    { id: 'windows-build', label: 'Windows build', required: true, ok: true, detail: 'Windows build 19045', remediation: {} },
    { id: 'windows-architecture', label: 'Windows architecture', required: true, ok: true, detail: 'x64', remediation: {} },
    { id: 'wsl2-distro', label: 'WSL2 distribution', required: true, ok: true, detail: 'Ubuntu (WSL2)', remediation: {} },
    { id: 'bash', label: 'Bash', required: true, ok: true, detail: '5.2', remediation: {} },
    { id: 'git', label: 'Git', required: true, ok: true, detail: '2.45', remediation: {} },
    { id: 'node', label: 'Node 22.12+', required: true, ok: true, detail: 'v22.12.0', remediation: {} },
    { id: 'agent-claude', label: 'Claude CLI', required: false, ok: false, detail: 'missing', remediation: {} },
    { id: 'agent-codex', label: 'Codex CLI', required: false, ok: true, detail: '/usr/bin/codex', remediation: {} },
    { id: 'agent-grok', label: 'Grok CLI', required: false, ok: false, detail: 'missing', remediation: {} },
    { id: 'projects-root', label: 'Projects Root', required: true, ok: false, detail: 'missing', remediation: {} },
    { id: 'resource-integration', label: 'Agent hooks', required: false, ok: false, detail: 'warning', remediation: {} },
  ];
  setup.render({
    schemaVersion: 1,
    selectedDistro: null,
    distros: [],
    projectsRoot: null,
    defaultProjectsRoot: null,
    checks: baseChecks.map((item) => (
      ['windows-build', 'windows-architecture'].includes(item.id)
        ? item
        : { ...item, ok: false }
    )),
    setupReady: false,
    needsSetup: true,
    capabilities: {
      canOpenSession: false,
      canCreateProject: false,
      agents: { shell: false, claude: false, codex: false, grok: false },
    },
  });
  expect(setup.stage() === 'wsl', 'clean supported first run should resume at WSL2 Runtime');
  expect(setup.capabilityState().agents.shell === false, 'blocked runtime should disable Shell');

  setup.render({
    schemaVersion: 1,
    selectedDistro: 'Ubuntu',
    distros: [{ name: 'Ubuntu', version: 2, default: true, state: 'running' }],
    projectsRoot: null,
    defaultProjectsRoot: '/home/test/projects',
    checks: baseChecks,
    setupReady: false,
    needsSetup: true,
    capabilities: {
      canOpenSession: true,
      canCreateProject: false,
      agents: { shell: true, claude: false, codex: true, grok: false },
    },
  });
  expect(setup.visible(), 'setup overlay should be visible');
  expect(setup.stage() === 'root', 'partially ready setup should resume at Projects Root');
  expect(setup.rootValue() === '/home/test/projects', 'default root should be HOME/projects');
  expect(setup.checks().find((row) => row.id === 'projects-root').badge === 'Action Required',
    'missing required root should be Action Required');
  expect(setup.checks().find((row) => row.id === 'agent-claude').badge === 'Optional',
    'missing agent should be Optional');
  let caps = setup.capabilityState();
  expect(caps.createTabDisabled, 'missing root should disable Create Project');
  expect(caps.agents.shell && caps.agents.codex && !caps.agents.claude && !caps.agents.grok,
    'agent buttons should follow per-agent capabilities');
  expect(setup.confirmCreate(true) === false, 'explicit confirmation should enable Create & Verify');

  setup.render({
    schemaVersion: 1,
    selectedDistro: 'Ubuntu',
    distros: [{ name: 'Ubuntu', version: 2, default: true, state: 'running' }],
    projectsRoot: '/home/test/projects',
    defaultProjectsRoot: '/home/test/projects',
    checks: baseChecks.map((item) => item.id === 'projects-root' ? { ...item, ok: true, detail: 'writable' } : item),
    setupReady: true,
    needsSetup: true,
    capabilities: {
      canOpenSession: true,
      canCreateProject: true,
      agents: { shell: true, claude: false, codex: true, grok: false },
    },
  });
  expect(setup.stage() === 'ready', 'recovery should advance to Ready');
  caps = setup.capabilityState();
  expect(!caps.createTabDisabled && !caps.finishDisabled && !caps.selfTestDisabled,
    'ready state should enable project creation, self-test, and Finish');
  expect(/optional integration/.test(setup.summary()), 'ready summary should retain optional warnings');
  setup.selectStage('system');
  expect(setup.stage() === 'system', 'stage navigation should be resumable');
  const arrow = setup.arrowFrom('system', 'ArrowRight');
  expect(arrow.stage === 'wsl' && arrow.focused === 'wsl', 'arrow keys should move and focus setup stages');
  expect(setup.focusTrap() === 'windows-setup-exit', 'Tab should wrap within the setup dialog');
  return JSON.stringify({ ok: true });
})()
`);

const electron = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electron, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: home,
    PATH: '/usr/bin:/bin',
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: outputPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('WINDOWS_SETUP_RENDERER_FAIL', { code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('WINDOWS_SETUP_RENDERER_OK');
});
