'use strict';

const assert = require('assert');
const { execFile } = require('child_process');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createGitWorktreeService,
  parseStatusPorcelainV2,
  parseWorktreePorcelain,
  rankWorktree,
} = require('../git-worktree-service');

const worktrees = parseWorktreePorcelain([
  'worktree /tmp/main tree', 'HEAD abc', 'branch refs/heads/main', '',
  'worktree /tmp/detached', 'HEAD def', 'detached', 'locked maintenance', '',
  'worktree /tmp/gone', 'HEAD 123', 'branch refs/heads/old', 'prunable gitdir file points to non-existent location', '',
].join('\0'));
assert.strictEqual(worktrees.length, 3);
assert.strictEqual(worktrees[0].path, '/tmp/main tree');
assert.strictEqual(worktrees[0].branch, 'main');
assert.strictEqual(worktrees[1].detached, true);
assert.strictEqual(worktrees[1].locked, 'maintenance');
assert.match(worktrees[2].prunable, /non-existent/);
assert.strictEqual(parseWorktreePorcelain([
  'worktree /tmp/main tree', 'HEAD abc', 'branch refs/heads/main', '',
  'worktree /tmp/linked', 'HEAD def', 'branch refs/heads/linked', '',
].join('\n')).length, 2, 'older Git newline-delimited porcelain must remain supported');
assert.deepStrictEqual(parseWorktreePorcelain('malformed\0HEAD nope\0'), []);

const status = parseStatusPorcelainV2([
  '# branch.oid abc',
  '# branch.head feature/space',
  '# branch.upstream origin/feature/space',
  '# branch.ab +3 -2',
  '1 .M N... 100644 100644 100644 aaa bbb src/a file.js',
  '2 R. N... 100644 100644 100644 aaa bbb R100 src/renamed ü.js',
  'src/original ü.js',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
  '? untracked file.txt',
  '',
].join('\0'));
assert.strictEqual(status.branch, 'feature/space');
assert.strictEqual(status.upstream, 'origin/feature/space');
assert.strictEqual(status.ahead, 3);
assert.strictEqual(status.behind, 2);
assert.strictEqual(status.files.length, 4);
assert.strictEqual(status.files[0].path, 'src/a file.js');
assert.strictEqual(status.files[1].originalPath, 'src/original ü.js');
assert.strictEqual(status.files[2].conflicted, true);
assert.strictEqual(status.files[3].kind, 'untracked');
assert.strictEqual(parseStatusPorcelainV2('# malformed\0garbage\0').files.length, 0);
assert(rankWorktree({ conflicted: true }) < rankWorktree({ dirty: true }));
assert(rankWorktree({ stale: true, dirty: true }) < rankWorktree({ dirty: true }));
assert(rankWorktree({ ahead: 1 }) < rankWorktree({ behind: 1 }));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-git-worktrees-'));
const repositoryPath = path.join(temp, 'repository');
const linkedPath = path.join(temp, 'linked worktree');
const chromuxHome = path.join(temp, 'chromux-home');
fs.mkdirSync(repositoryPath, { recursive: true });
execFileSync('/usr/bin/git', ['init', '-q', repositoryPath]);
execFileSync('/usr/bin/git', ['-C', repositoryPath, 'config', 'user.name', 'Chromux Test']);
execFileSync('/usr/bin/git', ['-C', repositoryPath, 'config', 'user.email', 'chromux@example.com']);
fs.writeFileSync(path.join(repositoryPath, 'tracked.txt'), 'base\n');
execFileSync('/usr/bin/git', ['-C', repositoryPath, 'add', 'tracked.txt']);
execFileSync('/usr/bin/git', ['-C', repositoryPath, 'commit', '-qm', 'initial']);
execFileSync('/usr/bin/git', ['-C', repositoryPath, 'worktree', 'add', '-qb', 'linked', linkedPath]);
fs.appendFileSync(path.join(linkedPath, 'tracked.txt'), 'dirty\n');
fs.writeFileSync(path.join(linkedPath, 'unicode ü.txt'), 'untracked\n');

function run(location, args, options = {}) {
  return new Promise((resolve) => {
    execFile('/usr/bin/git', ['-C', location.cwd, ...args], {
      timeout: options.timeout || 10000,
      maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout, stderr) => resolve({
      ok: !error,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      code: error ? error.code || 1 : 0,
    }));
  });
}

const service = createGitWorktreeService({
  catalogFile: path.join(chromuxHome, 'git-repositories.json'),
  run,
  canonicalize: async ({ cwd, child }) => {
    const base = fs.realpathSync(cwd);
    const candidate = child ? fs.realpathSync(path.resolve(base, child)) : base;
    if (child && candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) throw new Error('outside');
    return candidate;
  },
  statMtime: async ({ cwd, path: filePath }) => {
    try { return fs.statSync(path.join(cwd, filePath)).mtimeMs; } catch { return 0; }
  },
  now: () => Date.now(),
});

