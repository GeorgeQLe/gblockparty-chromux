'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createVercelShippingService,
  deploymentUrl,
  parseGitStatus,
} = require('../vercel-shipping-service');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-vercel-ship-'));
const jobsFile = path.join(temp, 'jobs.json');
const mapping = {
  key: 'mapping_123',
  location: { runtime: 'host', distro: null, cwd: '/fixture/repo' },
  repositoryRoot: '/fixture/repo',
  deployRoot: '/fixture/repo/app',
  profileId: 'fixture',
  orgId: 'team_fixture',
  projectId: 'prj_fixture',
  trigger: 'git',
  productionBranch: 'main',
  rememberedEnvironment: 'preview',
};
const calls = [];
let gitStatus = [
  '# branch.oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '# branch.head feature/vercel',
  '# branch.upstream origin/feature/vercel',
  '# branch.ab +0 -0',
  '1 .M N... 100644 100644 100644 aaaaaaa aaaaaaa tracked.txt',
  '? untracked file.txt',
  '',
].join('\0');
let head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
let pushFails = false;
let inspectPending = false;

function git(location, args) {
  calls.push({ tool: 'git', cwd: location.cwd, args: [...args] });
  if (args[0] === 'status') return Promise.resolve({ ok: true, stdout: gitStatus, stderr: '', code: 0 });
  if (args[0] === 'add') {
    assert.deepStrictEqual(args, ['add', '-A', '--', '.']);
    return Promise.resolve({ ok: true, stdout: '', stderr: '', code: 0 });
  }
  if (args[0] === 'commit') {
    assert.deepStrictEqual(args, ['commit', '-m', 'Ship guarded preview']);
    head = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    gitStatus = [
      `# branch.oid ${head}`,
      '# branch.head feature/vercel',
      '# branch.upstream origin/feature/vercel',
      '# branch.ab +1 -0',
      '',
    ].join('\0');
    return Promise.resolve({ ok: true, stdout: '[feature bbbbbbb] Ship', stderr: '', code: 0 });
  }
  if (args[0] === 'rev-parse') return Promise.resolve({ ok: true, stdout: `${head}\n`, stderr: '', code: 0 });
  if (args[0] === 'push') {
    return Promise.resolve(pushFails
      ? { ok: false, stdout: '', stderr: 'remote unavailable', code: 1 }
      : { ok: true, stdout: '', stderr: '', code: 0 });
  }
  throw new Error(`unexpected git ${args.join(' ')}`);
}

function vercel(_key, args, options) {
  calls.push({
    tool: 'vercel',
    args: [...args],
    env: options?.env,
  });
  if (args[0] === 'list') {
    assert(args.includes(`githubCommitSha=${head}`));
    return Promise.resolve({ ok: true, stdout: 'https://fixture-git.vercel.app\n', stderr: '', code: 0 });
  }
  if (args[0] === 'inspect') {
    if (inspectPending) {
      return new Promise((resolve) => {
        options.signal.addEventListener('abort', () => resolve({ ok: false, stdout: '', stderr: 'aborted', code: 1 }), { once: true });
      });
    }
    return Promise.resolve({ ok: true, stdout: 'READY', stderr: '', code: 0 });
  }
  if (args[0] === 'deploy') {
    return Promise.resolve({ ok: true, stdout: 'https://fixture-direct.vercel.app\n', stderr: '', code: 0 });
  }
  throw new Error(`unexpected vercel ${args.join(' ')}`);
}

async function waitFor(service, predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const job = service.jobsRead().jobs[0];
    if (job && predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`job timeout: ${JSON.stringify(service.jobsRead())}`);
}

