'use strict';

const { SCENARIOS, createFixture } = require('./fixtures');
const { VARIANTS, buildLayout } = require('./variants');

const METRIC_KEYS = Object.freeze([
  'durationMs', 'completed', 'incorrectOpens', 'clicks', 'keystrokes',
  'scrollDistance', 'sessionSwitches', 'rowRelocations',
]);

function validateFixture(fixture) {
  if (!fixture || !Array.isArray(fixture.projects) || !Array.isArray(fixture.sessions)) {
    throw new Error('Fixture requires projects and sessions.');
  }
  const projectIds = new Set(fixture.projects.map((row) => row.id));
  const ids = new Set();
  for (const session of fixture.sessions) {
    if (!session.id || ids.has(session.id)) throw new Error(`Invalid or duplicate session id: ${session.id}`);
    if (!projectIds.has(session.projectId)) throw new Error(`Unknown project for ${session.id}`);
    if (!/^fixture:\/\//.test(session.worktree)) throw new Error(`Unsafe fixture worktree for ${session.id}`);
    ids.add(session.id);
  }
  return true;
}

function applyTransition(fixture, transition) {
  const next = {
    ...fixture,
    projects: fixture.projects.map((row) => ({ ...row })),
    sessions: fixture.sessions.map((row) => ({ ...row })),
  };
  const session = next.sessions.find((row) => row.id === transition.id);
  if (!session) throw new Error(`Unknown transition session: ${transition.id}`);
  Object.assign(session, Object.fromEntries(Object.entries(transition).filter(([key]) => key !== 'id')));
  return next;
}

function placementMap(variantId, fixture, options) {
  const layout = buildLayout(variantId, fixture, options);
  return new Map(layout.groups.flatMap((group, groupIndex) => (
    group.sessions.map((session, rowIndex) => [session.id, `${groupIndex}:${rowIndex}`])
  )));
}

function countRelocations(variantId, before, after, options) {
  const left = placementMap(variantId, before, options);
  const right = placementMap(variantId, after, options);
  let count = 0;
  for (const [id, placement] of left) {
    if (right.has(id) && right.get(id) !== placement) count += 1;
  }
  return count;
}

function seededOrder(seed, items = VARIANTS) {
  let value = [...String(seed || 'sidebar-lab')].reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const swap = value % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function flowRating(ratings = {}) {
  const values = ['orientation', 'attentionClarity', 'switchingEffort']
    .map((key) => Number(ratings[key]))
    .filter((value) => value >= 1 && value <= 5);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length / 5 : 0;
}

function scoreTrial(trial, taskDurations = []) {
  const successful = trial.completed ? 1 : 0;
  const validDurations = taskDurations.filter((value) => Number.isFinite(value) && value > 0);
  const fastest = validDurations.length ? Math.min(...validDurations) : Math.max(1, trial.durationMs || 1);
  const speed = trial.completed ? Math.min(1, fastest / Math.max(fastest, trial.durationMs || fastest)) : 0;
  const errorAvoidance = 1 / (1 + Math.max(0, trial.incorrectOpens || 0));
  const interactions = Math.max(0, (trial.clicks || 0) + (trial.keystrokes || 0));
  const efficiency = 1 / (1 + interactions / 12);
  return Number((100 * (
    0.4 * successful
    + 0.25 * speed
    + 0.15 * errorAvoidance
    + 0.1 * efficiency
    + 0.1 * flowRating(trial.ratings)
  )).toFixed(2));
}

function median(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function aggregateTrials(trials) {
  const durationsByTask = new Map();
  for (const trial of trials) {
    if (!trial.completed) continue;
    const rows = durationsByTask.get(trial.scenarioId) || [];
    rows.push(trial.durationMs);
    durationsByTask.set(trial.scenarioId, rows);
  }
  const scored = trials.map((trial) => ({
    ...trial,
    score: scoreTrial(trial, durationsByTask.get(trial.scenarioId) || []),
  }));
  return VARIANTS.map((variant) => {
    const rows = scored.filter((trial) => trial.variantId === variant.id);
    return {
      variantId: variant.id,
      trials: rows.length,
      completionRate: rows.length ? rows.filter((row) => row.completed).length / rows.length : 0,
      medianDurationMs: median(rows.filter((row) => row.completed).map((row) => row.durationMs)),
      medianScore: median(rows.map((row) => row.score)),
      medianSpatialChurn: median(rows.map((row) => row.rowRelocations || 0)),
      byTask: SCENARIOS.map((scenario) => {
        const taskRows = rows.filter((row) => row.scenarioId === scenario.id);
        return {
          scenarioId: scenario.id,
          medianScore: median(taskRows.map((row) => row.score)),
          medianDurationMs: median(taskRows.filter((row) => row.completed).map((row) => row.durationMs)),
          medianSpatialChurn: median(taskRows.map((row) => row.rowRelocations || 0)),
        };
      }),
    };
  });
}

function recommend(aggregates) {
  const populated = aggregates.filter((row) => row.trials);
  if (!populated.length) {
    return {
      summary: 'Collect study trials before selecting a production direction.',
      patterns: ['Stable project/session placement', 'Separate attention lens', 'Contextual two-session switching'],
      candidate: 'Persistent project navigation with an attention lens and contextual focus strip.',
    };
  }
  const taskWinners = SCENARIOS.map((scenario) => {
    const winner = populated.map((variant) => ({
      variantId: variant.variantId,
      score: variant.byTask.find((row) => row.scenarioId === scenario.id)?.medianScore,
    })).filter((row) => row.score !== null).sort((a, b) => b.score - a.score)[0];
    return { scenarioId: scenario.id, variantId: winner?.variantId || null };
  });
  const stable = [...populated].sort((a, b) => (
    a.medianSpatialChurn - b.medianSpatialChurn || b.medianScore - a.medianScore
  ))[0];
  return {
    summary: 'Synthesize task-level winners; do not promote the aggregate leader automatically.',
    taskWinners,
    patterns: ['Stable project/session placement', 'A separate actionable attention lens', 'Pinned and contextual switching shortcuts'],
    spatialStabilityLeader: stable?.variantId || null,
    candidate: 'Focus Split with stable project groups, a collapsible triage lens, searchable history, and explicit split-open.',
  };
}

function sanitizeReport(input = {}) {
  const allowedVariants = new Set(VARIANTS.map((row) => row.id));
  const allowedScenarios = new Set(SCENARIOS.map((row) => row.id));
  const trials = (input.trials || []).filter((trial) => (
    allowedVariants.has(trial.variantId) && allowedScenarios.has(trial.scenarioId)
  )).map((trial) => ({
    variantId: trial.variantId,
    scenarioId: trial.scenarioId,
    ...Object.fromEntries(METRIC_KEYS.map((key) => [key, key === 'completed'
      ? Boolean(trial[key]) : Math.max(0, Number(trial[key]) || 0)])),
    ratings: Object.fromEntries(['orientation', 'attentionClarity', 'switchingEffort'].map(
      (key) => [key, Math.min(5, Math.max(1, Number(trial.ratings?.[key]) || 1))],
    )),
  }));
  const aggregates = aggregateTrials(trials);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureId: 'contextual-sidebar-v1',
    scenarioIds: SCENARIOS.map((row) => row.id),
    variantOrder: (input.variantOrder || []).filter((id) => allowedVariants.has(id)),
    trials,
    aggregates,
    recommendation: recommend(aggregates),
    sources: VARIANTS.map(({ id, source, hypothesis }) => ({ variantId: id, source, hypothesis })),
    safety: {
      syntheticDataOnly: true,
      realPathsExcluded: true,
      promptsExcluded: true,
      terminalOutputExcluded: true,
      userSessionsExcluded: true,
    },
  };
}

validateFixture(createFixture());

module.exports = {
  METRIC_KEYS,
  aggregateTrials,
  applyTransition,
  countRelocations,
  median,
  recommend,
  sanitizeReport,
  scoreTrial,
  seededOrder,
  validateFixture,
};
