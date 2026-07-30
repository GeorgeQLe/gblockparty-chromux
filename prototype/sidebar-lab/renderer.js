'use strict';

const state = {
  config: null, fixture: null, mode: 'gallery', query: '', status: 'all', project: 'all',
  includeHistory: false, variantOrder: [], variantIndex: 0, scenarioIndex: 0,
  trial: null, trials: [], selectedSessionId: null,
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const projectName = (id) => state.fixture.projects.find((row) => row.id === id)?.name || id;
const layoutFor = (id) => window.sidebarLabModel.buildLayout(id, state.fixture, {
  query: state.query, status: state.status, project: state.project, includeHistory: state.includeHistory,
});

function sessionRow(session) {
  return `<button class="session-row" data-session-id="${escapeHtml(session.id)}" data-status="${escapeHtml(session.status)}"
    aria-label="Open ${escapeHtml(session.title)}"><i class="status-dot"></i><span class="row-copy">
    <span class="row-title">${session.pinned ? '<span class="pin">★</span> ' : ''}${escapeHtml(session.title)}</span>
    <span class="row-meta">${escapeHtml(session.agent)} · ${escapeHtml(projectName(session.projectId))} · ${escapeHtml(session.branch)}</span>
    </span><span class="row-time">${session.activityMinutes}m</span></button>`;
}

function conceptMarkup(variant, index, fullSize = false) {
  const layout = layoutFor(variant.id);
  const secondaryLabel = {
    linear: 'Triage lens', claude: 'Split open', agmux: 'Attention dashboard', focus: 'Context now',
  }[variant.id] || 'Context';
  return `<article class="concept concept-${variant.id}${fullSize ? ' full-size' : ''}" data-variant-id="${variant.id}">
    <div class="concept-head"><span class="concept-number">${String(index + 1).padStart(2, '0')} · ${escapeHtml(variant.source)}</span>
    <h2>${escapeHtml(variant.name)}</h2><span class="concept-source">${escapeHtml(variant.hypothesis)}</span></div>
    <div class="concept-body" tabindex="0">
    ${layout.secondary.length ? `<div class="secondary-strip"><strong>${secondaryLabel}</strong>${layout.secondary.map(
    (row) => `<button class="secondary-link" data-session-ref="${escapeHtml(row.id)}">↳ ${escapeHtml(row.title)} · ${escapeHtml(row.status)}</button>`,
  ).join('')}</div>` : ''}
    ${layout.groups.map((group) => `<section class="session-group${group.compact ? ' compact' : ''}" data-group="${escapeHtml(group.key)}">
    <h3 class="group-head"><span>${escapeHtml(group.label)}</span><span>${group.sessions.length}</span></h3>
    ${group.sessions.map(sessionRow).join('')}</section>`).join('') || '<p class="empty">No matching sessions.</p>'}</div></article>`;
}

function bindConcepts(host) {
  host.querySelectorAll('.session-row').forEach((button) => button.addEventListener('click', () => openSession(button.dataset.sessionId)));
  host.querySelectorAll('.secondary-link').forEach((button) => button.addEventListener('click', () => {
    const target = host.querySelector(`[data-session-id="${CSS.escape(button.dataset.sessionRef)}"]`);
    target?.scrollIntoView({ block: 'center' }); target?.focus();
  }));
  host.querySelectorAll('.concept-body').forEach((body) => body.addEventListener('scroll', () => {
    const previous = Number(body.dataset.lastScroll || 0);
    if (state.trial) state.trial.scrollDistance += Math.abs(body.scrollTop - previous);
    body.dataset.lastScroll = body.scrollTop;
  }));
}
function renderGallery() {
  const host = document.querySelector('#gallery');
  host.innerHTML = state.config.variants.map((variant, index) => conceptMarkup(variant, index)).join('');
  bindConcepts(host);
}
const currentVariant = () => state.config.variants.find((row) => row.id === (
  state.variantOrder[state.variantIndex] || state.config.variants[0].id
));
const currentScenario = () => state.config.scenarios[state.scenarioIndex % state.config.scenarios.length];
function renderStudy() {
  const variant = currentVariant(); const scenario = currentScenario();
  document.querySelector('#trial-progress').textContent = `${state.variantIndex + 1}/${state.variantOrder.length} · ${state.scenarioIndex + 1}/${state.config.scenarios.length}`;
  document.querySelector('#scenario-name').textContent = `${variant.name}: ${scenario.name}`;
  document.querySelector('#scenario-instruction').textContent = scenario.instruction;
  const host = document.querySelector('#study-concept');
  host.innerHTML = conceptMarkup(variant, state.config.variants.findIndex((row) => row.id === variant.id), true);
  bindConcepts(host);
  document.querySelector('#start-trial').disabled = Boolean(state.trial);
  document.querySelector('#ratings').hidden = true;
}
function setMode(mode) {
  state.mode = mode;
  document.querySelector('#gallery').hidden = mode !== 'gallery';
  document.querySelector('#study').hidden = mode !== 'study';
  ['gallery', 'study'].forEach((name) => {
    const button = document.querySelector(`#${name}-mode`);
    button.classList.toggle('active', name === mode);
    button.setAttribute('aria-pressed', String(name === mode));
  });
  if (mode === 'study') renderStudy();
}
function startTrial() {
  if (state.trial) return;
  const scenario = currentScenario();
  state.fixture = structuredClone(state.config.fixture);
  let rowRelocations = 0;
  if (scenario.transition) {
    const before = structuredClone(state.fixture);
    state.fixture = window.sidebarLabModel.applyTransition(state.fixture, scenario.transition);
    rowRelocations = window.sidebarLabModel.countRelocations(currentVariant().id, before, state.fixture, {
      includeHistory: scenario.includeHistory,
    });
  }
  state.includeHistory = Boolean(scenario.includeHistory);
  document.querySelector('#include-history').checked = state.includeHistory;
  state.trial = {
    variantId: currentVariant().id, scenarioId: scenario.id, startedAt: performance.now(),
    completed: false, incorrectOpens: 0, clicks: 0, keystrokes: 0, scrollDistance: 0,
    sessionSwitches: 0, rowRelocations, targetsReached: [],
  };
  renderStudy();
  document.querySelector('#start-trial').disabled = true;
  document.querySelector('#telemetry').textContent = 'Trial recording: clicks, keys, scroll, switches, errors, duration';
}
function openSession(sessionId) {
  if (!state.trial) {
    state.selectedSessionId = sessionId;
    document.querySelectorAll('.session-row').forEach((row) => row.classList.toggle('selected', row.dataset.sessionId === sessionId));
    return;
  }
  state.trial.clicks += 1;
  if (state.selectedSessionId && state.selectedSessionId !== sessionId) state.trial.sessionSwitches += 1;
  state.selectedSessionId = sessionId;
  const scenario = currentScenario();
  const targets = scenario.targetSessionIds || [scenario.targetSessionId];
  if (sessionId === targets[state.trial.targetsReached.length]) {
    state.trial.targetsReached.push(sessionId);
    if (state.trial.targetsReached.length === targets.length) completeTrial(true);
  } else state.trial.incorrectOpens += 1;
}
function completeTrial(completed) {
  if (!state.trial) return;
  state.trial.completed = completed;
  state.trial.durationMs = Math.round(performance.now() - state.trial.startedAt);
  document.querySelector('#ratings').hidden = false;
  document.querySelector('#start-trial').disabled = true;
  document.querySelector('#telemetry').textContent = completed ? 'Task completed · add flow ratings' : 'Task skipped · add flow ratings';
}
function saveRating() {
  if (!state.trial || document.querySelector('#ratings').hidden) return;
  state.trial.ratings = Object.fromEntries([...document.querySelectorAll('[data-rating]')].map(
    (input) => [input.dataset.rating, Number(input.value)],
  ));
  state.trials.push(state.trial); state.trial = null; state.scenarioIndex += 1;
  if (state.scenarioIndex >= state.config.scenarios.length) {
    state.scenarioIndex = 0; state.variantIndex = (state.variantIndex + 1) % state.variantOrder.length;
  }
  state.fixture = structuredClone(state.config.fixture); state.includeHistory = false;
  document.querySelector('#include-history').checked = false; renderStudy();
  document.querySelector('#telemetry').textContent = `${state.trials.length} trial${state.trials.length === 1 ? '' : 's'} captured`;
}
const rerender = () => state.mode === 'gallery' ? renderGallery() : renderStudy();
function keyboard(event) {
  const editable = ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
  if (event.key === '/' && !editable) { event.preventDefault(); document.querySelector('#search').focus(); return; }
  if (event.key.toLowerCase() === 'h' && !editable) {
    state.includeHistory = !state.includeHistory; document.querySelector('#include-history').checked = state.includeHistory; rerender(); return;
  }
  if (state.trial) state.trial.keystrokes += 1;
  const rows = [...document.querySelectorAll(`${state.mode === 'study' ? '#study' : '#gallery'} .session-row`)];
  const index = rows.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' && rows.length) { event.preventDefault(); rows[Math.min(rows.length - 1, Math.max(0, index + 1))].focus(); }
  if (event.key === 'ArrowUp' && rows.length) { event.preventDefault(); rows[Math.max(0, index <= 0 ? 0 : index - 1)].focus(); }
}

async function smoke() {
  setMode('gallery'); state.includeHistory = true; document.querySelector('#include-history').checked = true; renderGallery();
  const concepts = [...document.querySelectorAll('#gallery .concept')];
  const galleryColumns = getComputedStyle(document.querySelector('#gallery')).gridTemplateColumns.split(' ').length;
  const liveIds = state.fixture.sessions.filter((row) => !row.history).map((row) => row.id);
  const everyVariantComplete = concepts.every((concept) => {
    const ids = [...concept.querySelectorAll('[data-session-id]')].map((row) => row.dataset.sessionId);
    return liveIds.every((id) => ids.filter((candidate) => candidate === id).length === 1);
  });
  const after = window.sidebarLabModel.applyTransition(state.fixture, { id: 'atlas-nav', status: 'ready' });
  const stableIdentity = state.config.variants.every((variant) => new Set(
    window.sidebarLabModel.buildLayout(variant.id, after, { includeHistory: true }).groups.flatMap(
      (group) => group.sessions.map((row) => row.id),
    ),
  ).size === state.fixture.sessions.length);
  const exportResult = await window.sidebarLab.exportReport({
    variantOrder: state.variantOrder,
    trials: [{ variantId: 'focus', scenarioId: 'approval-blocker', durationMs: 900, completed: true,
      clicks: 1, keystrokes: 0, scrollDistance: 0, incorrectOpens: 0, sessionSwitches: 0,
      rowRelocations: 0, ratings: { orientation: 5, attentionClarity: 5, switchingEffort: 4 } }],
  });
  setMode(state.config.smokeMode === 'study' ? 'study' : 'gallery');
  await window.sidebarLab.smokeResult({
    isolatedProfile: state.config.isolatedProfile, normalChromuxBypassed: state.config.normalChromuxBypassed,
    variantCount: concepts.length, sessionCount: state.fixture.sessions.length, everyVariantComplete,
    stableIdentity, galleryRendered: Boolean(document.querySelector('#gallery .concept')),
    studyRendered: Boolean(document.querySelector('#study-concept')), exportOk: exportResult.ok,
    viewportWidth: innerWidth, galleryColumns,
    narrowLayoutSupported: matchMedia('(max-width: 820px)').media.includes('820px'),
    reducedMotionSupported: [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => rule.media?.mediaText.includes('prefers-reduced-motion')); } catch { return false; }
    }),
  });
}

