'use strict';

const assert = require('assert');
const {
  MAX_OUTPUT_BYTES,
  boundedAppend,
  compareLanes,
  extractTerminalTitles,
  normalizeState,
  parseJsonLines,
  sanitizeReport,
  structuredTransition,
} = require('../activity-lab/core');

const partial = parseJsonLines('', '{"type":"turn.started"}\n{"type":"turn.');
assert.deepStrictEqual(partial.records[0].event, { type: 'turn.started' });
assert.strictEqual(partial.remainder, '{"type":"turn.');
const completed = parseJsonLines(partial.remainder, 'completed"}\nnot-json\n');
assert.strictEqual(completed.records.length, 2);
assert.strictEqual(completed.records[1].ok, false);
assert.strictEqual(structuredTransition(partial.records[0]).state, 'working');
assert.strictEqual(structuredTransition(completed.records[0]).state, 'completed');
assert.strictEqual(structuredTransition({ ok: true, event: { type: 'item.completed' } }).state, null);

const titlesA = extractTerminalTitles('', '\u001b]0;⠋ Working');
assert.strictEqual(titlesA.titles.length, 0);
const titlesB = extractTerminalTitles(titlesA.remainder, '\u0007rest\u001b]2;Codex\u001b\\');
assert.deepStrictEqual(titlesB.titles, ['⠋ Working', 'Codex']);

assert.strictEqual(normalizeState('working'), 'working');
assert.strictEqual(normalizeState('pending'), null);
assert.ok(Buffer.byteLength(boundedAppend('', 'x'.repeat(MAX_OUTPUT_BYTES + 100))) <= MAX_OUTPUT_BYTES);

const comparison = compareLanes([
  { lane: 'reference', state: 'working', at: 100 },
  { lane: 'interactive', state: 'working', at: 120 },
  { lane: 'reference', state: 'completed', at: 200 },
  { lane: 'interactive', state: 'completed', at: 240 },
]);
assert.strictEqual(comparison.missedWorkingMs, 20);
assert.strictEqual(comparison.falseWorkingMs, 40);
assert.strictEqual(comparison.lateStartMs, 20);

const report = sanitizeReport({
  chromuxVersion: 'test',
  codexVersion: 'fake',
  scenarios: [{ id: 'x', name: 'X', turns: 1, outcome: 'completed', prompt: 'secret response' }],
  trace: [{ at: 1, runId: 'x', lane: 'reference', rawType: 'jsonl', state: 'working',
    source: 'structured', confidence: 'ground-truth', processStatus: 'running', detail: 'model output secret' }],
});
assert.ok(!JSON.stringify(report).includes('secret'));
assert.strictEqual(report.safety.responseTextExcluded, true);
console.log('ACTIVITY_LAB_CORE_OK');
