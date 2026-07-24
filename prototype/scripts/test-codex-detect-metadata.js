'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createCodexDetectMetadata,
  normalizeAgentMessagePreview,
  normalizeDetectLabel,
} = require('../codex-detect-metadata');

const fixturePath = path.join(__dirname, 'fixtures', 'fake-codex-app-server.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-codex-detect-'));

function scenarioFile(name, scenario) {
  const file = path.join(tmpDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(scenario));
  return file;
}

function thread({
  id,
  cwd,
  source = 'cli',
  name = null,
  preview = '',
  recencyAt,
}) {
  return {
    id,
    sessionId: id,
    cwd,
    source,
    name,
    preview,
    recencyAt,
    updatedAt: recencyAt,
    createdAt: recencyAt - 10,
  };
}

function entry(id, type, value = {}) {
  return { turnId: `turn-${id}`, item: { id, type, ...value } };
}

function serviceFor(file, options = {}) {
  return createCodexDetectMetadata({
    resolveExecutable: () => process.execPath,
    appServerArgs: [fixturePath, file],
    timeoutMs: 1000,
    cleanupGraceMs: 100,
    ...options,
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

(async () => {
  const namedCwd = path.join(tmpDir, 'named-project');
  const previewCwd = path.join(tmpDir, 'preview-project');
  const basenameCwd = path.join(tmpDir, 'basename-project');
  const malformedCwd = path.join(tmpDir, 'malformed-project');
  const logPath = path.join(tmpDir, 'requests.jsonl');
  const cleanupPath = path.join(tmpDir, 'cleanup.log');
  const pidPath = path.join(tmpDir, 'server.pid');
  const ids = {
    named: '11111111-1111-4111-8111-111111111111',
    old: '22222222-2222-4222-8222-222222222222',
    vscode: '33333333-3333-4333-8333-333333333333',
    otherCwd: '44444444-4444-4444-8444-444444444444',
    preview: '55555555-5555-4555-8555-555555555555',
    basename: '66666666-6666-4666-8666-666666666666',
    malformed: '77777777-7777-4777-8777-777777777777',
  };
  const normalScenario = scenarioFile('normal', {
    logPath,
    cleanupPath,
    pidPath,
    threadLists: {
      [namedCwd]: [
        thread({ id: ids.old, cwd: namedCwd, name: 'Older', preview: 'old', recencyAt: 100 }),
        thread({ id: ids.vscode, cwd: namedCwd, source: 'vscode', name: 'IDE', preview: 'ide', recencyAt: 500 }),
        thread({ id: ids.otherCwd, cwd: previewCwd, name: 'Wrong cwd', preview: 'wrong', recencyAt: 600 }),
        thread({
          id: ids.named,
          cwd: namedCwd,
          name: '  Release\u0007   readiness \n review  ',
          preview: 'first prompt',
          recencyAt: 300,
        }),
      ],
      [previewCwd]: [
        thread({
          id: ids.preview,
          cwd: previewCwd,
          name: ' \u0000 ',
          preview: `  ${'🧪'.repeat(85)}  `,
          recencyAt: 400,
        }),
      ],
      [basenameCwd]: [
        thread({
          id: ids.basename,
          cwd: basenameCwd,
          name: null,
          preview: '\n\t',
          recencyAt: 200,
        }),
      ],
      [malformedCwd]: [
        thread({
          id: ids.malformed,
          cwd: malformedCwd,
          name: 'Malformed items',
          preview: 'fallback',
          recencyAt: 250,
        }),
      ],
    },
    malformedItemsThreadIds: [ids.malformed],
    items: {
      [ids.named]: [
        entry('reasoning', 'reasoning'),
        entry('blank', 'agentMessage', { text: ' \n\t ' }),
        entry('latest', 'agentMessage', { text: '  Latest \n agent\tanswer 😀  ' }),
        entry('older', 'agentMessage', { text: 'Older answer' }),
      ],
      [ids.preview]: [
        entry('long', 'agentMessage', { text: `${'😀'.repeat(170)}\nignored tail` }),
      ],
      [ids.basename]: [],
    },
  });

  const service = serviceFor(normalScenario);
  const metadata = await service.scan([
    namedCwd,
    namedCwd,
    previewCwd,
    basenameCwd,
    malformedCwd,
  ]);

  assert.strictEqual(metadata.size, 3, 'malformed per-thread metadata should fall back independently');
  assert.deepStrictEqual(metadata.get(namedCwd), {
    id: ids.named,
    ts: 300000,
    name: 'Release readiness review',
    agentMessagePreview: 'Latest agent answer 😀',
  });
  assert.strictEqual(
    Array.from(metadata.get(previewCwd).name).length,
    80,
    'first-user fallback labels should truncate at 80 Unicode code points',
  );
  assert.strictEqual(
    Array.from(metadata.get(previewCwd).agentMessagePreview).length,
    160,
    'agent excerpts should cap at 160 Unicode code points including the ellipsis',
  );
  assert(metadata.get(previewCwd).agentMessagePreview.endsWith('…'), 'truncated excerpts should end in an ellipsis');
  assert.strictEqual(metadata.get(basenameCwd).name, 'basename-project', 'directory basename should be the final label fallback');
  assert.strictEqual(metadata.get(basenameCwd).agentMessagePreview, '', 'threads without agent messages should retain an empty excerpt');

  const requests = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse);
  const initialize = requests.find((row) => row.method === 'initialize');
  assert(initialize, 'adapter should initialize the app-server protocol');
  assert.strictEqual(initialize.params.capabilities.experimentalApi, true, 'adapter should opt into thread/items/list');
  assert(requests.some((row) => row.method === 'initialized'), 'adapter should send the initialized notification');
  const listRequests = requests.filter((row) => row.method === 'thread/list');
  assert.strictEqual(listRequests.length, 4, 'adapter should list once per unique cwd');
  for (const request of listRequests) {
    assert.deepStrictEqual(request.params.sourceKinds, ['cli']);
    assert.strictEqual(request.params.sortKey, 'recency_at');
    assert.strictEqual(request.params.sortDirection, 'desc');
    assert.strictEqual(request.params.useStateDbOnly, true, 'DETECT should not ask app-server to repair session state');
    assert.strictEqual(typeof request.params.cwd, 'string');
  }
  const itemRequests = requests.filter((row) => row.method === 'thread/items/list');
  assert(itemRequests.every((row) => row.params.sortDirection === 'desc'), 'thread items should be requested newest-first');

  assert(await waitFor(() => fs.existsSync(cleanupPath)), 'normal scan should close the app-server stdin');
  const pid = Number(fs.readFileSync(pidPath, 'utf8'));
  assert(await waitFor(() => !alive(pid)), 'normal scan should reap the app-server child');

  assert.strictEqual(normalizeDetectLabel(' a\u0000 \n b ', 'fallback'), 'a b');
  assert.strictEqual(Array.from(normalizeDetectLabel('🧪'.repeat(81), 'fallback')).length, 80);
  assert.strictEqual(normalizeAgentMessagePreview(' short \n answer '), 'short answer');
  assert.strictEqual(
    normalizeAgentMessagePreview('x'.repeat(161)),
    `${'x'.repeat(159)}…`,
    'only truncated excerpts should receive an ellipsis',
  );
  assert.strictEqual(normalizeAgentMessagePreview('x'.repeat(159)).endsWith('…'), false);

  for (const [name, behavior] of [
    ['malformed', 'malformed-thread-list'],
    ['malformed-json', 'malformed-json'],
    ['wrong-response-id', 'wrong-response-id'],
    ['oversized-output', 'oversized-output'],
    ['items-unsupported', 'items-unsupported'],
    ['early-exit', 'early-exit'],
    ['timeout', 'timeout'],
  ]) {
    const isolatedCleanup = path.join(tmpDir, `${name}-cleanup.log`);
    const isolatedPid = path.join(tmpDir, `${name}.pid`);
    const file = scenarioFile(name, {
      behavior,
      cleanupPath: isolatedCleanup,
      pidPath: isolatedPid,
      outputBytes: behavior === 'oversized-output' ? 4096 : undefined,
      threadLists: {
        [namedCwd]: behavior === 'items-unsupported'
          ? [thread({
            id: ids.named,
            cwd: namedCwd,
            name: 'Unsupported items',
            preview: 'fallback',
            recencyAt: 300,
          })]
          : [],
      },
    });
    const startedAt = Date.now();
    const result = await serviceFor(file, {
      timeoutMs: behavior === 'timeout' ? 80 : 500,
      ...(behavior === 'oversized-output' ? { maxOutputBytes: 1024, maxLineBytes: 512 } : {}),
    }).scan([namedCwd]);
    assert.strictEqual(result.size, 0, `${name} should return an empty enrichment map`);
    assert(Date.now() - startedAt < 900, `${name} should remain bounded`);
    const isolatedProcess = Number(fs.readFileSync(isolatedPid, 'utf8'));
    assert(await waitFor(() => !alive(isolatedProcess)), `${name} should clean up its app-server child`);
  }

  const unavailable = createCodexDetectMetadata({ resolveExecutable: () => null });
  assert.strictEqual((await unavailable.scan([namedCwd])).size, 0, 'missing Codex should preserve rollout fallback');

  console.log('CODEX_DETECT_METADATA_OK');
})().catch((error) => {
  console.error('CODEX_DETECT_METADATA_FAIL');
  console.error(error);
  process.exit(1);
});
