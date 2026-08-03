(function initHotkeyTraining(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChromuxHotkeyTraining = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createHotkeyTraining() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'chromux.hotkeyTrainingProgress';
  const MAX_PROGRESS_BYTES = 64 * 1024;
  const MAX_TIME_MS = 24 * 60 * 60 * 1000;
  const MAX_MISTAKES = 10000;

  const rawMissions = [
    {
      id: 'recover-workspace',
      title: 'Recover Your Workspace',
      summary: 'Find external work, jump to a recovered session, and open a known project.',
      fixture: 'recovery',
      steps: [
        { actionId: 'detect', task: 'Detect external sessions.', hint: 'Use Chromux’s Detect command.' },
        { actionId: 'session-index', sessionIndex: 1, task: 'Jump to the second recovered session.', hint: 'Use direct session switching.' },
        { actionId: 'new-session', task: 'Open an existing project.', hint: 'Open the existing-project launcher.' },
      ],
    },
    {
      id: 'parallel-switchboard',
      title: 'Parallel Session Switchboard',
      summary: 'Move confidently among fixture sessions, then focus work that needs attention.',
      fixture: 'switchboard',
      steps: [
        { actionId: 'session-index', sessionIndex: 0, task: 'Switch to the first session.', hint: 'Use direct session switching.' },
        { actionId: 'session-index', sessionIndex: 1, task: 'Switch to the second session.', hint: 'Use direct session switching.' },
        { actionId: 'session-index', sessionIndex: 2, task: 'Switch to the third session.', hint: 'Use direct session switching.' },
        { actionId: 'queue-focus', task: 'Focus the next attention item.', hint: 'Use the next-attention command.' },
      ],
    },
    {
      id: 'review-browser-output',
      title: 'Review Browser Output',
      summary: 'Follow queued work into its paired browser and Composer without losing the layout.',
      fixture: 'browser-review',
      steps: [
        { actionId: 'queue-focus', task: 'Focus the queued browser output.', hint: 'Use the next-attention command.' },
        { actionId: 'browser-toggle', task: 'Reveal the paired browser.', hint: 'Toggle the paired browser.' },
        { actionId: 'browser-fullscreen', task: 'Expand the browser.', hint: 'Use the browser expansion command.' },
        { actionId: 'composer-open', task: 'Open Composer.', hint: 'Use the global Composer command.' },
        { actionId: 'browser-fullscreen', task: 'Restore the paired layout.', hint: 'Toggle browser expansion again.' },
      ],
    },
    {
      id: 'create-leave-safely',
      title: 'Create and Leave Safely',
      summary: 'Practice project creation, Composer dismissal, and a guarded app exit.',
      fixture: 'safe-exit',
      steps: [
        { actionId: 'create-project', task: 'Open Create Project.', hint: 'Use the new-project command.' },
        { actionId: 'composer-open', task: 'Open Composer.', hint: 'Use the global Composer command.' },
        { actionId: 'escape', escape: true, task: 'Close the simulated Composer.', hint: 'Use the standard dismissal key.' },
        { actionId: 'guarded-quit', task: 'Invoke guarded quit.', hint: 'Use the app quit command.' },
        { actionId: 'escape', escape: true, task: 'Cancel the simulated quit confirmation.', hint: 'Use the standard dismissal key.' },
      ],
    },
  ];

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  const MISSIONS = deepFreeze(rawMissions);
  const MISSION_IDS = new Set(MISSIONS.map((mission) => mission.id));

  function emptyProgress() {
    return { schemaVersion: SCHEMA_VERSION, missions: {} };
  }

  function validFiniteInteger(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function sanitizeProgress(raw) {
    try {
      if (typeof raw === 'string') {
        const byteLength = typeof TextEncoder === 'function'
          ? new TextEncoder().encode(raw).byteLength
          : unescape(encodeURIComponent(raw)).length;
        if (byteLength > MAX_PROGRESS_BYTES) return emptyProgress();
        raw = JSON.parse(raw);
      }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyProgress();
      if (raw.schemaVersion !== SCHEMA_VERSION || !raw.missions
        || typeof raw.missions !== 'object' || Array.isArray(raw.missions)) return emptyProgress();
      const ids = Object.keys(raw.missions);
      if (ids.some((id) => !MISSION_IDS.has(id))) return emptyProgress();
      const clean = emptyProgress();
      for (const id of ids) {
        const record = raw.missions[id];
        if (!record || typeof record !== 'object' || Array.isArray(record)
          || record.completed !== true
          || !validFiniteInteger(record.bestTimeMs, 0, MAX_TIME_MS)
          || !validFiniteInteger(record.fewestMistakes, 0, MAX_MISTAKES)
          || !validFiniteInteger(record.bestStars, 1, 3)
          || typeof record.lastCompletedAt !== 'string'
          || !Number.isFinite(Date.parse(record.lastCompletedAt))
          || record.lastCompletedAt.length > 40) return emptyProgress();
        clean.missions[id] = {
          completed: true,
          bestTimeMs: record.bestTimeMs,
          fewestMistakes: record.fewestMistakes,
          bestStars: record.bestStars,
          lastCompletedAt: record.lastCompletedAt,
        };
      }
      return clean;
    } catch {
      return emptyProgress();
    }
  }

  function missionById(id) {
    return MISSIONS.find((mission) => mission.id === id) || null;
  }

  function createRun(missionId) {
    if (!missionById(missionId)) return null;
    return {
      missionId,
      stepIndex: 0,
      mistakes: 0,
      stepMistakes: 0,
      hintUsed: false,
      hintStepIndex: -1,
      chordRevealed: false,
      chordRevealedStepIndex: -1,
      autoHintSuggested: false,
      startedAt: null,
      completedAt: null,
    };
  }

  function expectedStep(run) {
    const mission = run && missionById(run.missionId);
    return mission && mission.steps[run.stepIndex] ? mission.steps[run.stepIndex] : null;
  }

  function inputMatchesStep(input, step) {
    if (!input || !step || input.actionId !== step.actionId) return false;
    if (step.actionId === 'session-index') return input.sessionIndex === step.sessionIndex;
    return Boolean(input.escape) === Boolean(step.escape);
  }

  function attempt(run, input, now = Date.now()) {
    const step = expectedStep(run);
    if (!run || !step || !input || typeof input.actionId !== 'string') {
      return { run, ignored: true, correct: false, completed: Boolean(run && run.completedAt) };
    }
    const startedAt = run.startedAt === null ? now : run.startedAt;
    if (!inputMatchesStep(input, step)) {
      const mistakes = run.mistakes + 1;
      const stepMistakes = run.stepMistakes + 1;
      return {
        run: {
          ...run,
          startedAt,
          mistakes,
          stepMistakes,
          autoHintSuggested: run.autoHintSuggested || stepMistakes >= 2,
        },
        ignored: false,
        correct: false,
        completed: false,
      };
    }
    const mission = missionById(run.missionId);
    const nextIndex = run.stepIndex + 1;
    const completed = nextIndex >= mission.steps.length;
    return {
      run: {
        ...run,
        startedAt,
        stepIndex: nextIndex,
        stepMistakes: 0,
        autoHintSuggested: false,
        completedAt: completed ? Math.max(now, startedAt) : null,
      },
      ignored: false,
      correct: true,
      completed,
    };
  }

  function useHint(run) {
    return run ? {
      ...run,
      hintUsed: true,
      hintStepIndex: run.stepIndex,
      autoHintSuggested: false,
    } : run;
  }

  function revealChord(run) {
    return run ? {
      ...run,
      hintUsed: true,
      hintStepIndex: run.stepIndex,
      chordRevealed: true,
      chordRevealedStepIndex: run.stepIndex,
      autoHintSuggested: false,
    } : run;
  }

  function starsForRun(run) {
    if (!run || run.completedAt === null) return 0;
    if (run.chordRevealed) return 1;
    if (run.mistakes > 0 || run.hintUsed) return 2;
    return 3;
  }

  function resultForRun(run) {
    if (!run || run.completedAt === null || run.startedAt === null) return null;
    return {
      completed: true,
      bestTimeMs: Math.max(0, Math.round(run.completedAt - run.startedAt)),
      fewestMistakes: run.mistakes,
      bestStars: starsForRun(run),
      lastCompletedAt: new Date(run.completedAt).toISOString(),
    };
  }

  function mergeResult(progress, missionId, result) {
    const clean = sanitizeProgress(progress);
    if (!MISSION_IDS.has(missionId) || !result) return clean;
    const prior = clean.missions[missionId];
    return {
      schemaVersion: SCHEMA_VERSION,
      missions: {
        ...clean.missions,
        [missionId]: {
          completed: true,
          bestTimeMs: prior ? Math.min(prior.bestTimeMs, result.bestTimeMs) : result.bestTimeMs,
          fewestMistakes: prior ? Math.min(prior.fewestMistakes, result.fewestMistakes) : result.fewestMistakes,
          bestStars: prior ? Math.max(prior.bestStars, result.bestStars) : result.bestStars,
          lastCompletedAt: result.lastCompletedAt,
        },
      },
    };
  }

  function chordLabel(step, platform = 'darwin') {
    if (!step) return '';
    if (step.escape) return 'Escape';
    const prefix = platform === 'win32' ? 'Ctrl' : '⌘';
    if (step.actionId === 'session-index') return `${prefix}+${step.sessionIndex + 1}`;
    const suffixes = {
      'queue-focus': 'J',
      'browser-toggle': 'Shift+B',
      'browser-fullscreen': 'Shift+F',
      'guarded-quit': 'Q',
      'new-session': 'T',
      'create-project': 'N',
      detect: 'D',
      'composer-open': 'Shift+Enter',
    };
    return suffixes[step.actionId] ? `${prefix}+${suffixes[step.actionId]}` : '';
  }

  return deepFreeze({
    SCHEMA_VERSION,
    STORAGE_KEY,
    MAX_PROGRESS_BYTES,
    MISSIONS,
    emptyProgress,
    sanitizeProgress,
    missionById,
    createRun,
    expectedStep,
    attempt,
    useHint,
    revealChord,
    starsForRun,
    resultForRun,
    mergeResult,
    chordLabel,
  });
}));
