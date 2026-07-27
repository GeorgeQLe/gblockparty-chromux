# Activity Lab 0.67.0 Ship Manifest

## User goal

Build and validate an isolated live diagnostic lab for the two reported Codex
activity-indicator mismatches, preserve normal Chromux activity behavior, and
use the evidence to prepare a separately approvable production fix plan.

## Changed files and purpose

- `prototype/activity-lab-main.js`, `activity-lab-preload.js`: isolated Electron
  entry point, temporary profile, narrow IPC, export, and shutdown.
- `prototype/activity-lab/core.js`, `runner.js`, `scenarios.js`: structured
  JSONL state contract, production title/reducer inference, paired process
  orchestration, bounds, cancellation, cleanup, comparison, and sanitization.
- `prototype/activity-lab/index.html`, `renderer.js`, `styles.css`: explicit-run
  scenario UI, two signal lanes, six-state indicators, trace, and export.
- `prototype/scripts/fixtures/fake-codex-activity.js` and
  `test-activity-lab-*.js`: fake CLI and unit/Electron regression coverage.
- `prototype/scripts/run-activity-lab-uat.js`: model-usage-gated real CLI UAT.
- `prototype/package.json`, `package-lock.json`: 0.67.0 metadata and lab/test
  commands.
- `prototype/README.md`, `docs/privacy-and-local-data.md`: launch, isolation,
  model usage, retention, and export boundaries.
- `RELEASES.md`: 0.67.0 release notes.
- `docs/testing/activity-lab-uat-0.67.0.md`: live Codex 0.145.0 evidence.
- `docs/plans/codex-activity-production-fix.md`: separate-approval production
  plan.
- `tasks/todo.md`, `tasks/history.md`: completed lab and pending production gate.

## User-goal mapping

The dedicated entry point bypasses normal startup and storage. Five scenarios
exercise one or two turns per lane only after explicit user action. The two
lanes use the plan-specified commands in temporary read-only workspaces. The
production parser and attention reducer drive PTY inference. Structured JSONL
events define reference truth. Exports strip text content. Production
`renderer/attention.js`, normal `main.js`, and normal renderer behavior are not
changed by this feature.

## Executable verification

- `npm run test:activity-lab`: pass.
- `npm test`: pass, including every prototype test and Electron/platform smoke.
- `node --check activity-lab/renderer.js`: pass.
- `node --check activity-lab/runner.js`: pass.
- `git diff --check` on the activity-lab shipping boundary: pass.
- Opt-in five-scenario UAT on `codex-cli 0.145.0`: completed.

## Skipped tests

- Packaging was not rerun because the feature is exercised through the same
  installed Electron runtime by its dedicated smoke and adds no packager
  configuration or native dependency.
- Real Windows/WSL launcher UAT remains the pre-existing 0.66.0 delivery gate
  and is unrelated to this lab.

## Adversarial review

The first live pass revealed that a simplified lab recognizer would understate
production behavior. The lab was corrected to import the production OSC title
parser and attention reducer, focused/full tests were rerun, and live UAT was
repeated. The corrected evidence shows prompt Working detection followed by
69–86 seconds of false-working time because the interactive TUI remains
resident after structured turn completion.

## Residual risk

The PTY lane cannot see the rendered xterm cursor neighborhood in the main
process, so it supplies bounded output with an empty cursor context to the same
production fallback. This accurately exercises meaningful-output start
detection but does not simulate composer-at-cursor completion; the live result
therefore remains conservative. A production change is explicitly deferred.

## Rollback

Remove the dedicated activity-lab entry point/directory/scripts, remove its
package commands and documentation, and restore the prior package version.
Normal Chromux startup and attention files require no rollback.

## Next command

After the unrelated 0.66.0 work is resolved into the release history, stage the
activity-lab boundary, review the staged diff, and run the repository's shipping
workflow for `chromux-v0.67.0`.