(async () => {
  const observed = await service.observe({
    runtime: 'host',
    cwd: linkedPath,
    activityAt: Date.now(),
  });
  assert.strictEqual(observed.ok, true);
  assert.strictEqual(service.catalog().repositories.length, 1);
  const inventory = await service.inventory({
    sessions: [{ sessionId: 'latest', repositoryId: observed.repository.id, cwd: linkedPath, activityAt: Date.now() }],
  });
  assert.strictEqual(inventory.ok, true);
  assert.strictEqual(inventory.repositories[0].worktrees.length, 2);
  const linked = inventory.repositories[0].worktrees.find((worktree) => worktree.path === fs.realpathSync(linkedPath));
  assert(linked);
  assert.strictEqual(linked.totals.files, 2);
  assert.strictEqual(linked.unpublished, true);
  assert.deepStrictEqual(linked.associatedSessionIds, ['latest']);
  assert.strictEqual(linked.stale, false);

  const diff = await service.diff({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    path: 'unicode ü.txt',
  });
  assert.strictEqual(diff.ok, true);
  assert.strictEqual(diff.untracked, true);
  assert.match(diff.text, /untracked/);
  const outsidePath = path.join(temp, 'outside-secret.txt');
  fs.writeFileSync(outsidePath, 'outside\n');
  fs.symlinkSync(outsidePath, path.join(linkedPath, 'outside-link.txt'));
  const withSymlink = await service.inventory();
  const symlinkWorktree = withSymlink.repositories[0].worktrees.find((worktree) => worktree.id === linked.id);
  const symlinkDiff = await service.diff({
    repositoryId: observed.repository.id,
    worktreeId: symlinkWorktree.id,
    path: 'outside-link.txt',
  });
  assert.strictEqual(symlinkDiff.error.code, 'FILE_UNAVAILABLE');

  const staged = await service.stage({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    paths: ['tracked.txt', 'unicode ü.txt'],
  });
  assert.strictEqual(staged.ok, true);
  const afterStage = await service.inventory();
  const stagedLinked = afterStage.repositories[0].worktrees.find((worktree) => worktree.id === linked.id);
  assert.strictEqual(stagedLinked.totals.staged, 2);

  const preview = await service.commitPreview({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    message: 'test: review worktree',
  });
  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.files.length, 2);
  assert.match(preview.warning, /hooks/);
  const staleCommit = await service.commit({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    message: preview.message,
    fingerprint: 'stale',
  });
  assert.strictEqual(staleCommit.error.code, 'PREVIEW_STALE');
  const committed = await service.commit({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    message: preview.message,
    fingerprint: preview.fingerprint,
  });
  assert.strictEqual(committed.ok, true);

  fs.appendFileSync(path.join(linkedPath, 'tracked.txt'), 'hook rejection\n');
  await service.stage({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    paths: ['tracked.txt'],
  });
  const hooksDir = path.join(repositoryPath, '.git', 'hooks');
  const preCommit = path.join(hooksDir, 'pre-commit');
  fs.writeFileSync(preCommit, '#!/bin/sh\necho hook rejected >&2\nexit 3\n', { mode: 0o755 });
  const hookPreview = await service.commitPreview({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    message: 'test: rejected by hook',
  });
  const hookFailure = await service.commit({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
    message: hookPreview.message,
    fingerprint: hookPreview.fingerprint,
  });
  assert.strictEqual(hookFailure.error.code, 'COMMIT_FAILED');
  assert.match(hookFailure.error.details, /hook rejected/);
  fs.unlinkSync(preCommit);

  const remotePath = path.join(temp, 'remote.git');
  execFileSync('/usr/bin/git', ['init', '--bare', '-q', remotePath]);
  const preReceive = path.join(remotePath, 'hooks', 'pre-receive');
  fs.writeFileSync(preReceive, '#!/bin/sh\necho ruleset rejected >&2\nexit 1\n', { mode: 0o755 });
  execFileSync('/usr/bin/git', ['-C', repositoryPath, 'remote', 'add', 'origin', remotePath]);
  const rejectedPublish = await service.publish({
    repositoryId: observed.repository.id,
    worktreeId: linked.id,
  });
  assert.strictEqual(rejectedPublish.error.code, 'PUBLISH_FAILED');
  assert.match(rejectedPublish.error.details, /ruleset rejected|pre-receive hook declined/);

  const forgotten = service.forget(observed.repository.id);
  assert.strictEqual(forgotten.ok, true);
  assert.strictEqual(service.catalog().repositories.length, 0);
  assert(fs.existsSync(repositoryPath), 'forget must not touch repository files');
  console.log('GIT_WORKTREE_SERVICE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
