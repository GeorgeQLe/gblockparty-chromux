# Chromux - Devtool Docs Audit

_Producing skill: `$devtool-docs-audit` - Status: approved canonical research - Date: 2026-07-07 - Concept slug: `chromux` - Stage: 3 finalized artifact_

## Approval Record

Final artifact approval was received from `alignment/devtool-docs-audit-chromux.html` with no unanswered required questions and no section feedback. The approved finalization instructions authorized archiving the working packet, removing the active working packet, updating this canonical artifact, converting the alignment page to confirmed, and leaving task files unchanged.

| Gate | Decision | Impact |
| --- | --- | --- |
| Working packet artifact | `approve` | Approve the working packet substance for canonicalization. |
| Canonical path | `approve` | Write the approved artifact to `research/devtool-docs-audit.md`. |
| Backlog stance | `approve_no_task_edits` | Approve the backlog recommendations and keep `tasks/todo.md` unchanged. |

Archived working packet:

- `docs/history/archive/2026-07-07/213501/research/_working/preliminary-devtool-docs-audit-research.md`

## Scope And Source Basis

Approved scope:

- Include `README.md`, `prototype/README.md`, `prototype/docs/capture-payload.md`, `tasks/todo.md`, `prototype/examples`, and prior research context.
- Exclude implementation code except documented command, example, and proof-artifact verification.
- Evaluate against this canonical first success: install or run from `prototype/`, start a session, route a localhost or file preview to the paired browser pane, capture evidence, and send via `claude -p` or file drop.
- Carry lack of external support/user-language evidence as a source gap.

## Executive Findings

Chromux has moved from planning-only docs to a credible prototype documentation set. The root README now identifies the product, points developers to `prototype/`, and gives a minimal `cd prototype && npm install && npm start` quickstart. `prototype/README.md` documents the first local loop, DETECT adoption path, capture-to-delivery flow, app packaging command, troubleshooting bullets, and storage map. The payload schema and proof fixtures also now exist.

The highest-value docs blocker is no longer "create any README." It is to split dense prototype README material into durable support docs without losing the runnable first-success loop. The current README is strong for a builder or close collaborator, but it asks a new developer to absorb install, session creation, external tab adoption, preview routing, capture delivery, troubleshooting, storage, and privacy-sensitive local-data claims in one page.

The most important missing artifact is a standalone `prototype/docs/troubleshooting.md`. `prototype/README.md` already covers several failures, but the task queue still correctly calls for a dedicated guide covering preview detection, file previews, screenshots, console logs, CLI auth, wrong-session routing, and storage cleanup. A support page is where Chromux can include symptoms, likely causes, exact checks, and retry paths without making the quickstart harder to scan.

The second missing artifact is `prototype/docs/privacy-and-local-data.md` or equivalent. The current docs say captures are stored under `~/.chromux/captures`, delivery attempts append to `~/.chromux/delivery-log.jsonl`, the browser profile uses Electron partition `persist:chromux`, and "Nothing leaves the machine except what `claude -p` itself sends." That is useful, but it is a trust claim wrapped in a README footer rather than a complete data-handling reference.

Proof artifacts are now present and useful: `prototype/examples/transcripts/first-local-loop.md`, `prototype/examples/captures/sample-capture.yaml`, and `prototype/examples/captures/sample-screenshot.png`. The docs should link them from the README/prototype README as "proof artifacts" rather than only from the transcript back to the examples. This would make the audit trail easier for a future user or reviewer to find.

Migration docs remain absent. That is lower priority than troubleshooting and privacy because the current product is still prototype-first. The docs do not yet explain how a developer should map the manual terminal plus Chrome workflow, `cmux`-style terminal panes, IDE preview panes, or Playwright/Chrome DevTools MCP usage into Chromux. This becomes important before public OSS preview, but it should follow the support and trust docs.

## Current Documentation Surface