(async () => {
  const parsed = parseGitStatus(gitStatus);
  assert.strictEqual(parsed.branch, 'feature/vercel');
  assert.strictEqual(parsed.paths.length, 2);
  assert.strictEqual(parsed.paths[1].untracked, true);
  assert.strictEqual(deploymentUrl('noise https://ship-123.vercel.app more'), 'https://ship-123.vercel.app');

  const events = [];
  const service = createVercelShippingService({
    jobsFile,
    resolveProject: async (key) => key === mapping.key
      ? { ok: true, project: mapping }
      : { ok: false },
    validateProject: async () => ({ ok: true }),
    runGit: git,
    runVercel: vercel,
    emit: (job) => events.push(job),
    discoveryIntervalMs: 1,
  });
  const preview = await service.shipPreview({ mappingKey: mapping.key });
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.environment, 'preview');
  assert.strictEqual(preview.paths.length, 2);
  assert.strictEqual(preview.productionConfirmation, null);

  gitStatus += '? changed-after-review\0';
  const stale = await service.shipStart({
    mappingKey: mapping.key,
    fingerprint: preview.fingerprint,
    commitMessage: 'Ship guarded preview',
    confirmed: true,
  });
  assert.strictEqual(stale.error.code, 'STALE_REVIEW');
  gitStatus = gitStatus.replace('? changed-after-review\0', '');

  const reviewed = await service.shipPreview({ mappingKey: mapping.key });
  pushFails = true;
  const started = await service.shipStart({
    mappingKey: mapping.key,
    fingerprint: reviewed.fingerprint,
    commitMessage: 'Ship guarded preview',
    confirmed: true,
  });
  assert.strictEqual(started.ok, true);
  let job = await waitFor(service, (candidate) => candidate.phase === 'failed');
  assert.strictEqual(job.retryAction, 'push');
  assert.strictEqual(job.commitSha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert(job.message.includes('remote unavailable'));
  assert.strictEqual(fs.statSync(jobsFile).mode & 0o777, 0o600);
  assert(!fs.readFileSync(jobsFile, 'utf8').includes('VERCEL_TOKEN'));

  pushFails = false;
  assert.strictEqual(service.jobRetry(job.id).ok, true);
  job = await waitFor(service, (candidate) => candidate.phase === 'ready');
  assert.strictEqual(job.deploymentUrl, 'https://fixture-git.vercel.app');
  assert(calls.some((call) => call.tool === 'git' && call.args[0] === 'add'));
  assert.strictEqual(calls.filter((call) => call.tool === 'git' && call.args[0] === 'commit').length, 1);

  mapping.trigger = 'direct';
  mapping.rememberedEnvironment = 'production';
  gitStatus = [
    `# branch.oid ${head}`,
    '# branch.head feature/vercel',
    '# branch.upstream origin/feature/vercel',
    '# branch.ab +0 -0',
    '',
  ].join('\0');
  const production = await service.shipPreview({ mappingKey: mapping.key });
  assert.strictEqual(production.production, true);
  const refusedProduction = await service.shipStart({
    mappingKey: mapping.key,
    fingerprint: production.fingerprint,
    confirmed: true,
  });
  assert.strictEqual(refusedProduction.error.code, 'PRODUCTION_CONFIRMATION_REQUIRED');
  const direct = await service.shipStart({
    mappingKey: mapping.key,
    fingerprint: production.fingerprint,
    confirmed: true,
    productionConfirmation: production.productionConfirmation,
  });
  assert.strictEqual(direct.ok, true);
  job = await waitFor(service, (candidate) => candidate.id === direct.job.id && candidate.phase === 'ready');
  assert.strictEqual(job.deploymentUrl, 'https://fixture-direct.vercel.app');
  const deploy = calls.find((call) => call.tool === 'vercel' && call.args[0] === 'deploy');
  assert.deepStrictEqual(deploy.args, ['deploy', '--yes', '--no-wait', '--no-color', '--prod']);

  mapping.rememberedEnvironment = 'preview';
  inspectPending = true;
  const cancelPreview = await service.shipPreview({ mappingKey: mapping.key, environment: 'preview' });
  const cancelStart = await service.shipStart({
    mappingKey: mapping.key,
    fingerprint: cancelPreview.fingerprint,
    confirmed: true,
  });
  assert.strictEqual(cancelStart.ok, true);
  await waitFor(service, (candidate) => candidate.id === cancelStart.job.id && candidate.phase === 'building');
  const canceled = service.jobCancel(cancelStart.job.id);
  assert.strictEqual(canceled.ok, true, JSON.stringify(canceled));
  job = await waitFor(service, (candidate) => candidate.id === cancelStart.job.id && candidate.phase === 'canceled');
  assert.strictEqual(job.retryAction, 'inspect');
  inspectPending = false;
  assert.strictEqual(service.jobRetry(job.id).ok, true);
  await waitFor(service, (candidate) => candidate.id === job.id && candidate.phase === 'ready');

  fs.writeFileSync(path.join(temp, 'corrupt.json'), '{bad', { mode: 0o600 });
  const corrupt = createVercelShippingService({
    jobsFile: path.join(temp, 'corrupt.json'),
    resolveProject: async () => ({ ok: true, project: mapping }),
    runGit: git,
    runVercel: vercel,
  });
  assert.deepStrictEqual(corrupt.jobsRead().jobs, []);

  const restartFile = path.join(temp, 'restart.json');
  const timestamp = new Date().toISOString();
  fs.writeFileSync(restartFile, `${JSON.stringify({
    schemaVersion: 1,
    jobs: [{
      id: 'deadbeef-dead-beef-dead-beefdeadbeef',
      mappingKey: mapping.key,
      trigger: 'direct',
      environment: 'preview',
      phase: 'building',
      commitSha: null,
      deploymentUrl: 'https://restart-fixture.vercel.app',
      retryAction: 'inspect',
      message: 'building',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: null,
    }],
  })}\n`, { mode: 0o600 });
  const restarted = createVercelShippingService({
    jobsFile: restartFile,
    resolveProject: async () => ({ ok: true, project: mapping }),
    validateProject: async () => ({ ok: true }),
    runGit: git,
    runVercel: vercel,
  });
  const resumed = await waitFor(restarted, (candidate) => candidate.phase === 'ready');
  assert.strictEqual(resumed.deploymentUrl, 'https://restart-fixture.vercel.app');
  assert(events.length > 5);
  console.log('VERCEL_SHIPPING_SERVICE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