(async () => {
  state.config = await window.sidebarLab.config(); state.fixture = structuredClone(state.config.fixture);
  state.variantOrder = window.sidebarLabModel.seededOrder('chromux-sidebar-study', state.config.variants).map((row) => row.id);
  document.querySelector('#version').textContent = `Chromux ${state.config.chromuxVersion} · fixture ${state.fixture.id}`;
  document.querySelector('#project-filter').insertAdjacentHTML('beforeend', state.fixture.projects.map(
    (project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`,
  ).join(''));
  renderGallery(); renderStudy();
  document.querySelector('#gallery-mode').addEventListener('click', () => setMode('gallery'));
  document.querySelector('#study-mode').addEventListener('click', () => setMode('study'));
  document.querySelector('#start-trial').addEventListener('click', startTrial);
  document.querySelector('#skip-trial').addEventListener('click', () => state.trial ? completeTrial(false) : startTrial());
  document.querySelector('#save-rating').addEventListener('click', saveRating);
  document.querySelector('#export-report').addEventListener('click', () => window.sidebarLab.exportReport({ variantOrder: state.variantOrder, trials: state.trials }));
  document.querySelectorAll('[data-rating]').forEach((input) => input.addEventListener('input', () => { input.parentElement.querySelector('output').textContent = input.value; }));
  document.querySelector('#search').addEventListener('input', (event) => { state.query = event.target.value; rerender(); });
  document.querySelector('#status-filter').addEventListener('change', (event) => { state.status = event.target.value; rerender(); });
  document.querySelector('#project-filter').addEventListener('change', (event) => { state.project = event.target.value; rerender(); });
  document.querySelector('#include-history').addEventListener('change', (event) => { state.includeHistory = event.target.checked; rerender(); });
  document.addEventListener('keydown', keyboard);
  if (location.search.includes('smoke=1')) await smoke();
})();
