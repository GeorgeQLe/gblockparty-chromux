# Chromux Attention Queue UAT - 2026-07-07

Chromux version under test: `0.12.4` from `prototype/package.json`.

Computer Use was used for visible Electron UI verification. Temporary setup scripts lived under `/tmp` and seeded only existing smoke-mode renderer APIs; no app source was changed.

## Summary

| Run | Name | Status | Notes |
| --- | --- | --- | --- |
| 1 | Baseline Empty Queue | PASS | Empty-state rail and footer version verified in visible Electron UI. |
| 2 | Completed Attention Lifecycle | PASS | Completed row hid on focus, reappeared on blur, dismissed permanently, and did not return after new input. |
| 3 | Codex Completion Fallback Gating | PASS | Unknown Codex output did not complete; submitted Codex output completed and focus-filtered correctly. |
| 4 | Preview Filtering And Typed Echo Suppression | PASS | Malformed, glyph-contaminated, and typed echo URLs were suppressed; later valid output opened the pane; distinct URLs queued. |
| 5 | Queue Open And Decrement | PASS | Rail `OPEN` focused the queued session; opening `/uat-a` decremented to `QUEUE 2` with `/uat-b` and `/uat-c` remaining. |
| 6 | Attention Priority Ordering | PASS | Visible order was input needed, delivery fail, queue, completed, then update waiting. |

## Run 1 - Baseline Empty Queue

Timestamp: 2026-07-07 11:30:48 EDT

Setup: Launched `npm run smoke` from `prototype/` with `HOME=/tmp/chromux-uat-home-empty` and `CHROMUX_E2E=/tmp/chromux-attention-uat-empty.js`. The script waited for renderer boot and kept smoke mode alive without seeding sessions.

| Step | Action Performed | Observed Result | Expected Result | Result |
| --- | --- | --- | --- | --- |
| 1 | Inspected the attention rail with Computer Use `get_app_state`. | Rail showed `No sessions need attention. Queued previews, delivery failures, and agent input/completion signals will appear here.` | Rail shows `No sessions need attention.` empty state. | PASS |
| 2 | Inspected the footer with Computer Use `get_app_state`. | Footer showed `chromux 0.12.4 - prototype`. | Current app version `0.12.4` is visible. | PASS |

Failure notes: None yet.

## Run 2 - Completed Attention Lifecycle

Timestamp: 2026-07-07 11:32:11 EDT

Setup: Launched `npm run smoke` from `prototype/` with `HOME=/tmp/chromux-uat-home-completed` and `CHROMUX_E2E=/tmp/chromux-attention-uat-completed.js`. The script seeded visible sessions `uat-holder` and `uat-codex-3`, emitted Codex `turn-end` for `uat-codex-3`, focused `uat-holder`, and seeded a new Codex input only after the row was dismissed.

| Step | Action Performed | Observed Result | Expected Result | Result |
| --- | --- | --- | --- | --- |
| 1 | Inspected the attention rail with Computer Use. | `COMPLETED uat-codex-3` row was visible with `VIEW` and `DISMISS`; `uat-holder` tab was active. | Background completed Codex session appears in attention rail. | PASS |
| 2 | Clicked `VIEW` on `COMPLETED uat-codex-3`. | `uat-codex-3` became active and attention rail showed the empty state. | Focused session is display-filtered; `VIEW` does not acknowledge completion. | PASS |
| 3 | Clicked the `uat-holder` tab. | `COMPLETED uat-codex-3` row reappeared. | Completed row reappears after focus moves away. | PASS |
| 4 | Clicked `DISMISS` on the completed row. | Attention rail returned to the empty state. | Dismissed completed row disappears. | PASS |
| 5 | Focused `uat-codex-3`, then focused `uat-holder` again. | Attention rail stayed on the empty state both times. | Dismissed row remains hidden across focus changes. | PASS |
| 6 | Allowed the setup script to seed new input for `uat-codex-3` after dismissal, then inspected the rail. | Attention rail still showed the empty state; no `COMPLETED` row returned. | New input moves the turn back to working and no completed row appears. | PASS |