| Surface | Current state | Audit implication |
| --- | --- | --- |
| `README.md` | Defines Chromux, points to `prototype/`, lists `npm install` and `npm start`, and documents release tag/title conventions. | Good repo entry point, but intentionally thin. It relies on the prototype README for real onboarding. |
| `prototype/README.md` | Comprehensive prototype guide with prerequisites, run/install commands, session start, DETECT, preview routing, capture delivery, troubleshooting, and storage map. | Main first-success doc. It is dense enough that some support/trust material should move into dedicated docs. |
| `prototype/docs/capture-payload.md` | Defines YAML schema v1, field bounds, retention, and versioning. | Strong initial API/contract reference; should be cross-linked from proof fixtures and privacy docs. |
| `prototype/examples/transcripts/first-local-loop.md` | Scripted E2E transcript showing PTY session, file preview, console capture, queued localhost preview, capture modal, screenshot, file drop, and separate `claude -p` adapter verification. | Strong proof artifact, though it is scripted rather than a clean-checkout user transcript. |
| `prototype/examples/captures/sample-capture.yaml` | Sample v1 payload with session, page, selection, console tail, screenshot, delivery, and notes fields. | Useful fixture that matches the schema shape. |
| `prototype/examples/captures/sample-screenshot.png` | Present. | Provides concrete capture fixture; README should make it discoverable. |
| `tasks/todo.md` | No active priority documentation item. Open docs tasks: troubleshooting, privacy/local-data, first-success issue template. | The backlog matches the remaining docs risks. |
| Prior `research/devtool-docs-audit.md` | Canonical but stale. It says no README, docs, examples, package manifest, implementation source, or task queue existed. | Must be updated in Stage 3 after approval; do not preserve its old "no docs exist" conclusion. |

## Quickstart Clarity

### Finding Q1 - First-success path is documented, but split between a thin root README and dense prototype README.

Evidence:

- `README.md` gives `cd prototype`, `npm install`, and `npm start`, then points to `prototype/README.md`.
- `prototype/README.md` lists prerequisites: macOS, Node 20+, Xcode command-line tools for `node-pty`, and `claude` CLI on `PATH` for delivery.
- `prototype/README.md` defines the loop: start or adopt a session, let preview detection open or queue a localhost/file preview, capture element/page evidence, review YAML, deliver via `claude -p` or file drop.
- `prototype/package.json` contains matching `start`, `package`, `install-app`, `rebuild`, and `postinstall` scripts.

Impact:

The docs now give a plausible path to first success. A new developer can identify where the app lives and what commands to run. The friction is scanability: the first local loop is buried in a long README that also explains DETECT, packaging, capture internals, troubleshooting, and storage.

Recommended Stage 3 canonical note:

- Mark quickstart docs as materially improved from the prior audit.
- Recommend preserving the current root quickstart and adding a short "Verify the loop" checklist near the top of `prototype/README.md`.
- Recommend linking directly to proof artifacts after the first-success steps.

### Finding Q2 - Installable app path is documented, but support boundaries are not yet separated.

Evidence:

- `prototype/README.md` documents `npm run install-app`, explains the unsigned app, `dist/Chromux-darwin-arm64/Chromux.app`, `/Applications/Chromux.app`, and PATH behavior through the login shell.
- `prototype/package.json` has an `install-app` script that packages and copies the app.

Impact:

The install path is concrete enough for the builder. For broader users, unsigned macOS app behavior, Automation permissions, and CLI auth/PATH are high-friction support topics that should move to troubleshooting and local-data docs.

## Examples And Proof Artifacts

### Finding E1 - Proof artifacts exist and cover the riskiest documented loop, but discoverability is one-way.

Evidence:

- `prototype/examples/transcripts/first-local-loop.md` reports a scripted E2E run through a real app driver: session creation, PTY output, `file://` preview auto-open, console capture, queued localhost preview, YAML capture modal, screenshot capture, and file-drop payload.
- The transcript separately verifies the adapter command with `echo "Reply with exactly: CHROMUX-ADAPTER-OK" | /bin/zsh -lc 'claude -p'`.
- The transcript links to `prototype/examples/captures/sample-capture.yaml` and `prototype/examples/captures/sample-screenshot.png`.
- `tasks/todo.md` marks proof-artifact tasks complete.

