'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const JOB_SCHEMA_VERSION = 1;
const TERMINAL_PHASES = new Set(['ready', 'failed', 'canceled', 'interrupted']);
const ACTIVE_PHASES = new Set([
  'preparing', 'committing', 'pushing', 'discovering', 'building',
]);
const ENVIRONMENTS = new Set(['preview', 'production']);
const URL_RE = /https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9](?:\/[^\s]*)?/g;
const MAX_JOBS = 200;

function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
}

function cleanText(value, max = 4000) {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').trim().slice(0, max)
    : '';
}

function publicJob(job) {
  return {
    id: job.id,
    mappingKey: job.mappingKey,
    trigger: job.trigger,
    environment: job.environment,
    phase: job.phase,
    commitSha: job.commitSha || null,
    deploymentUrl: job.deploymentUrl || null,
    retryAction: job.retryAction || null,
    message: job.message || '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
  };
}

function normalizeJob(record) {
  if (!record || typeof record !== 'object') return null;
  if (!/^[a-f0-9-]{8,80}$/.test(record.id || '')
    || !/^[A-Za-z0-9_-]{1,64}$/.test(record.mappingKey || '')
    || !['git', 'direct'].includes(record.trigger)
    || !ENVIRONMENTS.has(record.environment)
    || ![...ACTIVE_PHASES, ...TERMINAL_PHASES].includes(record.phase)) return null;
  const createdAt = cleanText(record.createdAt, 40);
  const updatedAt = cleanText(record.updatedAt, 40);
  if (!createdAt || !updatedAt) return null;
  return {
    id: record.id,
    mappingKey: record.mappingKey,
    trigger: record.trigger,
    environment: record.environment,
    phase: record.phase,
    commitSha: /^[a-f0-9]{7,64}$/i.test(record.commitSha || '') ? record.commitSha : null,
    deploymentUrl: /^https:\/\/[^\s]{1,2000}$/.test(record.deploymentUrl || '') ? record.deploymentUrl : null,
    retryAction: ['push', 'discover', 'inspect'].includes(record.retryAction) ? record.retryAction : null,
    message: cleanText(record.message),
    createdAt,
    updatedAt,
    startedAt: cleanText(record.startedAt, 40) || createdAt,
    finishedAt: cleanText(record.finishedAt, 40) || null,
  };
}

function parseGitStatus(output) {
  const fields = String(output || '').split('\0').filter(Boolean);
  const status = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    head: null,
    detached: false,
    conflicts: [],
    paths: [],
    raw: String(output || ''),
  };
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.startsWith('# branch.head ')) {
      const branch = field.slice(14);
      status.detached = branch === '(detached)';
      status.branch = status.detached ? null : branch;
    } else if (field.startsWith('# branch.oid ')) {
      const oid = field.slice(13);
      status.head = oid === '(initial)' ? null : oid;
    } else if (field.startsWith('# branch.upstream ')) {
      status.upstream = field.slice(18);
    } else if (field.startsWith('# branch.ab ')) {
      const match = field.match(/\+(\d+)\s+-(\d+)/);
      if (match) {
        status.ahead = Number(match[1]);
        status.behind = Number(match[2]);
      }
    } else if (/^[12u?] /.test(field)) {
      const kind = field[0];
      const xy = kind === '?' ? '??' : field.slice(2, 4);
      let filePath = kind === '?' ? field.slice(2) : field.split(' ').slice(kind === '2' ? 9 : 8).join(' ');
      if (kind === '2' && fields[index + 1]) {
        filePath = `${filePath} ← ${fields[index + 1]}`;
        index += 1;
      }
      status.paths.push({ path: cleanText(filePath, 8192), status: xy, untracked: kind === '?' });
      if (kind === 'u' || /U/.test(xy)) status.conflicts.push(cleanText(filePath, 8192));
    }
  }
  return status;
}

function statusFingerprint(mappingKey, environment, status, project = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    mappingKey,
    environment,
    trigger: project.trigger,
    orgId: project.orgId,
    projectId: project.projectId,
    repositoryRoot: project.repositoryRoot,
    deployRoot: project.deployRoot,
    updatedAt: project.updatedAt,
    head: status.head,
    branch: status.branch,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    raw: status.raw,
  })).digest('hex');
}

function deploymentUrl(output) {
  const urls = String(output || '').match(URL_RE) || [];
  return urls.find((url) => /\.vercel\.app(?:\/|$)/.test(url)) || urls[0] || null;
}

