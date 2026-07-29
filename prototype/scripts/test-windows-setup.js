#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  SETUP_SCHEMA_VERSION,
  boundedDetail,
  buildSetupStatus,
  calculateCapabilities,
  chooseDistro,
  completionPreference,
  createRoot,
  inspectRoot,
  windowsBuild,
} = require('../windows-setup');

function fakeRuntime({ tools = {}, writableRoots = [] } = {}) {
  const calls = [];
  return {
    calls,
    async readiness() {
      return {
        checks: [
          { id: 'bash', ok: tools.bash !== false, detail: 'GNU bash, version 5.2' },
          { id: 'git', ok: tools.git !== false, detail: 'git version 2.45.0' },
          { id: 'node', ok: tools.node !== false, detail: tools.nodeVersion || 'v22.12.0' },
          { id: 'claude', ok: Boolean(tools.claude), detail: tools.claude ? '/usr/bin/claude' : 'missing' },
          { id: 'codex', ok: Boolean(tools.codex), detail: tools.codex ? '/usr/bin/codex' : 'missing' },
          { id: 'grok', ok: Boolean(tools.grok), detail: tools.grok ? '/usr/bin/grok' : 'missing' },
        ],
      };
    },
    async run(_distro, args) {
      calls.push(args);
      if (args[0] === 'mkdir') {
        writableRoots.push(args[args.length - 1]);
        return { stdout: '', stderr: '' };
      }
      const root = args[args.length - 1];
      if (!writableRoots.includes(root)) {
        const error = new Error('not writable');
        error.stderr = 'missing or read-only';
        throw error;
      }
      return { stdout: `writable directory: ${root}`, stderr: '' };
    },
  };
}

async function run() {
  assert.strictEqual(windowsBuild('10.0.19045'), 19045);
  assert.strictEqual(windowsBuild('10.0.26100.1'), 26100);
  assert.strictEqual(windowsBuild('invalid'), null);
  assert.strictEqual(boundedDetail(`  ${'x'.repeat(800)}\n`), 'x'.repeat(500));
  assert.strictEqual(completionPreference({ schemaVersion: 2, completedAt: new Date().toISOString() }), null);
  assert.deepStrictEqual(
    completionPreference({ schemaVersion: SETUP_SCHEMA_VERSION, completedAt: '2026-07-28T12:00:00.000Z', extra: true }),
    { schemaVersion: SETUP_SCHEMA_VERSION, completedAt: '2026-07-28T12:00:00.000Z' },
  );

  const distros = [
    { name: 'Legacy', version: 1, default: true, state: 'stopped' },
    { name: 'Ubuntu', version: 2, default: false, state: 'running' },
    { name: 'Debian', version: 2, default: false, state: 'stopped' },
  ];
  assert.strictEqual(chooseDistro(distros, 'Debian').name, 'Debian');
  assert.strictEqual(chooseDistro(distros, 'Legacy').name, 'Ubuntu', 'WSL1 persisted choice must be rejected');
  assert.strictEqual(chooseDistro([{ name: 'Legacy', version: 1, default: true }], 'Legacy'), null);

  const runtime = fakeRuntime({ tools: { codex: true }, writableRoots: ['/home/george/projects'] });
  const ready = await buildSetupStatus({
    platform: 'win32',
    arch: 'x64',
    release: '10.0.19045',
    runtime,
    distros,
    selectedDistro: 'Ubuntu',
    home: '/home/george',
    root: '/home/george/projects',
  });
  assert.strictEqual(ready.setupReady, true);
  assert.strictEqual(ready.capabilities.canOpenSession, true);
  assert.strictEqual(ready.capabilities.canCreateProject, true);
  assert.deepStrictEqual(ready.capabilities.agents, {
    shell: true, claude: false, codex: true, grok: false,
  });
  assert.strictEqual(ready.needsSetup, true, 'readiness must not silently equal user completion');
  assert.strictEqual(ready.checks.find((item) => item.id === 'agent-claude').required, false);
  assert.strictEqual(
    ready.checks.find((item) => item.id === 'agent-claude').remediation.documentationKey,
    'chromux',
  );
  assert.strictEqual(ready.defaultProjectsRoot, '/home/george/projects');

  const migrated = await buildSetupStatus({
    platform: 'win32',
    arch: 'x64',
    release: '10.0.22621',
    runtime,
    distros,
    selectedDistro: 'Ubuntu',
    home: '/home/george',
    root: '/home/george/projects',
    migrateExisting: true,
    now: () => new Date('2026-07-28T12:00:00.000Z'),
  });
  assert.deepStrictEqual(migrated.completion, {
    schemaVersion: SETUP_SCHEMA_VERSION,
    completedAt: '2026-07-28T12:00:00.000Z',
  });
  assert.strictEqual(migrated.needsSetup, false);

  const oldNode = fakeRuntime({
    tools: { nodeVersion: 'v22.11.9', claude: true },
    writableRoots: ['/home/george/projects'],
  });
  const blocked = await buildSetupStatus({
    platform: 'win32',
    arch: 'x64',
    release: '10.0.19044',
    runtime: oldNode,
    distros,
    selectedDistro: 'Ubuntu',
    home: '/home/george',
    root: '/home/george/projects',
  });
  assert.strictEqual(blocked.capabilities.canOpenSession, false);
  assert.strictEqual(blocked.capabilities.agents.shell, false);
  assert.strictEqual(blocked.capabilities.agents.claude, false);

  const missingRoot = await buildSetupStatus({
    platform: 'win32',
    arch: 'x64',
    release: '10.0.19045',
    runtime: fakeRuntime({ tools: { claude: true } }),
    distros,
    selectedDistro: 'Ubuntu',
    home: '/home/george',
  });
  assert.strictEqual(missingRoot.defaultProjectsRoot, '/home/george/projects');
  assert.strictEqual(missingRoot.capabilities.canOpenSession, true);
  assert.strictEqual(missingRoot.capabilities.canCreateProject, false);

  const createdRuntime = fakeRuntime();
  const created = await createRoot(createdRuntime, 'Ubuntu', '/home/george/projects');
  assert.strictEqual(created.ok, true);
  assert.deepStrictEqual(createdRuntime.calls[0], ['mkdir', '-p', '--', '/home/george/projects']);
  assert.strictEqual((await inspectRoot(createdRuntime, 'Ubuntu', 'relative')).ok, false);
  assert.rejects(() => createRoot(createdRuntime, 'Ubuntu', 'C:\\projects'), /absolute Linux path/);

  const capabilityFixture = calculateCapabilities([
    ...['windows-build', 'windows-architecture', 'wsl2-distro', 'bash', 'git', 'node']
      .map((id) => ({ id, ok: true })),
    { id: 'projects-root', ok: false },
    { id: 'agent-claude', ok: true },
    { id: 'agent-codex', ok: false },
    { id: 'agent-grok', ok: false },
  ]);
  assert.strictEqual(capabilityFixture.canOpenSession, true);
  assert.strictEqual(capabilityFixture.canCreateProject, false);
  assert.strictEqual(capabilityFixture.agents.claude, true);
  console.log('windows setup tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