Failure notes: None yet.

## Run 3 - Codex Completion Fallback Gating

Timestamp: 2026-07-07 11:33:17 EDT

Setup: Launched `npm run smoke` from `prototype/` with `HOME=/tmp/chromux-uat-home-fallback` and `CHROMUX_E2E=/tmp/chromux-attention-uat-fallback.js`. The script seeded visible sessions `uat-holder`, `uat-codex-1`, and `uat-codex-2`; sent rate-limit/idle output to `uat-codex-1` from `unknown`; sent user input then the same output to `uat-codex-2`; and focused `uat-holder`.

| Step | Action Performed | Observed Result | Expected Result | Result |
| --- | --- | --- | --- | --- |
| 1 | Inspected the attention rail with Computer Use. | Rail showed only `COMPLETED uat-codex-2 Codex turn finished`; no `uat-codex-1` row appeared. | `uat-codex-1` remains absent because fallback must not complete from `unknown`; `uat-codex-2` appears because fallback may complete from `working`. | PASS |
| 2 | Clicked `VIEW` on `COMPLETED uat-codex-2`. | `uat-codex-2` became active and the rail showed the empty state. | Focused completed session is display-filtered without acknowledgement. | PASS |
| 3 | Clicked the `uat-holder` tab. | `COMPLETED uat-codex-2` row reappeared. | Row reappears after focus moves away. | PASS |

Failure notes: None yet.

## Run 4 - Preview Filtering And Typed Echo Suppression

Timestamp: 2026-07-07 11:37:13 EDT

Setup: Launched `npm run smoke` from `prototype/` with `HOME=/tmp/chromux-uat-home-preview-manual` and `CHROMUX_E2E=/tmp/chromux-attention-uat-preview-manual.js`. The script seeded visible sessions `uat-holder` and `uat-codex-5`; each click on `uat-codex-5`'s toolbar `QUEUE` button fed exactly one preview-detector stage.

| Step | Action Performed | Observed Result | Expected Result | Result |
| --- | --- | --- | --- | --- |
| 1 | Inspected initial `uat-codex-5` state. | URL bar was empty, toolbar showed `QUEUE 0`, attention rail showed the empty state, and paired pane showed `AWAITING PREVIEW`. | Clean preview state before feeding output. | PASS |
| 2 | Clicked `QUEUE 0` once to feed `http://localhost:49151/uat-ahttp://localhost:49151/uat-b`. | URL bar remained empty, toolbar stayed `QUEUE 0`, queue panel said no queued previews, and attention rail stayed empty. | Malformed concatenated token opens nothing and queues nothing. | PASS |
| 3 | Clicked `QUEUE 0` again to feed `http://localhost:49151/uat->Find` with a prompt glyph. | URL bar remained empty, toolbar stayed `QUEUE 0`, and attention rail stayed empty. | Glyph-contaminated token opens nothing and queues nothing. | PASS |
| 4 | Clicked `QUEUE 0` again to seed user input plus terminal echo for `http://localhost:49151/typed-url`. | URL bar remained empty, toolbar stayed `QUEUE 0`, queue panel said no queued previews, and attention rail stayed empty. | Typed echo URL opens nothing and queues nothing. | PASS |
| 5 | Clicked `QUEUE 0` again to feed a later agent-printed `http://localhost:49151/typed-url`. | URL bar changed to `http://localhost:49151/typed-url`; toolbar still showed `QUEUE 0`; browser controls became enabled. | Later valid agent output of the same URL opens the paired pane. | PASS |
| 6 | Clicked `QUEUE 0` again to feed distinct valid `/uat-a`, `/uat-b`, and `/uat-c`, then the script focused `uat-holder`. | Attention rail showed `QUEUE 3 uat-codex-5 http://localhost:49151/uat-a`; global header showed `3 QUEUED`; `uat-codex-5` tab badge showed `3`. | Three distinct valid URLs queue and produce a `QUEUE 3` attention row. | PASS |