function createVercelShippingService({
  jobsFile,
  resolveProject,
  validateProject = async () => ({ ok: true }),
  runGit,
  runVercel,
  emit = () => {},
  now = () => Date.now(),
  sleep = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Canceled'), { name: 'AbortError' }));
    }, { once: true });
  }),
  discoveryTimeoutMs = 5 * 60 * 1000,
  discoveryIntervalMs = 5000,
  autoResume = true,
}) {
  const controllers = new Map();
  let jobs = readJobs();

  function readJobs() {
    try {
      const parsed = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
      if (parsed.schemaVersion !== JOB_SCHEMA_VERSION || !Array.isArray(parsed.jobs)) return [];
      return parsed.jobs.map(normalizeJob).filter(Boolean).slice(0, MAX_JOBS);
    } catch {
      return [];
    }
  }

  function persist() {
    atomicJson(jobsFile, { schemaVersion: JOB_SCHEMA_VERSION, jobs: jobs.slice(0, MAX_JOBS) });
  }

  function update(job, patch) {
    Object.assign(job, patch, { updatedAt: new Date(now()).toISOString() });
    if (TERMINAL_PHASES.has(job.phase) && !job.finishedAt) job.finishedAt = job.updatedAt;
    persist();
    emit(publicJob(job));
    return publicJob(job);
  }

  function fail(job, message, retryAction = null) {
    return update(job, { phase: 'failed', message: cleanText(message), retryAction });
  }

  async function mapping(key) {
    const result = await resolveProject(key);
    return result?.ok ? result.project : null;
  }

  async function gitStatus(project) {
    const result = await runGit(
      { ...project.location, cwd: project.repositoryRoot },
      ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'],
      { timeout: 15000 },
    );
    if (!result.ok) throw new Error(cleanText(result.stderr) || 'Git status failed.');
    return parseGitStatus(result.stdout);
  }

  async function shipPreview({ mappingKey, environment } = {}) {
    const project = await mapping(mappingKey);
    if (!project) return { ok: false, error: { code: 'UNKNOWN_PROJECT', message: 'Review Vercel setup again.' } };
    const validated = await validateProject(project);
    if (!validated?.ok) {
      return {
        ok: false,
        error: validated?.error || { code: 'CONNECTION_REJECTED', message: 'The saved Vercel connection could not be validated.' },
      };
    }
    let status;
    try { status = await gitStatus(project); } catch (error) {
      return { ok: false, error: { code: 'GIT_STATUS_FAILED', message: error.message } };
    }
    const selected = project.trigger === 'git'
      ? (project.productionBranch && status.branch === project.productionBranch ? 'production' : 'preview')
      : (ENVIRONMENTS.has(environment) ? environment : project.rememberedEnvironment || 'preview');
    if (status.detached) return { ok: false, error: { code: 'DETACHED_HEAD', message: 'Shipping is disabled from a detached HEAD.' } };
    if (status.conflicts.length) return { ok: false, error: { code: 'GIT_CONFLICTS', message: 'Resolve Git conflicts before shipping.' } };
    return {
      ok: true,
      kind: 'ship-preview',
      mappingKey,
      trigger: project.trigger,
      environment: selected,
      production: selected === 'production',
      productionConfirmation: selected === 'production'
        ? `${project.projectId} ${project.trigger === 'git' ? status.branch : selected}` : null,
      branch: status.branch,
      upstream: status.upstream,
      ahead: status.ahead,
      behind: status.behind,
      head: status.head,
      paths: status.paths,
      clean: status.paths.length === 0,
      fingerprint: statusFingerprint(mappingKey, selected, status, project),
      project: { key: project.key, projectId: project.projectId, orgId: project.orgId },
    };
  }

  async function inspect(job, signal) {
    update(job, { phase: 'building', retryAction: 'inspect', message: 'Monitoring the Vercel deployment…' });
    const result = await runVercel(job.mappingKey, [
      'inspect', job.deploymentUrl, '--wait', '--timeout=15m', '--no-color',
    ], { timeout: 16 * 60 * 1000, signal });
    if (signal.aborted) throw Object.assign(new Error('Canceled'), { name: 'AbortError' });
    if (!result.ok) return fail(job, result.stderr || result.stdout || 'Vercel deployment failed.', 'inspect');
    return update(job, { phase: 'ready', retryAction: null, message: 'Preview deployment is ready.' });
  }

  async function discover(job, signal) {
    update(job, { phase: 'discovering', retryAction: 'discover', message: 'Waiting for Vercel to discover the pushed commit…' });
    const deadline = now() + discoveryTimeoutMs;
    while (now() < deadline) {
      const result = await runVercel(job.mappingKey, [
        'list', '--meta', `githubCommitSha=${job.commitSha}`, '--yes', '--no-color',
      ], { timeout: 30000, signal });
      if (signal.aborted) throw Object.assign(new Error('Canceled'), { name: 'AbortError' });
      const url = deploymentUrl(`${result.stdout}\n${result.stderr}`);
      if (result.ok && url) {
        update(job, { deploymentUrl: url, retryAction: 'inspect', message: 'Deployment found; monitoring build…' });
        return inspect(job, signal);
      }
      await sleep(discoveryIntervalMs, signal);
    }
    return fail(job, 'No new Vercel deployment appeared within five minutes.', 'discover');
  }

  async function push(job, project, status, signal) {
    update(job, { phase: 'pushing', retryAction: 'push', message: 'Pushing the reviewed commit…' });
    const args = status.upstream ? ['push'] : ['push', '--set-upstream', 'origin', status.branch];
    const result = await runGit({ ...project.location, cwd: project.repositoryRoot }, args, {
      timeout: 120000,
      signal,
    });
    if (!result.ok) return fail(job, result.stderr || 'Git push failed.', 'push');
    return discover(job, signal);
  }

  async function runGitJob(job, project, preview, commitMessage, signal) {
    let status = await gitStatus(project);
    if (statusFingerprint(job.mappingKey, job.environment, status, project) !== preview.fingerprint) {
      return fail(job, 'Git status changed after review. Review shipping again.');
    }
    if (status.paths.length) {
      update(job, { phase: 'committing', message: 'Staging all reviewed repository changes…' });
      const staged = await runGit({ ...project.location, cwd: project.repositoryRoot }, ['add', '-A', '--', '.'], {
        timeout: 30000, signal,
      });
      if (!staged.ok) return fail(job, staged.stderr || 'Git staging failed.');
      const committed = await runGit({ ...project.location, cwd: project.repositoryRoot }, [
        'commit', '-m', commitMessage,
      ], { timeout: 120000, signal });
      if (!committed.ok) return fail(job, committed.stderr || 'Git commit failed.');
      const head = await runGit({ ...project.location, cwd: project.repositoryRoot }, ['rev-parse', 'HEAD'], { timeout: 10000, signal });
      if (!head.ok || !/^[a-f0-9]{40,64}$/i.test(head.stdout.trim())) return fail(job, 'The new Git commit could not be verified.');
      job.commitSha = head.stdout.trim();
      persist();
      status = await gitStatus(project);
      if (status.paths.length) {
        return fail(job, 'Commit hooks left additional repository changes. Review before pushing.');
      }
    } else {
      if (!status.head) return fail(job, 'The clean branch has no commit to deploy.');
      job.commitSha = status.head;
      persist();
      if (status.behind > 0) return fail(job, 'The branch is behind its upstream. Chromux will not pull automatically.');
      if (status.ahead === 0 && status.upstream) return discover(job, signal);
    }
    return push(job, project, status, signal);
  }

  async function runDirectJob(job, project, signal) {
    update(job, { phase: 'preparing', message: 'Starting a direct Vercel deployment…' });
    const args = ['deploy', '--yes', '--no-wait', '--no-color'];
    if (job.environment === 'production') args.push('--prod');
    const result = await runVercel(job.mappingKey, args, { timeout: 120000, signal });
    if (!result.ok) return fail(job, result.stderr || 'Vercel deploy failed.');
    const url = deploymentUrl(result.stdout);
    if (!url) return fail(job, 'Vercel did not return a deployment URL.');
    update(job, { deploymentUrl: url, retryAction: 'inspect', message: 'Deployment created; monitoring build…' });
    return inspect(job, signal);
  }

  async function execute(job, action, preview, commitMessage) {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    try {
      const project = await mapping(job.mappingKey);
      if (!project) return fail(job, 'The saved Vercel mapping changed. Review setup again.');
      if (action === 'push') {
        const head = await runGit({ ...project.location, cwd: project.repositoryRoot }, ['rev-parse', 'HEAD'], { timeout: 10000 });
        if (!head.ok || head.stdout.trim() !== job.commitSha) return fail(job, 'HEAD changed; push-only retry is unsafe.');
        return await push(job, project, await gitStatus(project), controller.signal);
      }
      if (action === 'discover') return await discover(job, controller.signal);
      if (action === 'inspect') return await inspect(job, controller.signal);
      return await (job.trigger === 'git'
        ? runGitJob(job, project, preview, commitMessage, controller.signal)
        : runDirectJob(job, project, controller.signal));
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        return update(job, { phase: 'canceled', message: 'Local deployment monitoring was canceled.', retryAction: job.deploymentUrl ? 'inspect' : (job.commitSha ? 'discover' : null) });
      }
      return fail(job, error?.message || 'Shipping failed.', job.deploymentUrl ? 'inspect' : (job.commitSha ? 'discover' : null));
    } finally {
      controllers.delete(job.id);
    }
  }

  async function shipStart({ mappingKey, fingerprint, environment, commitMessage, confirmed, productionConfirmation } = {}) {
    if (!confirmed) return { ok: false, error: { code: 'CONFIRMATION_REQUIRED', message: 'Review confirmation is required.' } };
    if (jobs.some((job) => job.mappingKey === mappingKey && ACTIVE_PHASES.has(job.phase))) {
      return { ok: false, error: { code: 'JOB_ACTIVE', message: 'This mapping already has an active shipping job.' } };
    }
    const preview = await shipPreview({ mappingKey, environment });
    if (!preview.ok) return preview;
    if (preview.fingerprint !== fingerprint) {
      return { ok: false, error: { code: 'STALE_REVIEW', message: 'Git status changed after review. Review shipping again.' } };
    }
    if (preview.production && productionConfirmation !== preview.productionConfirmation) {
      return { ok: false, error: { code: 'PRODUCTION_CONFIRMATION_REQUIRED', message: 'Type the exact project and branch/environment confirmation.' } };
    }
    const message = cleanText(commitMessage, 500);
    if (preview.trigger === 'git' && !preview.clean && !message) {
      return { ok: false, error: { code: 'COMMIT_MESSAGE_REQUIRED', message: 'Enter a Git commit message.' } };
    }
    const timestamp = new Date(now()).toISOString();
    const job = {
      id: crypto.randomUUID(),
      mappingKey,
      trigger: preview.trigger,
      environment: preview.environment,
      phase: 'preparing',
      commitSha: null,
      deploymentUrl: null,
      retryAction: null,
      message: 'Shipping approved.',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: null,
    };
    jobs.unshift(job);
    jobs = jobs.slice(0, MAX_JOBS);
    persist();
    emit(publicJob(job));
    void execute(job, null, preview, message);
    return { ok: true, kind: 'job-started', job: publicJob(job) };
  }

  function jobsRead() {
    return { ok: true, kind: 'jobs', jobs: jobs.map(publicJob) };
  }

  function jobCancel(id) {
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) return { ok: false, error: { code: 'UNKNOWN_JOB', message: 'Shipping job not found.' } };
    const controller = controllers.get(id);
    if (!controller || !['discovering', 'building'].includes(job.phase)) {
      return {
        ok: false,
        error: {
          code: 'JOB_NOT_CANCELABLE',
          message: 'Only local deployment discovery or inspection can be canceled.',
        },
      };
    }
    controller.abort();
    return { ok: true, kind: 'cancel-requested', job: publicJob(job) };
  }

  function jobRetry(id) {
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) return { ok: false, error: { code: 'UNKNOWN_JOB', message: 'Shipping job not found.' } };
    if (!job.retryAction || controllers.has(id)) {
      return { ok: false, error: { code: 'JOB_NOT_RETRYABLE', message: 'This job cannot be retried.' } };
    }
    if (jobs.some((candidate) => candidate.id !== id
      && candidate.mappingKey === job.mappingKey && ACTIVE_PHASES.has(candidate.phase))) {
      return { ok: false, error: { code: 'JOB_ACTIVE', message: 'This mapping already has an active shipping job.' } };
    }
    job.phase = job.retryAction === 'inspect' ? 'building' : job.retryAction === 'discover' ? 'discovering' : 'pushing';
    job.finishedAt = null;
    persist();
    emit(publicJob(job));
    void execute(job, job.retryAction);
    return { ok: true, kind: 'job-retried', job: publicJob(job) };
  }

  // A process may stop during a local monitor. Remote Git/Vercel mutations are
  // never repeated automatically. Jobs with a stable remote identity become
  // retryable; pre-trigger jobs require a new review.
  const resumable = [];
  const resumedMappings = new Set();
  for (const job of jobs) {
    if (!ACTIVE_PHASES.has(job.phase)) continue;
    job.phase = 'interrupted';
    job.retryAction = job.deploymentUrl ? 'inspect' : (job.commitSha ? 'discover' : null);
    job.message = job.retryAction
      ? 'Chromux restarted. Resume monitoring this existing deployment.'
      : 'Chromux restarted before a remote trigger was verified. Review shipping again.';
    job.finishedAt = new Date(now()).toISOString();
    job.updatedAt = job.finishedAt;
    if (job.retryAction && !resumedMappings.has(job.mappingKey)) {
      resumable.push(job.id);
      resumedMappings.add(job.mappingKey);
    }
  }
  if (jobs.length) persist();
  if (autoResume) {
    for (const id of resumable) queueMicrotask(() => { jobRetry(id); });
  }

  return { shipPreview, shipStart, jobsRead, jobCancel, jobRetry };
}

module.exports = {
  JOB_SCHEMA_VERSION,
  createVercelShippingService,
  deploymentUrl,
  normalizeJob,
  parseGitStatus,
  statusFingerprint,
};
