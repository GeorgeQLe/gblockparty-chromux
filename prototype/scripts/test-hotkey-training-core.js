'use strict';

const {
  chromuxShortcutAction,
} = require('../shortcut-input');
const training = require('../hotkey-training');

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

expect(Object.isFrozen(training.MISSIONS), 'mission roster should be immutable');
expect(training.MISSIONS.map((mission) => mission.id).join(',') === [
  'recover-workspace',
  'parallel-switchboard',
  'review-browser-output',
  'create-leave-safely',
].join(','), 'mission ordering should remain stable');
expect(training.MISSIONS.map((mission) => mission.steps.length).join(',') === '3,4,5,5',
  'mission step ordering should remain stable');

const actionInputs = {
  'queue-focus': { key: 'j' },
  'browser-toggle': { key: 'b', shift: true },
  'browser-fullscreen': { key: 'f', shift: true },
  'guarded-quit': { key: 'q' },
  'new-session': { key: 't' },
  'create-project': { key: 'n' },
  detect: { key: 'd' },
  'composer-open': { key: 'Enter', shift: true },
};

for (const platform of ['darwin', 'win32']) {
  for (const mission of training.MISSIONS) {
    for (const step of mission.steps) {
      if (step.escape) continue;
      const input = step.actionId === 'session-index'
        ? { key: String(step.sessionIndex + 1) }
        : actionInputs[step.actionId];
      const primary = platform === 'win32' ? { control: true } : { meta: true };
      const action = chromuxShortcutAction({ type: 'keyDown', ...input, ...primary }, platform);
      expect(action && action.id === step.actionId,
        `${mission.id} action ${step.actionId} should resolve through production parser on ${platform}`);
      if (step.actionId === 'session-index') {
        expect(action.index === step.sessionIndex, `${mission.id} session index should match parser output`);
      }
    }
  }
}
expect(chromuxShortcutAction({ type: 'keyDown', key: 'j', meta: true }, 'darwin').label === '⌘+J',
  'macOS parser label should use the Command symbol');
expect(chromuxShortcutAction({ type: 'keyDown', key: 'j', control: true }, 'win32').label === 'Ctrl+J',
  'Windows parser label should use Ctrl');
expect(chromuxShortcutAction({ type: 'keyDown', key: 'x' }, 'darwin') === null,
  'ordinary typing should not resolve to a training action');
expect(chromuxShortcutAction({ type: 'keyDown', key: 'Meta', meta: true }, 'darwin') === null,
  'modifier-only input should not resolve to a training action');

let run = training.createRun('recover-workspace');
let outcome = training.attempt(run, null, 100);
expect(outcome.ignored && outcome.run.startedAt === null, 'ignored typing should not start timing');
outcome = training.attempt(run, { actionId: 'queue-focus' }, 100);
run = outcome.run;
expect(!outcome.correct && run.mistakes === 1 && run.startedAt === 100,
  'a wrong recognized shortcut should start timing and count one mistake');
outcome = training.attempt(run, { actionId: 'queue-focus' }, 120);
run = outcome.run;
expect(run.mistakes === 2 && run.autoHintSuggested, 'two mistakes should suggest a hint');
run = training.useHint(run);
expect(run.hintUsed && !run.autoHintSuggested, 'manual hint should be recorded and dismiss suggestion');
outcome = training.attempt(run, { actionId: 'detect' }, 150);
run = outcome.run;
expect(outcome.correct && run.stepIndex === 1, 'correct action should advance exactly one step');
outcome = training.attempt(run, { actionId: 'session-index', sessionIndex: 0 }, 160);
expect(!outcome.correct && outcome.run.stepIndex === 1, 'wrong session digit should not advance');
run = outcome.run;
run = training.attempt(run, { actionId: 'session-index', sessionIndex: 1 }, 180).run;
outcome = training.attempt(run, { actionId: 'new-session' }, 250);
run = outcome.run;
expect(outcome.completed && training.starsForRun(run) === 2, 'mistakes or hints should earn two stars');
expect(training.resultForRun(run).bestTimeMs === 150, 'elapsed time should use first scored attempt through completion');

let perfect = training.createRun('recover-workspace');
perfect = training.attempt(perfect, { actionId: 'detect' }, 1000).run;
perfect = training.attempt(perfect, { actionId: 'session-index', sessionIndex: 1 }, 1010).run;
perfect = training.attempt(perfect, { actionId: 'new-session' }, 1040).run;
expect(training.starsForRun(perfect) === 3, 'perfect completion should earn three stars');

let revealed = training.createRun('create-leave-safely');
revealed = training.revealChord(revealed);
for (const input of [
  { actionId: 'create-project' },
  { actionId: 'composer-open' },
  { actionId: 'escape', escape: true },
  { actionId: 'guarded-quit' },
  { actionId: 'escape', escape: true },
]) revealed = training.attempt(revealed, input, 2000 + revealed.stepIndex * 10).run;
expect(training.starsForRun(revealed) === 1, 'full chord reveal should cap mastery at one star');

let progress = training.mergeResult(training.emptyProgress(), 'recover-workspace', training.resultForRun(run));
progress = training.mergeResult(progress, 'recover-workspace', training.resultForRun(perfect));
expect(progress.missions['recover-workspace'].bestStars === 3, 'replay should retain best stars');
expect(progress.missions['recover-workspace'].bestTimeMs === 40, 'replay should retain best time');
expect(progress.missions['recover-workspace'].fewestMistakes === 0, 'replay should retain fewest mistakes');

for (const malformed of [
  null,
  '{}',
  JSON.stringify({ schemaVersion: 2, missions: {} }),
  JSON.stringify({ schemaVersion: 1, missions: { unknown: {} } }),
  JSON.stringify({ schemaVersion: 1, missions: { 'recover-workspace': { completed: true } } }),
  'x'.repeat(training.MAX_PROGRESS_BYTES + 1),
  '🧠'.repeat(Math.ceil(training.MAX_PROGRESS_BYTES / 2)),
]) {
  expect(Object.keys(training.sanitizeProgress(malformed).missions).length === 0,
    'malformed, oversized, unknown, or future progress should fall back empty');
}
expect(Object.keys(training.sanitizeProgress(JSON.stringify(progress)).missions).length === 1,
  'valid progress should survive sanitization');
expect(training.chordLabel(training.MISSIONS[0].steps[0], 'darwin') === '⌘+D',
  'mission labels should use macOS Command symbol');
expect(training.chordLabel(training.MISSIONS[0].steps[0], 'win32') === 'Ctrl+D',
  'mission labels should use Windows Ctrl');

console.log('HOTKEY_TRAINING_CORE_OK');
