'use strict';

const trace = [];
const scenarioResults = new Map();
const activeRuns = new Map();
let info;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function stateElement(card, lane) {
  return card.querySelector(`[data-lane="${lane}"] .state`);
}

function setState(card, lane, state) {
  if (!state) return;
  const node = stateElement(card, lane);
  node.dataset.state = state;
  node.querySelector('.state-label').textContent = state;
  // Exercise the same reducer contract used by normal Chromux for PTY lifecycle
  // transitions. Lab-only terminal states remain explicit and cannot animate.
  if (lane === 'interactive' && window.chromuxAttention) {
    const turn = { state: 'idle', completionBlocked: false, eventIds: [] };
    if (state === 'working') window.chromuxAttention.applyTurnSignal(turn, 'turn-start', null, Date.now());
    if (state === 'completed') window.chromuxAttention.applyTurnSignal(turn, 'turn-end', null, Date.now());
  }
}

function renderScenarios() {
  const host = document.querySelector('#scenarios');
  host.innerHTML = info.scenarios.map((scenario) => `
    <article class="scenario" data-scenario="${escapeHtml(scenario.id)}">
      <div class="scenario-head">
        <div><h3>${escapeHtml(scenario.name)}</h3><p class="scenario-copy">${escapeHtml(scenario.description)}</p></div>
        <span class="turn-count">${scenario.turns === 0 ? 'No model usage' : `${scenario.turns} turn${scenario.turns === 1 ? '' : 's'} per lane · ${scenario.turns * 2} total`}</span>
      </div>
      <div class="lanes">
        <div class="lane" data-lane="interactive"><span class="lane-label">Interactive PTY</span><span class="state" data-state="idle"><i class="indicator"></i><span class="state-label">idle</span></span></div>
        <div class="lane" data-lane="reference"><span class="lane-label">Structured reference</span><span class="state" data-state="idle"><i class="indicator"></i><span class="state-label">idle</span></span></div>
      </div>
      <div class="scenario-actions"><button class="run">Run</button><span class="result">Explicit run required</span></div>
    </article>`).join('');
  host.querySelectorAll('.scenario').forEach((card) => {
    card.querySelector('.run').addEventListener('click', () => runScenario(card.dataset.scenario));
  });
}

async function runScenario(scenarioId) {
  const scenario = info.scenarios.find((row) => row.id === scenarioId);
  const card = document.querySelector(`[data-scenario="${scenarioId}"]`);
  const button = card.querySelector('.run');
  if (card.classList.contains('running')) {
    for (const runId of activeRuns.get(scenarioId) || []) await window.activityLab.cancel(runId);
    return;
  }
  card.classList.add('running');
  button.textContent = 'Cancel';
  button.classList.add('cancel');
  card.querySelector('.result').textContent = scenario.control ? 'Control active' : 'Collecting signals…';
  setState(card, 'interactive', scenario.control ? 'idle' : 'launching');
  setState(card, 'reference', scenario.control ? 'idle' : 'launching');
  const startedAt = Date.now();
  const ids = Array.from({ length: Math.max(1, scenario.turns) },
    (_, index) => `${scenario.id}-${startedAt}-${index + 1}`);
  activeRuns.set(scenarioId, new Set(ids));
  scenarioResults.set(scenarioId, {
    id: scenario.id, name: scenario.name, turns: scenario.turns, startedAt,
    endedAt: null, outcome: 'running', mismatches: {},
  });
  if (scenario.control) {
    window.setTimeout(() => finishScenario(scenarioId), 500);
    return;
  }
  await Promise.all(ids.map((id) => window.activityLab.run({
    id, prompt: scenario.prompt, fixture: scenario.fixture || {},
  })));
}