Failure notes: The first timed Run 4 attempt used `/tmp/chromux-attention-uat-preview-queue.js` and advanced before every intermediate checkpoint could be observed, so it was discarded for Run 4 reporting. The manual-gated rerun above is the recorded result. Localhost URLs were intentionally not served; `ERR_CONNECTION_REFUSED` did not affect routing assertions.

## Run 5 - Queue Open And Decrement

Timestamp: 2026-07-07 11:35:50 EDT

Setup: Continued from `/tmp/chromux-attention-uat-preview-queue.js` final state, where `uat-codex-5` had current URL `http://localhost:49151/typed-url` plus queued `/uat-a`, `/uat-b`, and `/uat-c`, with `uat-holder` focused so the rail showed `QUEUE 3`.

| Step | Action Performed | Observed Result | Expected Result | Result |
| --- | --- | --- | --- | --- |
| 1 | Inspected the attention rail. | Rail showed `QUEUE 3 uat-codex-5 http://localhost:49151/uat-a` with an `OPEN` action. | `QUEUE 3` row appears for `uat-codex-5`. | PASS |
| 2 | Clicked rail `OPEN`. | `uat-codex-5` became active; the review queue panel opened; URL bar showed `http://localhost:49151/typed-url`; panel listed `/uat-a`, `/uat-b`, and `/uat-c`. | Session focuses and queue panel becomes visible without dequeuing. | PASS |
| 3 | Clicked queue item `OPEN` for `http://localhost:49151/uat-a`. | URL bar changed to `http://localhost:49151/uat-a`; global queued count and toolbar badge changed from 3 to 2. | Opening `/uat-a` makes it the paired pane current URL and decrements queue by exactly one. | PASS |
| 4 | Inspected the remaining queue panel rows. | Remaining rows were `http://localhost:49151/uat-b` and `http://localhost:49151/uat-c`. | `/uat-b` and `/uat-c` remain queued. | PASS |

Failure notes: Localhost URLs were intentionally not served, so the webview showed/logged `ERR_CONNECTION_REFUSED`; this did not affect the routing and queue-count assertions.

## Run 6 - Attention Priority Ordering

Timestamp: 2026-07-07 11:39:58 EDT

Setup: Launched `npm run smoke` from `prototype/` with `HOME=/tmp/chromux-uat-home-priority` and `CHROMUX_E2E=/tmp/chromux-attention-uat-priority.js`. The script seeded visible sessions for input-needed, delivery failure, queued preview, and completed turn, then queued an available update that remained waiting because live sessions were still blockers. `uat-holder` was focused.

| Step | Action Performed | Observed Result | Expected Result | Result |
| --- | --- | --- | --- | --- |
| 1 | Inspected the attention rail order with Computer Use. | Visible order was `INPUT NEEDED uat-input`, `DELIVERY FAIL uat-delivery`, `QUEUE 1 uat-codex-5`, `COMPLETED uat-codex-6`, `UPDATE WAITING Chromux update`. | `INPUT NEEDED` before `DELIVERY FAIL`; `QUEUE n` before `COMPLETED`; `UPDATE WAITING` below active agent/session attention. | PASS |
| 2 | Inspected update-waiting placement and details. | Header showed `UPDATE WAITING`; rail placed `UPDATE WAITING` last with detail `3 live sessions must complete, ask for input, or exit before installing the update.` | Passive update waiting appears below session attention items. | PASS |

Failure notes: None yet.

## Automated Checks Referenced

These checks were run after the visible UAT and passed:

| Command | Result |
| --- | --- |
| `npm run test:turn-signals-renderer` | PASS - `TURN_SIGNALS_RENDERER_OK` |
| `npm run test:preview-queue-renderer` | PASS - `PREVIEW_QUEUE_RENDERER_OK` |
| `npm run test:update-queue-renderer` | PASS - `UPDATE_QUEUE_RENDERER_OK` |
