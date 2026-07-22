'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MAX_DRAFT_BYTES,
  MAX_ENTRIES_PER_PROJECT,
  MAX_FILE_BYTES,
  createPromptHistoryStore,
  normalizePayload,
} = require('../prompt-history');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-prompt-history-'));
const chromuxDir = path.join(root, '.chromux');
const filePath = path.join(chromuxDir, 'prompt-history.json');
const cwd = path.join(root, 'project');
fs.mkdirSync(cwd, { recursive: true });
const store = createPromptHistoryStore({ filePath });

const entry = (text, index = 0) => ({
  id: `entry_${String(index).padStart(8, '0')}`,
  text,
  submittedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  agent: 'codex',
  sessionName: 'primary',
});

assert.deepStrictEqual(store.readProject(cwd), [], 'absent file should read as empty history');
fs.mkdirSync(chromuxDir, { recursive: true });
fs.writeFileSync(filePath, '{ malformed');
assert.deepStrictEqual(store.readProject(cwd), [], 'malformed JSON should be rejected');
fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 999, projects: [] }));
assert.deepStrictEqual(store.readProject(cwd), [], 'unsupported schema should be rejected');
assert.deepStrictEqual(normalizePayload({ schemaVersion: 1, projects: [{ cwd, updatedAt: 'bad', entries: [] }] }).projects, [],
  'out-of-bounds project records should be rejected');
assert.deepStrictEqual(normalizePayload({ schemaVersion: 1, projects: [{ cwd, updatedAt: '2999-01-01T00:00:00.000Z', entries: [] }] }).projects, [],
  'implausibly future records should be rejected');

const exactLimit = 'x'.repeat(MAX_DRAFT_BYTES);
store.append(cwd, { text: exactLimit, agent: 'codex', sessionName: 'primary' });
assert.strictEqual(store.readProject(cwd)[0].text.length, MAX_DRAFT_BYTES, '64 KiB prompt should be accepted');
assert.throws(() => store.append(cwd, { text: exactLimit + 'x', agent: 'codex', sessionName: 'primary' }), /invalid entry/,
  'oversized prompt should be rejected without including its content in the error');

store.clear(cwd);
for (let index = 0; index < MAX_ENTRIES_PER_PROJECT + 8; index += 1) {
  store.append(cwd, { text: `prompt-${index}`, agent: 'codex', sessionName: 'primary', submittedAt: entry('', index).submittedAt });
}
let rows = store.readProject(cwd);
assert.strictEqual(rows.length, MAX_ENTRIES_PER_PROJECT, 'project history should retain at most 100 entries');
assert.strictEqual(rows[0].text, `prompt-${MAX_ENTRIES_PER_PROJECT + 7}`, 'history should be newest first');

store.append(cwd, { text: rows[4].text, agent: 'codex', sessionName: 'secondary' });
rows = store.readProject(cwd);
assert.strictEqual(rows.length, MAX_ENTRIES_PER_PROJECT, 'deduplication should not add a second copy');
assert.strictEqual(rows[0].text, `prompt-${MAX_ENTRIES_PER_PROJECT + 3}`, 'duplicate should move to the front');
assert.strictEqual(rows[0].sessionName, 'secondary', 'deduplication should retain latest submission metadata');

const deletedId = rows[0].id;
store.remove(cwd, deletedId);
assert(!store.readProject(cwd).some((item) => item.id === deletedId), 'individual deletion should persist');
store.clear(cwd);
assert.deepStrictEqual(store.readProject(cwd), [], 'project clearing should persist');

store.append(cwd, { text: 'atomic-one', agent: 'shell', sessionName: 'shell' });
const firstInode = fs.statSync(filePath).ino;
store.append(cwd, { text: 'atomic-two', agent: 'shell', sessionName: 'shell' });
const stat = fs.statSync(filePath);
assert.strictEqual(stat.mode & 0o777, 0o600, 'history file must be user-readable and user-writable only');
assert.notStrictEqual(stat.ino, firstInode, 'mutation should atomically replace the destination file');
assert(!fs.readdirSync(chromuxDir).some((name) => name.endsWith('.tmp')), 'atomic write should not leave temporary files');

const bulkRoot = path.join(root, 'bulk');
fs.mkdirSync(bulkRoot);
const projects = [];
for (let index = 0; index < 100; index += 1) {
  const projectCwd = path.join(bulkRoot, String(index));
  fs.mkdirSync(projectCwd);
  const candidate = {
    cwd: projectCwd,
    updatedAt: entry('', index).submittedAt,
    entries: [entry(`${String(index).padStart(3, '0')}-${'z'.repeat(63 * 1024)}`, index)],
  };
  const next = { schemaVersion: 1, projects: [...projects, candidate] };
  if (Buffer.byteLength(JSON.stringify(next)) >= MAX_FILE_BYTES - 5000) break;
  projects.push(candidate);
}
const fillerCwd = path.join(bulkRoot, 'filler');
fs.mkdirSync(fillerCwd);
const beforeFillerBytes = Buffer.byteLength(JSON.stringify({ schemaVersion: 1, projects }));
const fillerSize = Math.min(MAX_DRAFT_BYTES - 200, Math.max(1000, MAX_FILE_BYTES - beforeFillerBytes - 3000));
projects.push({ cwd: fillerCwd, updatedAt: entry('', 200).submittedAt, entries: [entry(`f-${'f'.repeat(fillerSize)}`, 200)] });
fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 1, projects }));
assert(fs.statSync(filePath).size < MAX_FILE_BYTES, 'global eviction fixture must begin below the cap');
const newestCwd = path.join(bulkRoot, 'newest');
fs.mkdirSync(newestCwd);
store.append(newestCwd, { text: `new-${'n'.repeat(63 * 1024)}`, agent: 'codex', sessionName: 'latest' });
assert(fs.statSync(filePath).size <= MAX_FILE_BYTES, 'atomic mutation must evict globally oldest entries to fit the cap');
const fitted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
assert(fitted.projects.some((project) => project.cwd === fs.realpathSync(newestCwd)), 'newest entry should survive global eviction');
assert(!fitted.projects.some((project) => project.cwd === fs.realpathSync(projects[0].cwd)), 'globally oldest entry should be evicted first');

fs.writeFileSync(filePath, Buffer.alloc(MAX_FILE_BYTES + 1));
assert.deepStrictEqual(store.readProject(cwd), [], 'oversized files should be rejected before parsing');

console.log('PROMPT_HISTORY_OK');