Impact:

The proof basis is much stronger than the prior canonical audit. However, the README and prototype README do not currently surface the examples as a proof-artifact set. A future adopter must discover the transcript by browsing the examples tree.

Recommended Stage 3 canonical note:

- Treat proof artifacts as present.
- Recommend adding an "Examples and proof artifacts" section to `prototype/README.md` with links to the transcript, sample payload, and sample screenshot.
- Caveat that the transcript is scripted E2E evidence, not external user evidence.

### Finding E2 - Missing failure-recovery example remains a proof gap.

Evidence:

- Existing examples cover happy-path file preview, queue behavior, capture, file-drop, and adapter verification.
- `tasks/todo.md` still calls for standalone troubleshooting and privacy/local-data docs.
- No example fixture shows failed `claude -p`, missing CLI auth, screenshot failure, wrong preview route, or manual retry.

Impact:

The current examples prove the wedge but not support resilience. That matters because Chromux's adoption risk is not only "can it work?" but "can a user recover without losing context?"

## API Reference And Contracts

### Finding A1 - Capture payload schema v1 is documented with useful bounds and retention notes.

Evidence:

- `prototype/docs/capture-payload.md` defines `schema_version`, `captured_at`, `session`, `page`, nullable `selection`, `console`, `screenshot`, `delivery`, and `notes`.
- Field bounds are explicit: `selection.outer_html` at 8,000 characters, last 50 console entries, 500 characters per console message.
- Retention is explicit: Chromux never deletes captures; each capture directory is self-contained; delivery attempts append to `~/.chromux/delivery-log.jsonl`.
- Versioning policy distinguishes breaking schema changes from additive optional fields.

Impact:

This is the strongest docs surface in the current audit. It gives implementers and users a concrete contract for what capture produces and how payload size is controlled.

Recommended Stage 3 canonical note:

- Mark the payload-contract blocker as resolved for v1.
- Recommend adding a link from `prototype/docs/capture-payload.md` to `prototype/examples/captures/sample-capture.yaml`, and a reciprocal link from the sample fixture context if a README is added under `prototype/examples/`.

### Finding A2 - Preview routing and delivery contracts are explained in prose but not reference-grade.

Evidence:

- `prototype/README.md` explains detection of loopback URLs and absolute `*.html` paths, empty-pane auto-fill, busy-pane queueing, popup queueing, and throttled refresh on re-emitted same URL.
- Troubleshooting notes explain detection scans complete terminal lines for loopback URLs requiring a port or path, plus existing absolute HTML paths.
- `prototype/README.md` explains `claude -p` delivery and file-drop fallback.

Impact:

The README is sufficient for first use, but preview routing and delivery semantics are important enough to deserve stable reference sections. This can live in troubleshooting or a future `prototype/docs/preview-routing.md`; it does not need to block the current prototype docs.

## Troubleshooting

### Finding T1 - Troubleshooting exists in README form but should become a standalone support document.

Evidence:

- `prototype/README.md` covers `node-pty` build failure, preview not detected, `claude -p` non-zero exit, screenshot missing, DETECT tabs without titles, and wrong conversation resume.
- `tasks/todo.md` has an unchecked item: write `docs/troubleshooting.md` for preview detection, file previews, screenshots, console logs, CLI auth, wrong-session routing, and storage cleanup.

Impact:

The current README helps a builder unblock common issues. It does not yet provide enough structure for self-service support because it lacks symptom-oriented sections, diagnostic checks, exact log/file paths by failure, and escalation criteria.

Recommended Stage 3 canonical note:

- Keep concise troubleshooting bullets in `prototype/README.md`.
- Add `prototype/docs/troubleshooting.md` covering:
  - `npm install` or `node-pty` rebuild failure.
  - app launches but CLI command is missing or unauthenticated.
  - preview URL/path printed but not detected.
  - wrong preview opened, busy pane queued, or same URL refresh behavior.
  - local HTML path cannot load.
  - screenshot unavailable.
  - console tail missing, noisy, or truncated.
  - `claude -p` exits non-zero.
  - payload sent to the wrong target or resume opened the wrong conversation.
  - capture storage cleanup under `~/.chromux/captures`.

### Finding T2 - Support-language evidence is still missing.

Evidence:

- The approved scope explicitly notes no external support evidence or real user-language source is available.
- No issues, support tickets, external transcripts, or user quotes were in the approved source set.

Impact:

Troubleshooting priorities are evidence-backed internally but not validated externally. The audit should not claim these are the top user-reported issues.

## Privacy And Local Data

### Finding P1 - Current docs make a local-data trust claim before a complete local-data reference exists.

Evidence:

- `prototype/README.md` says every capture is written to `~/.chromux/captures/<timestamp>/payload.yaml` plus `screenshot.png` before delivery.
- It also says every delivery attempt is logged to `~/.chromux/delivery-log.jsonl`.
- The storage map lists capture payloads/screenshots, delivery log, and Electron browser pane profile `persist:chromux`.
- The README ends with: "Nothing leaves the machine except what `claude -p` itself sends."
- `tasks/todo.md` has an unchecked item: write `docs/privacy-and-local-data.md` before public privacy or local-first claims.

Impact:

The current claim is directionally useful but under-specified. Captures may include URLs, local paths, screenshots, selected DOM, console logs, project paths, browser profile state, delivery targets, and user notes. A standalone document should name each data type, storage location, retention/deletion behavior, and delivery boundary.

Recommended Stage 3 canonical note:

- Add `prototype/docs/privacy-and-local-data.md` before broader public README claims.
- Link it from the README storage map and capture payload docs.
- Avoid stronger public privacy/security language until this doc exists.

## Migration Paths

### Finding M1 - Migration docs are still absent and should remain lower priority than support/trust docs.

Evidence:

- No `prototype/docs/migration/` docs exist.
- Prior positioning and integration research identifies migration contrasts: manual terminal plus Chrome, `cmux`, IDE preview panes, Playwright MCP, and Chrome DevTools MCP.
- Current README describes what Chromux does but not what a user should stop doing, keep doing, or change on day one.

Impact:

Migration docs are useful for public adoption but not required for the builder's first loop. They should follow quickstart, proof artifacts, troubleshooting, and privacy/local-data docs.

Recommended Stage 3 canonical note:

- Keep migration as a later doc task, starting with `prototype/docs/migration/manual-terminal-plus-browser.md`.
- Use the current first-success loop to show replacement of manual copy/paste: terminal output URL, external browser inspection, screenshot/log copy, and paste back to agent.

## Stale Claims To Correct In Canonical Artifact

The current canonical `research/devtool-docs-audit.md` is now stale in several places:

| Stale canonical claim | Current evidence | Corrected Stage 3 position |
| --- | --- | --- |
| No `README.md` exists. | `README.md` exists with product description and quickstart. | Root README exists and is a thin entry point. |
| No package manifest or runnable app instructions exist. | `prototype/package.json` and `prototype/README.md` document `npm install`, `npm start`, and `npm run install-app`. | Prototype command path exists; runtime was not re-run in this audit. |
| No `docs/` guide exists. | `prototype/docs/capture-payload.md` exists. | Payload contract exists; troubleshooting and privacy docs are missing. |
| No example transcript, sample YAML, or screenshot path exists. | `prototype/examples/transcripts/first-local-loop.md`, sample YAML, and sample screenshot exist. | Proof artifacts exist, but failure-recovery examples are still missing. |
| No task queue exists. | `tasks/todo.md` exists and tracks docs tasks. | Backlog exists and accurately flags remaining docs gaps. |
| Stack and payload proofs are missing. | Task queue and examples indicate Electron prototype proof and scripted E2E proof. | Proof basis is improved; caveat that external user evidence is still absent. |