function finishScenario(scenarioId) {
  const card = document.querySelector(`[data-scenario="${scenarioId}"]`);
  const result = scenarioResults.get(scenarioId);
  if (!card || !result) return;
  card.classList.remove('running');
  const button = card.querySelector('.run');
  button.textContent = 'Run again';
  button.classList.remove('cancel');
  result.endedAt = Date.now();
  const rows = trace.filter((row) => row.runId.startsWith(`${scenarioId}-`));
  const laneWindows = (lane) => {
    const laneRows = rows.filter((row) => row.lane === lane && row.state);
    return laneRows.map((row, index) => ({
      state: row.state,
      start: row.at,
      end: laneRows[index + 1]?.at || row.at,
    })).filter((row) => row.state === 'working');
  };
  const interactiveWorking = laneWindows('interactive');
  const referenceWorking = laneWindows('reference');
  const duration = (windows) => windows.reduce((sum, row) => sum + Math.max(0, row.end - row.start), 0);
  const overlap = interactiveWorking.reduce((sum, left) => sum + referenceWorking.reduce(
    (inner, right) => inner + Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start)), 0,
  ), 0);
  result.mismatches = {
    falseWorkingMs: Math.max(0, duration(interactiveWorking) - overlap),
    missedWorkingMs: Math.max(0, duration(referenceWorking) - overlap),
    lateStartMs: interactiveWorking[0] && referenceWorking[0]
      ? Math.max(0, interactiveWorking[0].start - referenceWorking[0].start) : null,
    lateCompletionMs: interactiveWorking.at(-1) && referenceWorking.at(-1)
      ? Math.max(0, interactiveWorking.at(-1).end - referenceWorking.at(-1).end) : null,
    staleSpinnerAfterExitOrCancellation: ['interactive', 'reference'].some((lane) => {
      const laneRows = rows.filter((row) => row.lane === lane);
      const exit = laneRows.findLast((row) => row.rawType === 'process-exit');
      return exit && laneRows.some((row) => row.at > exit.at && row.state === 'working');
    }),
    crossSessionSignalLeakage: false,
  };
  result.outcome = rows.some((row) => row.state === 'failed') ? 'failed'
    : (rows.some((row) => row.state === 'cancelled') ? 'cancelled' : 'completed');
  card.querySelector('.result').textContent = result.outcome === 'completed'
    ? 'Evidence captured' : result.outcome;
  document.querySelector('#export').disabled = false;
}

function appendTrace(row) {
  trace.push(row);
  if (trace.length > 2000) trace.shift();
  const body = document.querySelector('#trace');
  body.querySelector('.empty')?.remove();
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${new Date(row.at).toLocaleTimeString()}</td><td>${escapeHtml(row.runId)}</td>
    <td>${escapeHtml(row.lane)}</td><td>${escapeHtml(row.rawType)}</td><td>${escapeHtml(row.state || '—')}</td>
    <td>${escapeHtml(row.source)} / ${escapeHtml(row.confidence)}</td><td>${escapeHtml(row.processStatus)}</td>`;
  body.appendChild(tr);
  tr.scrollIntoView({ block: 'nearest' });
  const scenarioId = info.scenarios.find((scenario) => row.runId.startsWith(`${scenario.id}-`))?.id;
  if (scenarioId) setState(document.querySelector(`[data-scenario="${scenarioId}"]`), row.lane, row.state);
}

window.activityLab.onTrace(appendTrace);
window.activityLab.onFinished(({ id }) => {
  const scenarioId = info.scenarios.find((scenario) => id.startsWith(`${scenario.id}-`))?.id;
  const pending = activeRuns.get(scenarioId);
  if (!pending) return;
  pending.delete(id);
  if (pending.size === 0) finishScenario(scenarioId);
});

document.querySelector('#export').addEventListener('click', async () => {
  await window.activityLab.exportReport({
    chromuxVersion: info.chromuxVersion,
    codexVersion: info.codexVersion,
    scenarios: Array.from(scenarioResults.values()),
    trace,
  });
});

(async () => {
  info = await window.activityLab.info();
  document.querySelector('#versions').textContent = `Chromux ${info.chromuxVersion} · ${info.codexVersion}`;
  renderScenarios();
  if (location.search.includes('smoke=1')) {
    const cards = [...document.querySelectorAll('.scenario')];
    const probe = stateElement(cards[0], 'interactive');
    setState(cards[0], 'interactive', 'working');
    const workingAnimation = getComputedStyle(probe.querySelector('.indicator')).animationName;
    setState(cards[0], 'interactive', 'launching');
    const launchingAnimation = getComputedStyle(probe.querySelector('.indicator')).animationName;
    const result = {
      isolatedProfile: info.isolatedProfile,
      normalChromuxBypassed: info.normalChromuxBypassed,
      explicitRunGate: trace.length === 0 && cards.slice(1).every((card) => card.querySelector('.state').dataset.state === 'idle'),
      scenarioCount: cards.length,
      onlyWorkingAnimates: workingAnimation !== 'none' && launchingAnimation === 'none'
        && [...document.querySelectorAll('.state')].filter((node) => node !== probe).every((node) => (
          getComputedStyle(node.querySelector('.indicator')).animationName === 'none'
        )),
    };
    await window.activityLab.smokeResult(result);
  }
})();
