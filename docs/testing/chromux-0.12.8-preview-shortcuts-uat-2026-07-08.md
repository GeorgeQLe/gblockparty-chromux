# Chromux 0.12.8 Preview Queue And Shortcut UAT - 2026-07-08

Chromux version under test: `0.12.8` from `prototype/package.json`.

UAT evidence was collected with isolated Electron smoke-mode renderer runs from
`/tmp/chromux-uat-0128-runner.js`; each run used a fresh temporary `HOME`.
Computer Use was attempted first, but `list_apps` and direct `get_app_state` for
Electron both timed out after 300 seconds, so the recorded Actual values below
come from the app-rendered DOM state returned by the smoke harness.

## Summary

| Run | Name | Status | Notes |
| --- | --- | --- | --- |
| 1 | Baseline Empty Queue | PASS | No sessions, no queued previews, footer shows `chromux 0.12.8 - prototype`. |
| 2 | Code/Diff/Search Filtering | PASS | `rg`, diff, fixture, markdown table, and release-note URL examples left queue count at `0`. |
| 3 | Real Preview Output | PASS | `Local:` opened the pane; later distinct output queued with reason text. |
| 4 | Typed Echo Suppression | PASS | Typed localhost and local `.html` echoes were suppressed; later agent output routed/queued. |
| 5 | Queue Explanation And Restore | PASS | Live queue rows show `TERM` reason; legacy rows show `RESTORE` and restored reason. |
| 6 | Shortcut Regressions | PASS | Command-digit activation and browser toggle state preservation passed through renderer shortcut paths. |
| 7 | Attention Ordering | PASS | Ordering remained input, delivery, queue, completed, update waiting. |

## Run 1 - Baseline Empty Queue

Requirements: clean smoke launch shows no queued previews.

Expected: attention rail empty, global queued count `0`, footer shows `chromux 0.12.8 - prototype`.

Actual: attention rail text was `No sessions need attention. Queued previews, delivery failures, and agent input/completion signals will appear here.`; global queued count was `0`; session count was `0`; footer was `chromux 0.12.8 - prototype`.

Evaluation: PASS.

## Run 2 - Code/Diff/Search Filtering

Requirements: terminal output that looks like `rg`, `git diff`, JS fixtures, markdown tables, and release notes with localhost URLs creates no previews.

Expected: current URL stays empty, queue count stays `0`, attention rail stays empty after every false-positive category.

Actual: every staged category (`rg`, `diff-add`, `diff-remove`, `fixture`, `markdown-table`, `release-note`) reported `currentUrl: null`, `queueCount: 0`, and no attention items; global queued count was `0`.

Evaluation: PASS.

## Run 3 - Real Preview Output

Requirements: normal dev-server/prose output still opens an empty pane and queues later distinct previews.

Expected: `Local: http://localhost:5173/` opens the paired browser; later `http://localhost:49151/typed-url` queues with reason `detected in agent output`.

Actual: after `Local:` output, current URL was `http://localhost:5173/` and queue count was `0`; after later output, current URL stayed `http://localhost:5173/`, queue count was `1`, row source was `TERM`, row reason was `detected in agent output`, and attention detail was `detected in agent output: http://localhost:49151/typed-url`.

Evaluation: PASS.

## Run 4 - Typed Echo Suppression

Requirements: pasted and chunked user-typed localhost URLs and local `.html` paths do not route from immediate terminal echo; later agent output remains eligible.

Expected: immediate echoes leave current URL and queue unchanged; later output routes or queues.

Actual: typed URL echo stayed `currentUrl: null`, `queueCount: 0`; later same URL opened `http://localhost:49151/typed-url`; chunked typed echo left queue empty; later chunked URL queued `http://localhost:49151/chunked-typed`; typed `.html` echo stayed empty; later file output opened the generated `file://.../typed-preview.html`.

Evaluation: PASS.

## Run 5 - Queue Explanation And Restore

Requirements: queue rows and attention rows explain why they exist; legacy restored queue records show `RESTORE` and `restored from previous session`.

Expected: live queue row shows `TERM` plus human reason; attention detail is `reason: URL`; legacy row is not mislabeled as terminal detection.

Actual: live row was `TERM / detected in agent output / http://localhost:3000`; live attention detail was `detected in agent output: http://localhost:3000`; legacy item and row were `RESTORE / restored from previous session / http://localhost:49151/restored-legacy`.

Evaluation: PASS.

## Run 6 - Shortcut Regressions

Requirements: Command+Shift+B toggles the active paired browser; Command+1..9 works when routed through normalized session indices.

Expected: browser collapse preserves URL and queue state; digit shortcut changes active session.

Actual: activation index `0` selected `s1`; activation index `1` selected `s2`; browser toggle collapsed `s1` to `minmax(320px, 1fr) 6px 40px` with URL `http://localhost:5173/current` and queue count `1`; second toggle restored the pane with the same URL and queue count.

Evaluation: PASS.

## Run 7 - Attention Ordering

Requirements: queue rows rank below direct input/delivery attention and above completed turns as in the `0.12.4` UAT baseline.

Expected: ordering remains input needed, delivery fail, queued preview, completed, passive update waiting.

Actual: update phase was `waiting` with blocker `uat-update-blocker`; visible order was `INPUT NEEDED uat-input`, `DELIVERY FAIL uat-delivery`, `QUEUE 1 uat-queued`, `COMPLETED uat-completed`, `COMPLETED uat-queued`, `COMPLETED uat-delivery`, `UPDATE WAITING Chromux update`.

Evaluation: PASS.

## Automated Checks

| Command | Result |
| --- | --- |
| `npm run test:preview-queue-renderer` | PASS - `PREVIEW_QUEUE_RENDERER_OK` |
| `npm run test:shortcuts-renderer` | PASS - `SHORTCUTS_RENDERER_OK` |
| `npm run test:browser-collapse-renderer` | PASS - `BROWSER_COLLAPSE_RENDERER_OK` |
| `npm run test:update-queue-renderer` | PASS - `UPDATE_QUEUE_RENDERER_OK` |
| `npm run test:turn-signals-renderer` | PASS - `TURN_SIGNALS_RENDERER_OK` |
| `npm run test:detect-filter-renderer` | PASS - `DETECT_FILTER_RENDERER_OK` |
| `npm run test:capture-records-renderer` | PASS - `CAPTURE_RECORDS_RENDERER_OK` |
| `npm run test:osc-parser` | PASS - `OSC_PARSER_OK` |
| `npm run test:agent-command-quoting` | PASS - `AGENT_COMMAND_QUOTING_OK` |
| `npm run test:github-update-check` | PASS - `GITHUB_UPDATE_CHECK_OK` |
| `node --check prototype/main.js` | PASS |
| `node --check prototype/renderer/renderer.js` | PASS |
| `node --check prototype/scripts/test-preview-queue-renderer.js` | PASS |
| `git diff --check` | PASS |