## Prioritized Documentation Backlog

1. Create `prototype/docs/troubleshooting.md` and link it from `prototype/README.md`.
2. Create `prototype/docs/privacy-and-local-data.md` and link it from the README storage map and capture payload docs.
3. Add an "Examples and proof artifacts" section to `prototype/README.md` linking the transcript, sample payload, and sample screenshot.
4. Add a failure-recovery example after the troubleshooting doc exists, focused on `claude -p` failure or missing auth with file-drop/manual retry.
5. Add a migration guide from manual terminal plus browser after support/trust docs are in place.
6. Add `.github/ISSUE_TEMPLATE/first-success-report.yml` only when the project is ready for controlled OSS preview, matching the existing task queue.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Decision impact |
| --- | --- | --- | --- | --- |
| Chromux now has a credible first-success doc path | `README.md` quickstart; `prototype/README.md` first local loop; `prototype/package.json` scripts. | The old "no quickstart" finding is obsolete. | High | Canonical audit should shift from creation to refinement/splitting. |
| Payload contract exists and is useful | `prototype/docs/capture-payload.md` schema, bounds, retention, versioning; sample payload fixture. | The v1 API/reference blocker is mostly resolved. | High | Focus next API docs on preview routing and delivery semantics, not payload basics. |
| Proof artifacts are present but not discoverable enough | `prototype/examples` files exist; README/prototype README do not collect them in a proof-artifacts section. | Users can verify the loop if they browse, but the docs do not guide them there. | High | Add links and a short explanation in prototype README. |
| Troubleshooting remains a docs blocker | README has bullets; `tasks/todo.md` still has unchecked standalone troubleshooting doc. | Self-service support is not mature enough for public preview. | High | Make troubleshooting the first docs remediation. |
| Privacy/local-data doc remains a trust blocker | README storage map and "Nothing leaves..." claim; unchecked privacy/local-data task. | Trust claims need a dedicated data-handling reference. | High | Add local-data doc before stronger public claims. |
| Migration docs are still missing but lower priority | No migration files; prior research identifies manual browser, cmux, IDE, and MCP baselines. | Migration matters for adoption but not first proof. | Medium-high | Defer until support and trust docs exist. |
| External support language is unavailable | Approved scope says no external support/user-language source; no issue/support evidence in repo scope. | Findings are internal-evidence based. | High | Do not present troubleshooting priorities as user-reported. |

## Assumptions And Confidence Register

| Assumption or question | Status | Confidence | What would change it |
| --- | --- | --- | --- |
| `prototype/` is the active app surface for docs. | Confirmed by root README and approved scope. | High | User identifies a newer app path. |
| Canonical first success is the prototype local loop. | Confirmed by approved YAML. | High | User chooses installed-app-only or another path. |
| Documented command existence is enough verification for this audit. | Confirmed by approved implementation-code exclusion. | Medium-high | User expands scope to runtime QA or code review. |
| The scripted E2E transcript is acceptable proof-artifact evidence. | Evidence-backed internally, not external validation. | Medium-high | Clean-checkout or external-user run contradicts it. |
| External support evidence is unavailable. | Confirmed by approved scope. | High | User supplies support tickets, issues, or interviews. |
| Public privacy claims should wait for local-data docs. | Supported by task queue and prior research. | High | User decides the repo stays private/personal-only. |

## Source Coverage Gaps

- No external support tickets, GitHub issues, user interviews, or public feedback were available.
- I did not run the Electron app or repeat the GUI E2E loop; implementation verification was limited to documented command/script presence and proof-artifact existence.
- I did not inspect implementation source except through `package.json` command surfaces and file inventories.
- I did not browse current external docs for competitors or GitHub because the approved Stage 2 scope centered on local docs and prior research.
- The first-success transcript is scripted E2E evidence from the repo, not independent external-user evidence.
