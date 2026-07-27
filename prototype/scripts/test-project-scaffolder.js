'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_CATEGORIES,
  createHostAdapter,
  createProject,
  createWslAdapter,
  deriveCloneName,
  destinationFor,
  loadScaffolderConfig,
  parseCategories,
  previewProject,
  updateHistory,
  validateProjectName,
} = require('../project-scaffolder');

async function main() {
  const parsed = parseCategories([
    '# comment',
    'kits|flat|Reusable kits',
    'apps|lifecycle|Applications',
    'play|sandbox|Experiments',
    'sandbox_type:ios',
    'ignore:archive',
    'dev_tool:codex',
    '../escape|flat|bad',
    'broken',
  ].join('\n'), '/config');
  assert.deepStrictEqual(parsed.categories.map(({ name, type }) => [name, type]), [
    ['kits', 'flat'], ['apps', 'lifecycle'], ['play', 'sandbox'],
  ]);
  assert.deepStrictEqual(parsed.sandboxTypes, ['ios']);
  assert.strictEqual(parsed.warnings.length, 2);
  assert.strictEqual(parseCategories('').categories.length, DEFAULT_CATEGORIES.length);

  assert.strictEqual(deriveCloneName('git@github.com:Acme/My_repo.git'), 'my-repo');
  assert.strictEqual(deriveCloneName('https://example.com/Some.Project///'), 'some-project');
  assert.strictEqual(validateProjectName('my-project-2'), 'my-project-2');
  for (const invalid of ['', '-bad', 'bad-', 'Bad', '../bad', 'bad_name']) {
    assert.throws(() => validateProjectName(invalid), /lowercase/);
  }

  const categories = [
    { name: 'kits', type: 'flat', description: '' },
    { name: 'apps', type: 'lifecycle', description: '' },
    { name: 'play', type: 'sandbox', description: '' },
  ];
  assert.strictEqual(destinationFor({
    root: '/projects', name: 'one', category: 'kits', categories, sandboxTypes: ['ios'], pathApi: path.posix,
  }).target, '/projects/kits/one');
  assert.strictEqual(destinationFor({
    root: '/projects', name: 'one', category: 'apps', categories, sandboxTypes: ['ios'], pathApi: path.posix,
  }).target, '/projects/apps/dev/one');
  assert.strictEqual(destinationFor({
    root: '/projects', name: 'one', category: 'play', sandboxType: 'ios', categories, sandboxTypes: ['ios'], pathApi: path.posix,
  }).target, '/projects/sandbox/ios/one');
  assert.throws(() => destinationFor({
    root: '/projects', name: '../one', category: 'kits', categories, pathApi: path.posix,
  }), /lowercase/);
  assert.throws(() => destinationFor({
    root: 'relative', name: 'one', category: 'kits', categories, pathApi: path.posix,
  }), /absolute/);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-scaffolder-'));
  const home = path.join(temporary, 'home');
  const root = path.join(home, 'code');
  const cache = path.join(home, 'cache');
  fs.mkdirSync(path.join(home, '.config', 'p'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'p', 'categories.conf'), 'apps|lifecycle|Apps\nsandbox_type:web\n');
  const gitCalls = [];
  const hookCalls = [];
  const adapter = createHostAdapter({
    home,
    env: { P_BASE: root, XDG_CACHE_HOME: cache, P_NP_HOOK: path.join(home, 'hook') },
    run: async (file, args) => {
      if (file === 'git') {
        gitCalls.push(args);
        if (args[0] === 'clone') {
          fs.mkdirSync(args[3], { recursive: true });
          fs.mkdirSync(path.join(args[3], '.git'));
        } else {
          fs.mkdirSync(path.join(args[1], '.git'));
        }
        return { stdout: '', stderr: '' };
      }
      hookCalls.push([file, ...args]);
      return { stdout: '', stderr: '' };
    },
  });
  const originalExecutable = adapter.isExecutable;
  adapter.isExecutable = async () => true;
  const config = await loadScaffolderConfig({ adapter });
  assert.strictEqual(config.root, root, 'P_BASE should seed the host root');
  assert.strictEqual(config.categories[0].name, 'apps');

  const fresh = await createProject({
    adapter,
    config,
    request: { source: 'fresh', name: 'hello-app', category: 'apps' },
    randomBytes: () => Buffer.from('0011223344556677', 'hex'),
  });
  assert.strictEqual(fresh.target, path.join(root, 'apps', 'dev', 'hello-app'));
  assert(fs.existsSync(path.join(fresh.target, '.git')));
  assert.deepStrictEqual(gitCalls[0].slice(0, 3), ['-C', `${fresh.target.replace(/hello-app$/, '')}.chromux-hello-app-0011223344556677.staging`, 'init']);
  assert.deepStrictEqual(hookCalls[0], [path.join(home, 'hook'), 'hello-app', 'apps', 'lifecycle', fresh.target]);

  const clone = await createProject({
    adapter,
    config,
    request: { source: 'clone', cloneUrl: '--upload-pack=evil', name: 'safe-clone', category: 'apps' },
  });
  assert.deepStrictEqual(gitCalls[1].slice(0, 3), ['clone', '--', '--upload-pack=evil'], 'clone URL must follow --');
  assert(fs.existsSync(clone.target));
  await assert.rejects(createProject({
    adapter, config, request: { source: 'fresh', name: 'hello-app', category: 'apps' },
  }), /already exists/);

  const historyPath = path.join(cache, 'p', 'p_history');
  fs.writeFileSync(historyPath, `${Array.from({ length: 55 }, (_, i) => `/old/${i}`).join('\n')}\n${fresh.target}\n`);
  await updateHistory(adapter, fresh.target);
  const history = fs.readFileSync(historyPath, 'utf8').trim().split('\n');
  assert.strictEqual(history.length, 50);
  assert.strictEqual(history.at(-1), fresh.target);
  assert.strictEqual(history.filter((row) => row === fresh.target).length, 1);
  fs.writeFileSync(path.join(cache, 'p', 'p_completion'), 'old');
  fs.writeFileSync(path.join(cache, 'p', 'sp_completion'), 'old');
  await createProject({
    adapter, config, request: { source: 'fresh', name: 'cache-test', category: 'apps' },
  });
  assert(!fs.existsSync(path.join(cache, 'p', 'p_completion')));
  assert(!fs.existsSync(path.join(cache, 'p', 'sp_completion')));

  const symlinkRoot = path.join(home, 'symlink-root');
  const outsideRoot = path.join(home, 'outside-root');
  fs.mkdirSync(symlinkRoot, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(symlinkRoot, 'kits'));
  await assert.rejects(createProject({
    adapter,
    config: {
      ...config,
      root: symlinkRoot,
      categories: [{ name: 'kits', type: 'flat', description: '' }],
    },
    request: { source: 'fresh', name: 'escaped-project', category: 'kits' },
  }), /inside Projects Root/);
  assert(!fs.existsSync(path.join(outsideRoot, 'escaped-project')));

  adapter.runGit = async () => {
    const staging = path.join(root, 'apps', 'dev', '.chromux-broken-aaaaaaaaaaaaaaaa.staging');
    fs.mkdirSync(staging, { recursive: true });
    throw new Error('clone exploded');
  };
  await assert.rejects(createProject({
    adapter,
    config,
    request: { source: 'clone', cloneUrl: 'https://example.com/broken.git', name: 'broken', category: 'apps' },
    randomBytes: () => Buffer.from('aaaaaaaaaaaaaaaa', 'hex'),
  }), /clone exploded/);
  assert(!fs.existsSync(path.join(root, 'apps', 'dev', '.chromux-broken-aaaaaaaaaaaaaaaa.staging')));

  adapter.runGit = async (args) => {
    const staging = args[1];
    fs.mkdirSync(path.join(staging, '.git'), { recursive: true });
  };
  adapter.runExecutable = async () => { throw new Error('hook exploded'); };
  const warned = await createProject({
    adapter, config, request: { source: 'fresh', name: 'hook-warning', category: 'apps' },
  });
  assert.strictEqual(warned.warnings.length, 1);
  assert(/hook/i.test(warned.warnings[0]));
  adapter.isExecutable = originalExecutable;

  const wslCalls = [];
  const wslFiles = new Map([['/home/dev/.config/p/categories.conf', 'tools|lifecycle|Tools\n']]);
  const wslRuntime = {
    async run(distro, args) {
      wslCalls.push({ distro, args });
      if (args[0] === 'cat') {
        if (!wslFiles.has(args[2])) throw new Error('missing');
        return { stdout: wslFiles.get(args[2]), stderr: '' };
      }
      if (args[0] === 'test') throw new Error('missing');
      return { stdout: '', stderr: '' };
    },
  };
  const wsl = createWslAdapter({
    runtime: wslRuntime,
    distro: 'Ubuntu',
    home: '/home/dev',
    env: { P_BASE: '/work/projects' },
  });
  const wslConfig = await loadScaffolderConfig({ adapter: wsl });
  assert.strictEqual(wslConfig.root, '/work/projects');
  const wslPreview = await previewProject({
    adapter: wsl,
    config: wslConfig,
    request: { source: 'clone', cloneUrl: 'git@example.com:Org/Repo_Name.git', category: 'tools' },
  });
  assert.strictEqual(wslPreview.name, 'repo-name');
  assert.strictEqual(wslPreview.target, '/work/projects/tools/dev/repo-name');
  assert(wslCalls.every((call) => call.distro === 'Ubuntu'));

  const wslDirs = new Set(['/home/dev', '/work/projects']);
  const wslCreateCalls = [];
  const creatingRuntime = {
    async run(distro, args) {
      wslCreateCalls.push({ distro, args });
      if (args[0] === 'cat') {
        if (args[2] === '/home/dev/.config/p/categories.conf') {
          return { stdout: 'tools|lifecycle|Tools\n', stderr: '' };
        }
        throw new Error('missing');
      }
      if (args[0] === 'test') {
        if (wslDirs.has(args[2])) return { stdout: '', stderr: '' };
        throw new Error('missing');
      }
      if (args[0] === 'mkdir') {
        wslDirs.add(args.at(-1));
        return { stdout: '', stderr: '' };
      }
      if (args[0] === 'readlink') return { stdout: `${args.at(-1)}\n`, stderr: '' };
      if (args[0] === 'git') {
        assert.deepStrictEqual(args.slice(0, 3), ['git', '-C', args[2]]);
        assert.strictEqual(args[3], 'init');
        return { stdout: '', stderr: '' };
      }
      if (args[0] === 'bash' && args[2].includes('mv -T -n')) {
        wslDirs.delete(args[4]);
        wslDirs.add(args[5]);
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  };
  const creatingWsl = createWslAdapter({
    runtime: creatingRuntime,
    distro: 'Ubuntu',
    home: '/home/dev',
    env: { P_BASE: '/work/projects' },
  });
  const creatingConfig = await loadScaffolderConfig({ adapter: creatingWsl });
  const createdWsl = await createProject({
    adapter: creatingWsl,
    config: creatingConfig,
    request: { source: 'fresh', name: 'wsl-project', category: 'tools' },
    randomBytes: () => Buffer.from('bbbbbbbbbbbbbbbb', 'hex'),
  });
  assert.strictEqual(createdWsl.runtime, 'wsl');
  assert.strictEqual(createdWsl.distro, 'Ubuntu');
  assert.strictEqual(createdWsl.target, '/work/projects/tools/dev/wsl-project');
  assert(wslCreateCalls.some((call) => call.args[0] === 'git' && call.args.at(-1) === 'init'));
  assert(wslCreateCalls.every((call) => call.distro === 'Ubuntu'));

  console.log('PROJECT_SCAFFOLDER_OK');
}

main().catch((error) => {
  console.error('PROJECT_SCAFFOLDER_FAIL', error);
  process.exit(1);
});
