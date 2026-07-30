'use strict';

const assert = require('assert');
const { SCENARIOS, createFixture } = require('../sidebar-lab/fixtures');
const { VARIANTS, buildLayout } = require('../sidebar-lab/variants');
const {
  aggregateTrials, applyTransition, countRelocations, median, sanitizeReport,
  scoreTrial, seededOrder, validateFixture,
} = require('../sidebar-lab/core');

const fixture = createFixture();
assert.strictEqual(validateFixture(fixture), true);
assert.strictEqual(fixture.projects.length, 4);
assert.strictEqual(fixture.sessions.length, 18);
assert.strictEqual(SCENARIOS.length, 6);
assert.strictEqual(VARIANTS.length, 10);
assert.throws(() => validateFixture({ projects: [], sessions: [{ id: 'x', projectId: 'missing' }] }), /Unknown project/);

for (const variant of VARIANTS) {
  const layout = buildLayout(variant.id, fixture, { includeHistory: true });
  const ids = layout.groups.flatMap((group) => group.sessions.map((row) => row.id));
  assert.deepStrictEqual([...ids].sort(), fixture.sessions.map((row) => row.id).sort(), `${variant.id} must place every session once`);
  assert.strictEqual(new Set(ids).size, ids.length, `${variant.id} must not duplicate sessions`);
}

const transitioned = applyTransition(fixture, { id: 'atlas-nav', status: 'ready', unread: true });
assert.strictEqual(fixture.sessions.find((row) => row.id === 'atlas-nav').status, 'idle');
assert.strictEqual(transitioned.sessions.find((row) => row.id === 'atlas-nav').status, 'ready');
assert.ok(countRelocations('current', fixture, transitioned) > 0);
assert.strictEqual(countRelocations('focus', fixture, transitioned), 0);

const orderA = seededOrder('participant-7').map((row) => row.id);
const orderB = seededOrder('participant-7').map((row) => row.id);
assert.deepStrictEqual(orderA, orderB);
assert.strictEqual(new Set(orderA).size, 10);
assert.notDeepStrictEqual(orderA, seededOrder('participant-8').map((row) => row.id));

assert.strictEqual(median([8, 2, 4]), 4);
assert.strictEqual(median([2, 4]), 3);
const strong = scoreTrial({
  completed: true, durationMs: 1000, incorrectOpens: 0, clicks: 1, keystrokes: 0,
  ratings: { orientation: 5, attentionClarity: 5, switchingEffort: 5 },
}, [1000, 2000]);
const weak = scoreTrial({
  completed: false, durationMs: 5000, incorrectOpens: 4, clicks: 12, keystrokes: 9,
  ratings: { orientation: 1, attentionClarity: 1, switchingEffort: 1 },
}, [1000, 2000]);
assert.ok(strong > weak);

const rawTrial = {
  variantId: 'focus', scenarioId: 'approval-blocker', durationMs: 1000, completed: true,
  incorrectOpens: 0, clicks: 1, keystrokes: 0, scrollDistance: 0, sessionSwitches: 0,
  rowRelocations: 0, ratings: { orientation: 5, attentionClarity: 5, switchingEffort: 4 },
  cwd: '/Users/private/repository', prompt: 'secret prompt', output: 'terminal secret',
};
const report = sanitizeReport({
  variantOrder: ['focus', 'current', 'bogus'],
  trials: [rawTrial, { ...rawTrial, variantId: 'bogus' }],
  userData: 'private',
});
const serialized = JSON.stringify(report);
assert.strictEqual(report.schemaVersion, 1);
assert.strictEqual(report.trials.length, 1);
assert.ok(!serialized.includes('/Users/'));
assert.ok(!serialized.includes('secret'));
assert.deepStrictEqual(report.variantOrder, ['focus', 'current']);
assert.ok(report.recommendation.candidate.includes('Focus Split'));
assert.strictEqual(aggregateTrials([rawTrial]).find((row) => row.variantId === 'focus').trials, 1);
console.log('SIDEBAR_LAB_CORE_OK');
