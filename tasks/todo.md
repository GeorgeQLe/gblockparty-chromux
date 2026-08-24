# Task Queue

## Current Product Direction

Chromux Next in `chromux-next/` is the replacement editor and the only default
target for new product work. Implement new runner, editing, attention,
browser, shipping, and platform capabilities there.

The legacy Electron app in `prototype/` is maintenance-only. Do not resume its
deferred feature or release work unless a user explicitly reactivates a legacy
task. Legacy state and `/releases/latest` remain unchanged until the Chromux
Next cutover gates are complete.

## Priority Documentation Todo

No active priority documentation items.

## Implementation And Documentation Todo

- [x] Add the GBlockParty fleet and attached-terminal vertical slice to
  Chromux Next v0.13.0: keep control-plane credentials and sockets in the main
  process; expose runtime-validated, sanitized fleet and attachment IPC; add an
  opt-in fleet picker and distinct replay-aware remote terminal tabs; detach on
  close without stopping the host session; preserve local runner, browser,
  evidence, detection, persistence, and legacy Chromux behavior. Publish only
  after the existing v0.12.0 release gate is resolved, and keep the successor
  on the `chromux-next-vX.Y.Z` prerelease channel.
  _(source: GBlockParty local host daemon and attachment protocol plan;
  successor-only scope: `chromux-next/`; canonical control-plane default:
  `http://127.0.0.1:4400`)_
  - Implementation and verification are complete: `npm run verify` passed 30
    Vitest files/182 tests, macOS arm64 packaging, and all packaged smoke lanes;
    `npm run visual:packaged` produced 40 qualification captures.
  - Publication completed after the v0.12.0 bootstrap: signed/notarized
    `chromux-next-v0.13.0` and the follow-up `chromux-next-v0.13.1` are public
    successor prereleases, while legacy `/releases/latest` remains stable.

- [ ] Complete the signed Chromux Next v0.12.0 release gate: notarized/stapled
  macOS arm64 build, two-version managed-update and rollback UAT, public asset
  reverification, prerelease publication, and proof that legacy
  `/releases/latest` is unchanged. Typed updater/Codex flows, IPC/UI,
  deterministic contracts, artifact tooling, and docs are implemented.
  _(source: user-supplied Chromux Next Update Parity v0.12.0 plan)_
  - 2026-08-23 live UAT result: **FAIL**. Public artifact trust, focused tests,
    authenticated Codex, download cancellation, initial staging, active-turn
    blocking, real `request_user_input` blocking, and rollback restoration all
    passed. Restaging after restart left a partial app tree and failed safely;
    the rollback helper restored trust and removed its backup but did not
    reopen the exact isolated bundle while another bundle-ID instance ran.
    Evidence is recorded in `chromux-next/docs/uat-0.12.0.md`; the unique UAT
    directory is preserved. Keep this gate open.

- [ ] Fix and publish Chromux Next v0.14.1 for the managed-update gate: make
  stale staged-bundle cleanup reliable, preserve a sanitized actionable
  failure category, and make rollback relaunch the exact restored app as a new
  instance with the intended profile even when the bundle ID is already
  running. Add focused regressions and rerun the complete signed `0.12.0` to
  greatest-successor update/rollback matrix before closing the v0.12.0 gate.
  _(source: 2026-08-23 live managed-update UAT; successor-only scope:
  `chromux-next/`; target patch: `0.14.1`)_
  - Implementation, focused regressions, the complete 31-file/187-test verify
    matrix, and a signed/notarized/stapled arm64 candidate are complete. Public
    prerelease publication and the fresh signed managed-update/rollback matrix
    remain before this item and the parent v0.12.0 gate can close.

- [x] Complete the runner-first hardening matrix with deterministic fake
  app-server and Luna processes for fragmented JSONL, crash/backoff/recovery,
  missing or incompatible CLI, authentication failure, malformed and
  oversized output, timeout, stale source references, interrupted shutdown,
  approval variants, and a real Electron two-session restore smoke.
  _(replacement-editor release gate; successor scope: `chromux-next/`;
  evidence: incremental bounded protocol lifecycle, deterministic fixture CLI,
  subprocess integration matrix, approval wire-response coverage, packaged
  two-session restoration smoke, v0.4.1 release documentation)_

- [x] Add successor-native project onboarding and settings for project/worktree
  selection, default model/reasoning/permission preferences, group management,
  and compatibility diagnostics without importing or mutating legacy state.
  _(replacement-editor usability; successor scope: `chromux-next/`; evidence:
  native folder onboarding, validated successor-only project/default
  persistence, managed session picker and groups, redacted live compatibility
  checks, recovery/concurrency coverage, v0.5.0 prerelease documentation)_

- [ ] Define and pass the Chromux Next cutover gates: macOS daily-driver and
  clean-install evidence, Windows/Linux packages, signed/update-channel
  strategy, explicit legacy-to-successor migration or coexistence policy,
  rollback proof, and promotion from `chromux-next-v0.x.y` prereleases to the
  stable `chromux-vX.Y.Z` line. _(replacement-editor cutover; do not change
  `/releases/latest` before these gates pass)_

## Deferred Legacy Chromux Work

These are retained for historical traceability and are not active todo items:

- Dock-attention v0.79.0 publication and its blocked Windows signing/release
  prerequisites.
- The legacy v0.73.0 OAuth-backed Vercel shipping release and dashboard-only
  OAuth registration/UAT.
- The legacy protected Windows 10/11 signed-candidate workflow, missing
  environments, self-hosted runners, Azure configuration, and installer
  lineage.

If any capability is still valuable, re-scope it as a new Chromux Next task
instead of resuming the `prototype/` implementation.

## Completed Work

- [x] Ship Chromux Next v0.14.0 with a read-only conversational runner
  transcript: right-aligned user bubbles, left-aligned agent bubbles,
  full-width code/tables/terminal displays/click-only graphics, expandable
  activity, DOM search and selection copy, session-local scroll restoration,
  and near-bottom streaming follow. Keep raw HTML inert, remote resources
  unloaded, xterm isolated to interactive Fleet tabs, runner/IPC/persistence
  contracts unchanged, and the release successor-only.
  _(source: user-supplied Conversational Transcript Bubbles v0.14.0 plan;
  executable evidence: classifier/component/security regressions, full verify,
  packaged standard/narrow visual qualification, signed/notarized artifact and
  public prerelease reverification)_

- [x] Ship Chromux Next v0.11.1 with Codex server-title reuse, compact
  fingerprinted no-reasoning Luna inputs, 24-hour unchanged-input backoff,
  ten-session restoration batches, independently validated partial results,
  reported token telemetry, and bounded Settings diagnostics. Preserve manual
  and generated titles, immediate directory fallbacks, successor-only state,
  legacy Chromux, and the stable `/releases/latest` channel.
  _(source: user-supplied automatic-title optimization plan; executable
  evidence: title protocol/manager regressions plus the full packaged verify
  matrix)_

- [x] Ship Chromux Next v0.11.0 with immediate canonical-directory titles for
  automatic sessions, repair of generic and repeated `-copy` restore labels,
  and one bounded GPT-5.6 Luna work-summary title after useful content exists.
  Preserve explicit user titles, non-blocking restoration, successor-only
  app-server state, legacy Chromux, and the stable `/releases/latest` channel.
  _(source: user-reported post-macOS/Codex-update title restoration quibble;
  successor-only scope; executable evidence: 149 tests, production package,
  baseline/restoration/browser packaged smokes)_

- [x] Ship Chromux Next v0.10.6 so fractional or otherwise invalid in-memory
  terminal viewports cannot violate xterm's integer scroll contract, and future
  React renderer failures show a persisted-session-safe renderer reload screen
  instead of an empty black window. Record the `Continue · omega-war` incident,
  component regressions, packaged normal/recovery visuals, and unchanged
  external-thread/stable-channel boundaries. _(source: user-supplied blank-
  renderer recovery plan; successor-only scope; no IPC, persistence, runner,
  source-thread, legacy Chromux, or `/releases/latest` contract change)_

- [x] Ship Chromux Next v0.10.5 so Continue retains safe fork ownership while
  paginated summary hydration restores copied history within a 1,000-event
  display cap, existing empty sessions repair without reforking, failed
  hydration remains visible and retryable, and excluded lifecycle responses
  retain the 1 MiB framing guard. _(source: user-supplied paginated
  continuation-history plan; successor-only scope; external Codex process,
  legacy Chromux, and stable `/releases/latest` remain unchanged)_

- [x] Ship Chromux Next v0.10.4 so detected continuation forks request only
  metadata with `excludeTurns`, preventing long source histories from exceeding
  the bounded app-server JSONL frame while retaining the v0.10.3 lease,
  transactional, external-writer, and stable-release boundaries. _(source:
  live v0.10.3 active-writer UAT correction; successor-only scope; compatible
  with Codex 0.146.0+; the external thread, legacy Chromux, persistence schema,
  and `/releases/latest` remain unchanged)_

- [x] Ship Chromux Next v0.10.3 with renewable opaque detection leases so a
  configured Continue or Start Fresh target survives waits beyond two minutes
  and later scans, while bounded main-process authority, retryable failures,
  cleanup, strict IPC, long-wait UAT, and existing fork/start/resume semantics
  remain enforced. _(source: user-supplied Detection-Lease Hotfix plan;
  successor-only scope; external threads, legacy Chromux, persistence schema,
  and `/releases/latest` remain unchanged)_

- [x] Ship Chromux Next v0.10.2 so cold launch completes Codex model discovery
  and persisted-session restoration before DETECT renders, preventing Start
  Fresh and Create continuation from remaining disabled on an empty startup
  snapshot. Repair npm 11 clean-install metadata and qualify the packaged
  startup, restoration, browser, and responsive modal states. _(source: live
  Situation Room UAT; successor-only scope; external Codex process, legacy
  Chromux, persistence schema, and `/releases/latest` remain unchanged)_

- [x] Ship Chromux Next v0.10.1 so DETECT Continue forks safely stored Codex
  history into a distinct Chromux-owned thread, never shares the active source
  writer or falls back on failure, retains ordinary restart resume, updates
  continuation copy, and covers failure, persistence, compatibility, packaged
  restoration, and visual states. _(source: user-supplied Active-Writer
  Continuation Hotfix plan; successor-only scope; external Codex process,
  legacy Chromux, persistence schema, and `/releases/latest` remain unchanged)_

- [x] Ship the flag-gated Chromux Next v0.10.0 Situation Room with a distinct
  operations shell, global chronological approval/question queue, session-local
  deferral and reopen behavior, contract-offered decision consequences,
  multi-question validation, passive Luna intelligence, responsive/reduced-
  motion styling, deterministic fixtures, packaged smoke and 36-view visual
  qualification. _(source: user-supplied Chromux Situation Room Experiment;
  successor-only scope; saved five-approach preferences, runner wire schema,
  legacy Chromux, and `/releases/latest` remain unchanged)_

- [x] Replace raw `node` and `/usr/bin/env` labels in Chromux Next's Find Your
  Work flow with the detected working directory's project name, including
  search, configuration, default title, contract coverage, and v0.9.0
  prerelease metadata. _(source: user request; successor-only scope; legacy
  Chromux and `/releases/latest` remain unchanged)_

- [x] Ship the Chromux Next v0.8.0 session browser and reviewed-evidence
  workflow with session-isolated persistent guests, explicit HTTP(S)
  navigation, independently recoverable browser state, private current-page
  captures, human approval before delivery, exact-once/retry semantics,
  responsive review UI, focused contract/recovery coverage, and packaged
  prerelease qualification. _(successor scope only; legacy Chromux and
  `/releases/latest` remain unchanged)_

- [x] Establish the Chromux Next v0.7.1 modular baseline with an injected
  browser-view owner, explicit service interfaces, startup-enforced IPC parity,
  runtime-validated renderer events, independently recoverable atomic state
  slices, persistent surface mounting, legacy-lessons documentation, focused
  recovery/contract coverage, and prerelease UAT. _(source: user-supplied
  Chromux Next Cutover-Ready Upgrade Program; successor scope only; later
  browser/evidence, qualification/import, signed-update, cross-platform, and
  stable-cutover milestones remain in the active cutover gate above)_

- [x] Make DETECT the first Chromux Next experience with bounded macOS
  Terminal/iTerm process and folder discovery, optional Automation titles,
  exact-cwd Codex thread previews and Resume, Focus Existing, opaque transient
  scan authority, transactional detected-session/project persistence,
  searchable two-stage onboarding, permanent later access, 26-capture
  packaged qualification, and v0.7.0 prerelease documentation. _(source:
  user-supplied Chromux Next Detect-First Onboarding plan; successor-only
  scope; external terminals and legacy state remain untouched)_

- [x] Rework Chromux Next into a calm premium-dark production interface with
  semantic graphite/sage tokens, shared accessible primitives and Lucide
  icons, one global surface header, contextual session navigation, in-app
  group dialogs, polished responsive states, retained comfortable/compact and
  motion preferences, 20-capture packaged qualification, and v0.6.0
  prerelease documentation. _(source: user-supplied Chromux Next Production UI
  Polish plan; successor scope: `chromux-next/`; runner, document, persistence,
  app-server, legacy Chromux, and `/releases/latest` behavior unchanged)_

- [x] Restore full structured Alignment editing as a persistent Chromux Next
  secondary workspace with canonical open/save, all schema-v1 editors, human
  review metadata, document status and ordering controls, authoritative
  on-disk transactional mutations, inverse-batch undo, external-change and
  stale-proposal protection, dedicated fake/Codex contributors, live
  Deck/Canvas projections, responsive five-approach styling, and v0.4.0
  prerelease qualification. _(source: user-supplied Restore Structured
  Alignment Editing plan; successor scope: `chromux-next/`; legacy
  `prototype/` and stable update channel unchanged)_

- [x] Add five fully functional Chromux Next interface approaches selectable
  live from Settings, with shared workflow primitives, strict persisted global
  approach/density/motion preferences, draft and terminal viewport retention,
  accessible Mission Board/Spatial Canvas equivalents, narrow layouts,
  packaged visual qualification, release documentation, and v0.3.0 prerelease
  metadata. _(replacement-editor feature; successor scope: `chromux-next/`;
  legacy `prototype/` and `/releases/latest` unchanged)_

- [x] Make Chromux Next runner-first with grouped resumable Codex app-server
  sessions, display-only xterm transcripts, fixed session composers,
  structured approvals/questions, isolated restoration, contextual Luna
  attention, permission presets, bounded protocol/security contracts, and ship
  v0.2.0 as a prerelease without changing legacy Chromux. _(source:
  user-supplied Chromux Next Runner-First Interface plan; evidence:
  `chromux-next/src/runner/`, typed IPC/preload integration, runner renderer,
  compatibility fixture, 32 focused/unit tests, packaged smoke, visual
  Electron qualification, release/UAT documentation, tag, and GitHub
  prerelease)_

- [x] Keep Chromux update results visible without scrolling by moving the
  update status into a fixed, accessible two-row Settings footer; show
  immediate manual-check feedback; preserve update/install behavior and
  scrollable diagnostics; cover narrow layouts; and ship v0.81.0. _(source:
  user-supplied Persistent Settings Update Status plan; evidence:
  `prototype/renderer/index.html`, `prototype/renderer/styles.css`,
  `prototype/renderer/renderer.js`, focused/full prototype validation,
  Electron visual smoke, package metadata, `RELEASES.md`, tag, and GitHub
  Release)_

- [x] Recognize Codex 0.146's one-key “Implement this plan?” options as logical
  turn submissions, immediately project Working across tabs and Threads,
  preserve exact-once PTY delivery and Composer-shadow suppression, keep
  non-implementation numeric choices unchanged, and ship v0.80.2. _(source:
  user-supplied Fix Plan-Handoff Working State plan; evidence: current
  three-option fixture, cross-surface Composer/activity regression, focused and
  complete prototype validation, package metadata, `RELEASES.md`, tag, and
  GitHub Release)_

- [x] Keep the Developer Inspect session selector mutation-free while focused,
  defer option lifecycle/order changes until blur, preserve live surrounding
  diagnostics and active-or-first fallback, restore active-terminal focus and
  hotkey routing after commit, and ship v0.80.1. _(source: user-supplied Fix
  the Developer Inspect Dropdown Flicker plan; evidence:
  `prototype/renderer/renderer.js`,
  `prototype/scripts/test-attention-diagnostics-renderer.js`, focused/dev-mode/
  full prototype validation, package metadata, `RELEASES.md`, packaged smoke,
  tag, and GitHub Release)_

- [x] Replace Threads card text-action grids with compact icon controls; keep
  ordinary Open on the card, retain specialized Queue/Git/system actions,
  expose Dismiss only for supported reasons, keep universal Snooze, remap `d`
  from Done to Dismiss, preserve legacy Done reads without creating new Done
  records, update documentation and coverage, and ship v0.80.0. _(source:
  user-supplied Simplify Threads Card Actions with Icons plan; evidence:
  compact accessible SVG controls, stable action selectors, dismissal and
  legacy-triage coverage, focused/full prototype validation, package metadata,
  `RELEASES.md`, tag, and GitHub Release)_

- [x] Preserve each terminal's exact visible scrollback row across immediate
  native-scroll tab switches and window blur/refit races while retaining
  alternate-screen and bottom-following behavior; ship v0.79.3. _(source:
  user-supplied Preserve Terminal Viewport During Focus Changes plan;
  evidence: synchronous physical viewport snapshots, real-Electron upward,
  downward, and blur/refit regressions, focused/full prototype coverage,
  package metadata, `RELEASES.md`, tag, and GitHub Release)_

- [x] Keep ordinary Electron tests hidden, present the native Streak
  pointer-boundary test without activation, hide Activity Lab smoke windows,
  enforce the three internal window modes, and ship v0.79.2. _(source:
  user-supplied Prevent Automated Chromux Tests from Stealing Focus plan,
  advanced from v0.79.1 because that release was already public)_

- [x] Add session, agent, and project/folder context to session-scoped Action
  Required cards; move each reason's actions into a bounded two-column grid;
  cover long labels, multiple reasons, keyboard activation, default and Streak
  rail widths; and ship v0.79.1. _(source: user-supplied Action Required Card
  Context and Overflow Fix plan; evidence: renderer context/layout changes,
  focused and complete prototype coverage, package metadata, `RELEASES.md`,
  tag, and GitHub Release)_

- [x] Add Settings-launched Hotkey Training Grounds with four fixture-backed
  workflow missions, real production-parsed keyboard input, strict isolation
  from live state and lifecycle, hints/reveals/timing/mastery, validated local
  progress and reset, macOS/Windows labels, accessible Electron coverage, and
  ship v0.78.0. _(source: user-supplied Hotkey Training Grounds plan; evidence:
  `prototype/hotkey-training.js`, main/preload training bridge,
  renderer arena, focused/complete prototype and theme coverage, package
  metadata, `RELEASES.md`, tag, and GitHub Release)_

- [x] Add the existing full session context menu to Threads sidebar rows on
  right-click, activate an inactive target before opening its actions, dismiss
  pending/open terminal previews, preserve tab menu behavior, and ship
  v0.77.0. _(source: user request; evidence:
  `prototype/renderer/renderer.js`,
  `prototype/scripts/test-session-rail-renderer.js`, related tab-group/theme
  renderer coverage, package metadata, `RELEASES.md`, tag, and GitHub Release)_

- [x] Recognize the Codex 0.146 percentage-based context footer in the shared
  rendered-prompt parser so normal PTY writes, offstage tab activation, and
  stalled startup recovery dismiss the loader only for a current prompt;
  preserve focus, accessibility, lifecycle, exit, and manual fallback policy,
  and ship v0.76.4. _(source: user-supplied Fix Codex 0.146 Startup Readiness
  Detection plan; evidence: `prototype/renderer/renderer.js`,
  `prototype/scripts/test-startup-loader-renderer.js`,
  `prototype/scripts/test-composer-renderer.js`, package metadata,
  `RELEASES.md`, focused/full prototype coverage, adversarial review, tag, and
  GitHub Release)_

- [x] Re-evaluate managed-agent startup readiness when a tab is activated so
  Codex, Claude Code, and Grok Build prompts that rendered while offstage
  dismiss the loader without more PTY output; preserve background and
  activation focus, accessibility, authoritative prompt detection, exit
  coverage, and ship v0.76.3. _(source: user-supplied Resolve Background Agent
  Loading on Tab Switch plan; evidence: `prototype/renderer/renderer.js`,
  `prototype/scripts/test-startup-loader-renderer.js`, package metadata,
  `RELEASES.md`, focused/full prototype coverage, adversarial review, tag, and
  GitHub Release)_

- [x] Recover live managed-agent startup after the 15-second warning by
  continuing rendered-prompt readiness checks in the stalled state, preserving
  exited/manual/focus/Composer/accessibility behavior, widening bounded
  provider evidence to 1,024 rows, and ship v0.76.2. _(source: user-supplied
  Fix Terminal Startup Readiness Recovery plan; evidence:
  `prototype/renderer/renderer.js`,
  `prototype/scripts/test-startup-loader-renderer.js`, package metadata,
  `RELEASES.md`, focused/adjacent/full prototype coverage, adversarial review,
  tag, and GitHub Release)_

- [x] Stabilize the Developer Inspect session dropdown by reconciling keyed
  option nodes across live diagnostics refreshes, preserving independent
  selection and session order, updating lifecycle changes in place, retaining
  active-or-first fallback, and ship v0.76.1. _(source: user-supplied
  Stabilize the Developer Inspect Dropdown plan; evidence:
  `prototype/renderer/renderer.js`,
  `prototype/scripts/test-attention-diagnostics-renderer.js`, package
  metadata, `RELEASES.md`, focused/dev-mode/full prototype coverage, tag, and
  GitHub Release)_

- [x] Add an isolated Contextual Sidebar Lab comparing the current Threads
  control with nine market-inspired alternatives over identical synthetic
  data, Gallery and counterbalanced Study modes, sanitized schema-v1 evidence,
  deterministic/no-model coverage, documentation, and ship v0.76.0.
  _(source: user-supplied Chromux Contextual Sidebar Lab plan; evidence:
  isolated Electron main/preload, ten fixture-driven concepts, six-scenario
  study instrumentation, schema-v1 report/scoring, focused and complete
  prototype coverage, no-model UAT/screenshots, docs, and v0.76.0 metadata)_

- [x] Add a session-local startup loading experience for every managed Claude
  Code, Codex, and Grok Build launch; retain hidden PTY output, reveal only
  after a rendered provider prompt, provide a 15-second manual escape hatch
  and early-exit state, preserve shell/background/focus behavior, and ship
  v0.75.0. _(source: user-supplied Agent Startup Loading Experience plan;
  evidence: renderer lifecycle/UI/readiness changes, focused provider,
  timeout, restore, accessibility, theme, cleanup, adjacent, and complete
  prototype coverage, package metadata, `RELEASES.md`, tag, and GitHub Release)_

- [x] Restore reliable Codex working indicators with immediate pending
  spinners, authoritative completion without title/output start evidence,
  exact `/clear` stale-completion protection, and an end-to-end Activity Lab
  notify lane; ship v0.74.1. _(source: user-supplied Restore Reliable Codex
  Working Indicators plan, rebased from its v0.73.1 snapshot onto current
  v0.74.0; evidence: activity reducer/projection, rendered/shadow submission
  capture, production-path lab runner, focused/full/live coverage, package
  metadata, sanitized UAT, and `RELEASES.md`)_

- [x] Restore Threads as a single-placement session inbox, move ordinary Git
  obligations to a searchable worktree navigator, replace the embedded Git
  mutation drawer with reusable dedicated Git agent sessions and unsent
  Composer inserts, advance restore snapshots to schema v11, and ship v0.74.0.
  _(source: user-supplied Restore Threads and Replace Embedded Git Review plan;
  evidence: renderer/main/preload/service changes, focused and complete
  prototype coverage, package metadata, docs, and `RELEASES.md`)_

- [x] Make browser queue attention intentional and turn-aware: add authenticated
  MCP/OSC submissions, persist browser-versus-attention visibility, bound
  terminal candidates to the current agent turn, keep terminal fallback out of
  Threads/session/group badges, document the contract, and ship v0.72.0.
  _(source: user-supplied Intentional, Turn-Aware Browser Queue Links plan;
  evidence: `prototype/browser-queue.js`, MCP/control/renderer integration,
  preview/MCP/turn/restore coverage, package metadata, docs, and `RELEASES.md`)_

- [x] Redesign Threads as an Action Required / Ready to Finish / Working / All Sessions hybrid inbox with persisted Done/Snooze triage, and replace flat Git changes with a bounded repository catalog, ranked linked-worktree inventory, validated review/commit/sync actions, schema v10, documentation, and the v0.70.0 release. _(source: user-supplied implementation plan; evidence: `prototype/git-worktree-service.js`, main/preload discriminated IPC, renderer inbox/review drawer, parser/temp-repository/real-Electron coverage, package metadata, docs, and `RELEASES.md`)_

- [x] Retry the complete Codex startup update check up to three times, keep restored Codex tabs queued without exposing intermediate errors, release them in saved order on retry success, preserve manual retry and install behavior, and ship v0.69.3. _(source: user-supplied implementation plan; evidence: `prototype/codex-update-service.js`, focused service/renderer-gate coverage, complete prototype suite, package metadata, and `RELEASES.md`)_

- [x] Recover Codex startup update checks from GitHub API 403s with a validated
  public release redirect, then fail open after bounded discovery failure,
  release every queued restore in order, keep the app-run gate bypassed, and
  make retry informational for live sessions; preserve the published v0.72.1
  hotfix and forward-integrate it into v0.74.0. _(source:
  user-supplied Fix Codex 403 Restart Recovery plan; evidence:
  `prototype/codex-update-service.js`, renderer gate recovery, focused and full
  prototype coverage, `chromux-v0.72.1`, and `RELEASES.md`)_

- [x] Add an isolated Codex Activity Indicator Lab with paired interactive PTY and structured JSONL lanes, explicit model-usage gates, five live scenarios, sanitized evidence export, fake-CLI and Electron coverage, v0.67.0 metadata, and a live Codex 0.145.0 UAT report without changing production attention inference. _(source: user-supplied implementation plan; evidence: `prototype/activity-lab/`, activity-lab scripts/tests/docs, `docs/testing/activity-lab-uat-0.67.0.md`, and `RELEASES.md`)_

- [x] Resolve whether Codex exposes a same-turn structured lifecycle source; reject the persistent app-server pilot after Gate 1 produced no observable same-turn lifecycle; implement and validate the conservative non-animated Pending fallback; archive sanitized v0.69.0 evidence without duplicate model invocation. _(source: user-approved five-turn/two-gate plan; evidence: `prototype/codex-app-server-lifecycle.js`, same-turn probe and fake coverage, focused/full prototype suites, `docs/testing/codex-activity-approval-0.69.0.md`, production-fix plan, and `RELEASES.md`)_

- [x] Replace the overloaded new-session modal with a two-tab Open Existing/Create Project launcher; add native `np`-compatible fresh/clone scaffolding, per-runtime Projects Root settings, Command/Control-N, staging/history/cache/hook handling, focused renderer/platform coverage, and ship v0.66.0 after the user explicitly accepted the remaining real Windows/WSL UAT risk. _(source: user-supplied implementation plan, advanced from occupied v0.65.0; evidence: `prototype/project-scaffolder.js`, main/preload/renderer launcher flow, scaffolder/launcher/shortcut/webview/Windows tests, `docs/testing/project-launcher-uat-0.66.0.md`, package metadata, docs, and `RELEASES.md`)_

- [x] Create one durable real-HTTP localhost first-success fixture and archive a transcript covering queue detection, explicit open approval, capture or attachment, correct target routing, and an actionable agent response. _(source: `research/devtool-adoption.md`; proof gate: durable localhost proof; evidence: candidate `f497832`, `prototype/examples/localhost-first-success/`, deterministic HTTP/Electron coverage, and passing one-turn `docs/testing/localhost-first-success-uat-0.69.2.md`)_

- [x] Create and archive one induced failure-recovery transcript proving that artifacts persist through failure and the documented retry route restores the intended result without hidden intervention. _(source: `research/devtool-adoption.md`; proof gate: recovery proof; evidence: repeatable isolated Electron/fake-adapter UAT in `prototype/scripts/test-capture-delivery-recovery.js`, archived sanitized transcript at `docs/testing/capture-delivery-recovery-uat-0.69.4.md`, README/troubleshooting links, and v0.69.4 release metadata)_

- [x] Add macOS-only, one-time-approved local MCP browser/window screenshots and bounded Chromux-window recording with system-audio fallback, private artifacts/resources, contact sheets, caller ownership, disconnect/deadline cleanup, tests, docs, and the v0.65.0 release. _(source: user-supplied implementation plan; evidence: `prototype/capture/`, main/preload/renderer capture flow, MCP contract, capture integration/renderer tests, packaging privacy metadata, capture/privacy/resource docs, `RELEASES.md`)_

- [x] Keep Codex 0.145 syntax and diff colors inside Chromux palettes by applying process-scoped `TERM=xterm-color` plus `tui.theme="ansi"` to managed new/resumed sessions and bare adopted commands, while preserving explicit shell theme opt-outs; prepare v0.64.1 without tagging or publishing before the Windows UAT and Squirrel-asset gate. _(source: user-supplied implementation plan; evidence: macOS/WSL command quoting, shell-adoption, ANSI xterm theme, restore, update-gate, notifier, and complete prototype regressions)_

- [x] Replace the unpublished full-browser chat timeline with a routed Composer that targets live sessions or creates a canonical isolated session, supports explicit persisted page attachments, retains schema-v9 compatibility without `chatMessages`, and prepares v0.64.0 without tagging or publishing before the Windows UAT and Squirrel-asset gate. _(source: user-supplied implementation plan; evidence: focused routing/attachment/new-session/restore/webview regressions, complete prototype matrix, package metadata, docs, and `RELEASES.md`)_

- [x] Restore renderer settings across product-name updates by selecting a stable production Electron profile, prefer legacy `chromux` data before the renamed fallback, preserve explicit/smoke profiles and Local Storage during cleanup, and prepare v0.63.1 without tagging or publishing before the Windows UAT and Squirrel-asset gate. _(source: user-supplied implementation plan; evidence: resolver/cleanup/theme/preference regressions, full prototype matrix, macOS package/profile replacement smoke, privacy/troubleshooting docs, package metadata, `RELEASES.md`)_

- [x] Add an optional full-browser structured chat with exact Composer prompts, bounded terminal-derived replies, schema-v9 restore, page-evidence attachments, and editable context-seeded sessions; prepare v0.63.0 without tagging or publishing before the Windows UAT and Squirrel-asset gate. _(source: user-supplied implementation plan; evidence: focused full-browser chat/restore/webview regressions, complete prototype matrix, source and packaged smoke, themed chat captures, capture/restore contracts, package metadata, `RELEASES.md`)_

- [x] Position native macOS controls from each measured theme header, restore Liquid Glass branding clearance, and enlarge the SESSIONS, QUEUED, and SENT glass gauges with balanced bordered padding; prepare v0.62.1 without tagging or publishing before the Windows UAT gate. _(source: user-supplied implementation plan; evidence: theme/window regressions, complete prototype matrix, light/dark screenshots, package metadata, `RELEASES.md`)_

- [x] Add guarded `Command+Shift+F` / `Control+Shift+F` paired-browser fullscreen routing from host, terminal, and non-editable webview focus; mirror the rail expansion action across all configured layouts, preserve exact session/browser state and existing shortcuts, and stage it in the v0.62.0 release candidate. _(source: user-supplied implementation plan; evidence: shortcut/hotkey/browser-layout/webview regressions, source and packaged smoke, package metadata, `prototype/README.md`, `RELEASES.md`)_

- [x] Keep Codex permission, plan-progression, and Plan-mode numeric chooser selections out of Prompt Composer while forwarding them to the PTY exactly once; preserve ordinary numeric prompts, numbered prose/transcripts, non-Codex terminals, redraw behavior, and ship as v0.61.9. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-composer-renderer.js`, focused shortcut/attention/terminal-rendering regressions, package metadata, `RELEASES.md`)_

- [x] Preserve Codex Working state, tab-spinner continuity, and Threads Working membership across repeated meaningful composer redraws, then ship as v0.61.8. _(source: user-supplied implementation plan, advanced from occupied v0.61.7; evidence: `prototype/renderer/attention.js`, turn-signal/tab-activity/session-rail regressions, focused and complete prototype validation, source and packaged smoke, package metadata, `RELEASES.md`)_

- [x] Make live terminal previews swap complete double-buffered xterm frames atomically, coalesce sustained output, cancel stale replay callbacks, preserve serialization/viewport/theme/size behavior, and ship as v0.61.7. _(source: user-supplied implementation plan, advanced from occupied v0.61.6; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-session-rail-renderer.js`, complete prototype test matrix, source and packaged smoke, package metadata, `RELEASES.md`)_

- [x] Keep full-Chromux browser mode below the measured application header while covering all lower app content, retain titlebar and browser-rail interaction plus exact layout/webview restoration, and ship as v0.61.6. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-collapse-renderer.js`, theme regression, package metadata, `RELEASES.md`)_

- [x] Restore visible terminal hover previews for sessions without attention by assigning every optional preview surface to a stable grid row, retain attentive and overflowing previews, and ship as v0.61.5. _(source: user-supplied implementation plan; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-session-rail-renderer.js`, every theme/mode/size matrix, screenshot smoke, `RELEASES.md`)_

- [x] Reclaim orphaned Chromux browser partitions and stale signal-correlation records on the next launch, preserve unrelated and user-retained storage, continue after cleanup failures, and ship as v0.61.4. _(source: user-supplied implementation plan; evidence: `prototype/storage-cleanup.js`, `prototype/scripts/test-storage-cleanup.js`, requested regressions, source and packaged cleanup/isolation smoke, privacy/troubleshooting docs, `RELEASES.md`)_

- [x] Remove printable framing around correlated Codex OSC 10/11/12 color-reply residue in Compose, preserve prompt text and raw PTY delivery, and ship as v0.61.3. _(source: user-supplied implementation plan, advanced from occupied v0.61.2; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-composer-renderer.js`, focused and complete prototype matrix, source and packaged smoke, `RELEASES.md`)_

- [x] Keep Recent Threads ordering stable during navigation, retain meaningful-work recency, block post-render double-click activation of newly exposed rows, and ship as v0.61.2. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-session-rail-renderer.js`, focused and complete prototype matrix, source and packaged smoke, `prototype/README.md`, `RELEASES.md`)_

- [x] Add configurable paired-workspace, all-layout cycle, and full-Chromux browser expansion behavior with session-local exact restoration, full-renderer geometry, Settings persistence, and v0.61.0 release coverage. _(source: user-supplied implementation plan; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-collapse-renderer.js`, complete prototype matrix, source and packaged smoke, `RELEASES.md`)_

- [x] Keep the browser queue open while an approved preview loads, close it only after that selected tab succeeds, preserve failure recovery, and ship as v0.60.4. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-preview-queue-renderer.js`, browser-tabs regression, `RELEASES.md`)_

- [x] Make Codex update-preflight discovery and subprocess execution share the augmented PATH so Node-based launchers work after Finder startup; ship as v0.60.3. _(source: user-supplied implementation plan; evidence: `prototype/codex-update-service.js`, `prototype/scripts/test-codex-update-service.js`, source and packaged smoke, `RELEASES.md`)_

- [x] Prevent correlated OSC 10/11/12 color-reply residue from entering the Codex prompt composer, preserve streaming input and ordinary prompt behavior, and ship as v0.60.2. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-composer-renderer.js`, complete renderer matrix, source and packaged smoke, `RELEASES.md`)_

- [x] Buffer Codex DEC synchronized-output frames across PTY chunk boundaries, preserve ordinary terminal behavior, bound malformed frames, and ship as v0.60.1. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-synchronized-output-renderer.js`, complete prototype matrix, source and packaged smoke, `RELEASES.md`)_

- [x] Reveal collapsed paired browsers from Needs Attention queue `OPEN`, add per-session browser fullscreen with exact collapsed/split restoration and rail-only controls, preserve browser state across transitions, and ship as v0.60.0. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, browser-collapse/session-rail/shortcuts/browser-tabs/theme regressions, source and packaged smoke, `RELEASES.md`)_

- [x] Restore immediate Codex submission spinners while retaining pending turn safety, provider-confirmed Working membership, `/clear` stale-completion safeguards, and disabled-indicator behavior; ship as v0.59.1. _(source: user-supplied implementation plan; evidence: `prototype/renderer/attention.js`, tab-activity/session-rail/diagnostics/turn-signal/update-queue regressions, complete prototype matrix, source and packaged smoke, `RELEASES.md`)_

- [x] Annotate loopback preview queues with live server status, launch validated project scripts in non-focused shell tabs, preserve explicit browser-open approval, recover failed loopback tabs, and ship as v0.59.0. _(source: user-supplied implementation plan; evidence: `prototype/preview-probe.js`, main/preload IPC, renderer queue/launcher/browser lifecycle, focused and complete 47-file prototype matrix, source and packaged smoke, `RELEASES.md`)_

- [x] Transfer Tab-completed Codex `$skill` mentions into Compose when shortcut chrome is hidden, retain conservative ambiguous-prompt fallback, and ship as v0.58.7. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-composer-renderer.js`, focused renderer regressions, source and packaged smoke, `RELEASES.md`)_

- [x] Make Command-digit shortcuts select visible primary groups, restore remembered sessions, cycle within the selected group, preserve flat-mode indexing, and ship as v0.58.6. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, shortcut/hotkey/grouped-tab/webview renderer regressions, `RELEASES.md`)_

- [x] Preserve grouped-tab Working spinner and pointer-target continuity across title, hover, badge, and status updates; restore reliable lower session-tab activation; ship as v0.58.4. _(source: user-reported regression; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-session-tab-groups-renderer.js`, all 46 prototype test files, source and packaged smoke, package metadata inspection, `RELEASES.md`)_

- [x] Make GitHub update checks resilient to REST API rate limits with a validated public latest-release redirect fallback, retry transient failures without caching them, and ship as v0.58.3. _(source: user-supplied implementation plan; evidence: `prototype/update-checker.js`, `prototype/scripts/test-github-update-check.js`, `prototype/scripts/test-update-queue-renderer.js`, all 46 prototype test files, source and packaged smoke, `prototype/docs/privacy-and-local-data.md`, `RELEASES.md`)_

- [x] Replace Codex submission-based Working inference and `/clear` parsing with pending turns resolved by animated-title, stable-title, meaningful-output, and composer-redraw evidence; preserve stale completion barriers and shared projections; ship as v0.58.2. _(source: user-supplied implementation plan; evidence: `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, focused lifecycle/title/tab/Threads/diagnostics/update-safety regressions, all 46 prototype test files, source and packaged smoke, `RELEASES.md`)_

- [x] Add opt-in two-level session tab groups with exact-cwd automatic grouping, persistent custom management/membership/navigation, schema-v8 restore focus, aggregate status, and flat-mode compatibility; ship as v0.58.0. _(source: user-supplied implementation plan; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/main.js`, `prototype/scripts/test-session-tab-groups-renderer.js`, `prototype/scripts/test-restore-session-identity.js`, `RELEASES.md`)_

- [x] Show projected session attention details in live terminal hover/focus previews, preserve bounded terminal geometry and interaction behavior, and ship as v0.57.0. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-session-rail-renderer.js`, adjacent queue/diagnostics/theme regressions, `RELEASES.md`)_

- [x] Simplify Needs Attention session cards to one semantic header status, retain labeled additional reasons and direct actions, wrap summaries to two lines, and ship as v0.56.2. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, session-rail and affected renderer regressions, all 45 prototype test files, source and packaged smoke, `RELEASES.md`)_

- [x] Refresh the GIGACHADD integration-map Stage 2 artifact review, stabilize saved-project URL queue verification with a bounded condition poll, and ship as v0.56.1. _(source: current session; evidence: `alignment/devtool-integration-map-gigachadd-process.html`, `alignment/index.html`, `prototype/scripts/test-projects-renderer.js`, website and saved-project executable checks, `RELEASES.md`)_

- [x] Keep focused sessions in Needs Attention for live input, permission, authentication, rate-limit, and tool-failure states; preserve other focused suppression and Threads deduplication; ship as v0.56.0. _(source: user-supplied implementation plan; evidence: `prototype/renderer/attention.js`, focused diagnostics/turn-signal/tab-activity/session-rail regressions, `RELEASES.md`)_

- [x] Resolve Codex autocomplete-dispatched `/clear` from an unambiguous visible `/cl` prefix, preserve shared Idle/Working lifecycle behavior and negative cases, isolate renderer verification from the live user profile, and ship as v0.54.1. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, real-xterm turn-signal and diagnostics regressions, focused lifecycle/composer/Threads/tab/update-safety suites, all 45 prototype test files, source and packaged smoke, `RELEASES.md`)_

- [x] Enrich inferred Codex DETECT resume targets with bounded local thread names and latest-agent excerpts, preserve exact-cwd rollout fallback and transient privacy, use representative RESUME names, and ship as v0.54.0. _(source: user-supplied implementation plan; evidence: `prototype/codex-detect-metadata.js`, `prototype/main.js`, `prototype/renderer/renderer.js`, adapter/detect/restore regressions, all 45 prototype test files, source and packaged smoke, `prototype/README.md`, `RELEASES.md`)_

- [x] Preview inactive ordinary, Working, and Needs Attention Threads rows on delayed hover or keyboard focus, activate sessions on one row click, preserve preview/attention/title stability, and ship as v0.53.0. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-session-rail-renderer.js`, complete prototype suite, source and packaged smoke, `prototype/README.md`, `RELEASES.md`)_

- [x] Recognize exact Codex `/clear` from the rendered prompt when the keystroke shadow is stale, preserve Recent Threads row and spinner animation continuity across animated titles, retain genuine A–Z title reordering, and ship as v0.52.2. _(source: user-supplied implementation plan; evidence: `prototype/renderer/renderer.js`, real-xterm turn-signal/session-rail coverage, focused lifecycle/composer/diagnostics/update-safety suites, complete prototype suite, source and packaged smoke, `RELEASES.md`)_

- [x] Treat exact Codex `/clear` as an authoritative idle boundary, invalidate stale completion callbacks and notifications until the next ordinary prompt, project idle across every shared consumer, and ship as v0.52.1. _(source: user-supplied implementation plan; evidence: `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, focused turn-signal/tab-activity/session-rail/diagnostics/update-safety coverage, complete prototype suite, source and packaged smoke, `RELEASES.md`)_

- [x] Default non-attentive Threads to persisted Recent ordering, add A–Z, persist deliberate session activity in schema-v7 restore snapshots, preserve urgency ordering, and ship as v0.52.0. _(source: user-supplied implementation plan; evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-session-rail-renderer.js`, `prototype/scripts/test-restore-session-identity.js`, complete prototype suite, source and packaged smoke, `RELEASES.md`)_

- [x] Add per-session paired-browser tabs, internal terminal HTTP(S) link routing, a project-scoped HTML explorer with live-cwd resolution/autocomplete, schema-compatible restore persistence, and ship as v0.51.0. _(source: user-supplied implementation plan; evidence: `prototype/main.js`, `prototype/preload.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-tabs-html-explorer.js`, complete prototype suite, packaged smoke, `RELEASES.md`)_

- [x] Keep exact Codex `/clear` submissions idle, harden rendered completion recovery with per-turn generations and a busy-render latch, and ship as v0.50.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-turn-signals-renderer.js`, focused renderer suites, `RELEASES.md`)_

- [x] Add native double-click activation to every Threads session row, preserve immediate single-click previews and inline attention actions, restore terminal focus, and ship as v0.50.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-session-rail-renderer.js`, focused renderer suites, packaged Electron verification, `RELEASES.md`)_

- [x] Transfer the current rendered Codex prompt value into COMPOSE and every draft-conflict outcome, retain conservative shadow fallback behavior, and ship as v0.49.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-composer-renderer.js`, focused renderer suites, packaged Electron verification, `RELEASES.md`)_

- [x] Preserve working Threads spinner DOM nodes while typing unsubmitted terminal input, retain genuine submitted-input turn transitions, and ship as v0.48.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-tab-activity-indicators-renderer.js`, focused activity/session-rail/turn/composer/update tests, `RELEASES.md`)_

- [x] Gate all Chromux-managed Codex launches behind one source-aware update preflight, suppress per-PTY native prompts, release queued resumes deterministically after update/current/bypass decisions, and ship as v0.48.0. _(source: user-approved implementation plan; evidence: `prototype/codex-update-service.js`, `prototype/main.js`, `prototype/preload.js`, `prototype/renderer/renderer.js`, focused service/renderer/command/restore tests, `RELEASES.md`)_

- [x] Transfer bounded session-local editable terminal input into the composer with accessible draft-conflict choices, add full-terminal composer expansion with viewport restoration, and ship as v0.46.0. _(source: user-approved implementation plan; evidence: `prototype/main.js`, `prototype/preload.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-composer-renderer.js`, `RELEASES.md`)_

- [x] Preserve session-scoped Needs Attention records through restart snapshots as bounded schema v5 history, keep restored records separate from live state, and ship as v0.45.0. _(source: user-approved implementation plan; evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, focused restore/attention/update tests, local-data docs, `RELEASES.md`)_

- [x] Preserve Threads row identity and click continuity through presentation-only terminal title changes, add 6px-separated inset Needs Attention cards, and ship as v0.44.2. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-session-rail-renderer.js`, `RELEASES.md`)_

- [x] Keep sessions focused through Threads, search, attention items, or programmatic navigation visible in the horizontally scrolling tab strip without moving an already-visible tab, and ship as v0.44.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-tab-titles-renderer.js`, `RELEASES.md`)_

- [x] Normalize Codex spinner-prefixed display titles, unify tab and Threads status projection and animation, preserve action/exit precedence with activity indicators disabled, and ship as v0.44.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, focused renderer tests, `RELEASES.md`)_

- [x] Center the full-height paired-browser BROWSER / COLLAPSE rail control in both states, add geometry regression coverage, and ship as v0.43.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/styles.css`, `prototype/renderer/renderer.js`, `prototype/scripts/test-browser-collapse-renderer.js`, `RELEASES.md`)_

- [x] Unify outstanding work into Threads, remove the standalone Attention rail mode, aggregate attentive sessions without duplication, pin managed-update status, preserve direct actions and previews, and ship as v0.43.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-session-rail-renderer.js`, `prototype/scripts/test-update-queue-renderer.js`, `prototype/README.md`, `RELEASES.md`)_

- [x] Ship Chromux v0.42.0 with an on-demand multiline terminal composer, per-project prompt history, schema-v4 draft restoration, focused renderer/persistence coverage, documentation, tag, and latest GitHub Release. _(source: user-approved implementation plan; evidence: `prototype/prompt-history.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-prompt-history.js`, `prototype/scripts/test-composer-renderer.js`, `docs/terminal-interaction-roadmap.md`, `RELEASES.md`)_

- [x] Keep rendered terminal rows inside the pane at every fitted height without changing scrolling, tab activation, layout refits, or skip-to-bottom behavior; ship as v0.41.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-terminal-scroll-bottom-renderer.js`, `RELEASES.md`)_

- [x] Add an explicit idle turn state, preserve unseen completion attention until consumption, recover missed Codex completion notifications from the rendered composer, make diagnostics rail-aware, and ship as v0.41.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-turn-signals-renderer.js`, `prototype/scripts/test-attention-diagnostics-renderer.js`, `RELEASES.md`)_

- [x] Replace the toolbar collapse control with a permanent 40px paired-browser side rail labeled BROWSER / COLLAPSE, preserving state, shortcuts, reopening paths, narrow-toolbar access, and ship as v0.40.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-collapse-renderer.js`, `prototype/README.md`, `RELEASES.md`)_

- [x] Preserve each tab's exact runtime terminal viewport through activation and every fit path without breaking inactive output, bottom following, alternate-screen applications, or skip-to-bottom behavior; ship as v0.39.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-terminal-scroll-bottom-renderer.js`, `RELEASES.md`)_

- [x] Add a read-only live terminal preview popover for inactive Threads rows, linked active-row confirmation cues, fully opaque theme-specific surfaces, accessibility/lifecycle coverage, and v0.39.0 release. _(source: user-approved implementation plan and in-session opacity/padding/readability corrections; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-session-rail-renderer.js`, `prototype/README.md`, `RELEASES.md`)_

- [x] Add a session-local floating terminal skip-to-bottom control with a one-page threshold, smooth/reduced-motion behavior, alternate-screen suppression, cancellation safety, real-xterm coverage, and v0.38.0 release. _(source: user-approved implementation plan; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-terminal-scroll-bottom-renderer.js`, `RELEASES.md`)_

- [x] Vertically center the horizontal session-tab scrollbar with balanced 3px gaps across every theme while preserving stable overflow geometry; ship as v0.36.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-tab-titles-renderer.js`, `RELEASES.md`)_

- [x] Add completion seen-state and a persisted Attention/Threads/Git session rail with exact-cwd and Git-root grouping; ship as v0.36.0. _(source: user-approved implementation plan; evidence: `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/main.js`, `prototype/scripts/test-session-rail-renderer.js`, `RELEASES.md`)_

- [x] Add searchable session tabs with a sticky search/add action pair and unobstructed right-most close control; ship as v0.35.0. _(source: user request; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-tab-titles-renderer.js`, `RELEASES.md`)_

- [x] Preserve each tab's exact Claude, Codex, or Grok conversation across restart with authenticated provider IDs, schema v3 snapshots, distinct legacy inference, and a visible best-effort warning; ship as v0.33.3. _(source: user-approved implementation plan; evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-restore-session-identity.js`, `prototype/scripts/test-codex-notifier.js`, `prototype/scripts/test-turn-signals-renderer.js`, `RELEASES.md`)_

- [x] Stabilize Streak attention-card and `VIEW`/`DISMISS` click targets so hover and active feedback cannot cancel a first boundary click, and ship the fix as v0.33.2. _(source: user-approved implementation plan; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-streak-attention-click-targets-renderer.js`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_

- [x] Reserve stable scrollbar clearance beneath session tabs across every theme without changing tab dimensions or terminal-stage positioning, and ship the fix as v0.33.1. _(source: user-approved implementation plan; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-tab-titles-renderer.js`, `RELEASES.md`)_

- [x] Add and ship a host-wide Chromux resource broker with atomic FIFO leases, Codex MCP tools, cooperative Computer Use guidance, simulator capacity/admission and validated operations, a Resources UI, isolated per-session browser profiles, crash recovery, and parallel-client/browser verification as v0.33.0. _(source: user implementation plan; version advanced after the separately landed diagnostics feature claimed v0.32.0; evidence: `prototype/resource-broker/`, `prototype/renderer/`, `prototype/scripts/test-resource-*`, `prototype/scripts/test-browser-isolation-smoke.js`, `prototype/docs/resource-broker.md`, `RELEASES.md`)_

- [x] Add restart-gated Developer Mode and an always-expanded, read-only attention-queue diagnostics strip with independent session inspection, projection/tab mismatch detection, and sanitized event history. _(source: user-approved plan; evidence: `prototype/dev-mode.js`, `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-attention-diagnostics-renderer.js`, `RELEASES.md`)_
- [x] Vertically center native macOS traffic-light controls with the Chromux brand row for all four theme families while preserving theme geometry and startup fallback positioning. _(source: user request; evidence: `prototype/main.js`, `prototype/preload.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-window-config.js`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_
- [x] Mark Grok Build actions in the tab context menu with a warning triangle, show the full advisory in a popup, and require a fresh explicit acknowledgement before new-session or context-menu Grok launches. _(source: user request; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-grok-warning-renderer.js`, `prototype/docs/privacy-and-local-data.md`, `RELEASES.md`)_
- [x] Add enabled-by-default, persisted tab activity indicators that show working spinners and completed checkmarks without replacing exit or attention-state lifecycle behavior. _(source: user request; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-tab-activity-indicators-renderer.js`, `RELEASES.md`)_
- [x] Keep the real focused xterm helper textarea visually transparent without changing xterm-managed geometry or input behavior, and verify scrollback across all eight theme appearances. _(source: user report; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_
- [x] Restore readable active terminal-tab text in Streak Dark and align the attention-queue heading with its empty-state card. _(source: user report; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_
- [x] Repaint every live xterm viewport after theme-family or Light/Dark switching so the active terminal input row adopts the selected palette without resetting terminal or session state. _(source: user report; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_
- [x] Add tactile half-press hover and full-press active interactions to Streak theme button surfaces, with disabled and reduced-motion safeguards. _(source: user request; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_
- [x] Add independently persisted Light and Dark modes to all four app themes and make Liquid Glass Light the clean-profile default while preserving legacy Blueprint's original dark appearance. _(source: user request; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-themes-renderer.js`, `prototype/scripts/capture-themes.js`, `prototype/README.md`)_
- [x] Polish Streak theme layout by adding a terminal-stage gutter beside the attention rail, matching the Settings header button to the status gauges, and preventing xterm's hidden helper textarea from overlapping the terminal scrollbar. _(source: user request; evidence: `prototype/renderer/styles.css`, `prototype/scripts/test-themes-renderer.js`, `RELEASES.md`)_
- [x] Add four clickable Chromux themes—Blueprint, Retro-OS, Streak, and Liquid Glass—with an instant, locally persisted picker in Settings and a matching terminal palette. _(source: user request; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-themes-renderer.js`, `prototype/scripts/capture-themes.js`)_
- [x] Warn before launching Grok Build that the CLI may transmit codebase files, Git history, and secrets to xAI-controlled infrastructure; link the reproducible research, independent reporting, and xAI privacy policy; recommend professional cybersecurity/data-security review for sensitive repositories. _(source: user request; evidence: `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, `prototype/docs/privacy-and-local-data.md`, `prototype/scripts/test-grok-warning-renderer.js`)_
- [x] Compile the Chromux landing page and 15 design-refresh prototypes into a production-safe static website, publish the gallery at `/designs/`, and configure Vercel deployment. _(source: user request; evidence: `scripts/build-website.sh`, `vercel.json`, `landing/index.html`, `design-prototypes/`)_
- [x] Add the "Liquid Glass" 16th design-refresh prototype and wire it into the gallery as Batch 3. _(source: user request; evidence: `design-prototypes/16-liquid-glass.html`, `design-prototypes/index.html`, `design-prototypes/README.md`)_
- [x] Build seven mobile Chromux prototypes (A Mission Control, B Agent Inbox, C Browser Field Kit, D Timeline, E Deck of Agents, F Command Lens, G Remote Workbench) as static HTML mockups sharing one fleet state and layered-context contract, and publish them at `/mobile/`. _(source: user request; evidence: `mobile-prototypes/`, `mobile-prototypes/SPEC.md`, `scripts/build-website.sh`, `scripts/test-website-routes.js`, `landing/index.html`)_
- [x] Add twenty batch-4 design-refresh prototypes (17 Mission Patch through 36 Chromatic Shadow) following `design-prototypes/SPEC.md` and wire them into the gallery, README, and route regression test. _(source: user request; evidence: `design-prototypes/17-mission-patch.html`…`36-chromatic-shadow.html`, `design-prototypes/index.html`, `design-prototypes/README.md`, `scripts/test-website-routes.js`)_
- [x] Run a `cmux` stack spike to validate embedded Chromium pane feasibility and capture hooks. _(source: `research/devtool-dx-journey.md`; evidence: Electron prototype under `prototype/` with paired webviews, capture modal, screenshots, and `node-pty` sessions)_
- [x] Prototype preview detection for `localhost`, loopback URLs, and local HTML paths from terminal output. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-shortcuts-renderer.js`, `prototype/scripts/test-update-queue-renderer.js`)_
- [x] Add per-session paired-browser collapse and narrow-toolbar scrolling for terminal-first workflows. _(source: user request; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-collapse-renderer.js`)_
- [x] Create `docs/capture-payload.md` with a versioned YAML schema, field bounds, retention notes, and one sample payload. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/docs/capture-payload.md`, `prototype/examples/captures/sample-capture.yaml`)_
- [x] Build an end-to-end capture-to-delivery proof using `claude -p` plus file-drop fallback. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-capture-records-renderer.js`)_
- [x] Write `README.md` with the first local loop quickstart after runnable commands exist. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/README.md`)_
- [x] Write `docs/troubleshooting.md` for preview detection, file previews, screenshots, console logs, CLI auth, wrong-session routing, and storage cleanup. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/docs/troubleshooting.md`)_
- [x] Write `docs/privacy-and-local-data.md` before public privacy or local-first claims. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/docs/privacy-and-local-data.md`)_
- [x] Add proof artifacts under `examples/`: sample payload, sample screenshot path, and demo transcript. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/examples/captures/`, `prototype/examples/transcripts/first-local-loop.md`)_
- [x] Add `examples/transcripts/first-local-loop.md` after the stack and payload spikes produce real commands. _(source: `research/devtool-adoption.md`; evidence: `prototype/examples/transcripts/first-local-loop.md`)_
- [x] Add `examples/captures/sample-capture.yaml` and matching screenshot fixture after the payload schema is proven. _(source: `research/devtool-adoption.md`; evidence: `prototype/examples/captures/sample-capture.yaml`, `prototype/examples/captures/sample-screenshot.png`)_
- [x] Add dynamic session tab titles from terminal OSC 0/1/2 sequences. _(source: user request; evidence: `prototype/renderer/signals.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-osc-parser.js`, `prototype/scripts/test-tab-titles-renderer.js`)_
- [x] Create `.github/ISSUE_TEMPLATE/first-success-report.yml` after the project is ready for controlled OSS preview. _(source: `research/devtool-adoption.md`; evidence: `.github/ISSUE_TEMPLATE/first-success-report.yml`)_
- [x] Phase A — Approval-gated paired browser: new sessions start collapsed; detected previews always queue (never auto-open empty pane); open only on user approval (queue OPEN, ⌘/Ctrl-click terminal link, manual URL bar); opening a URL restores the browser if collapsed; polish Command+Shift+B and COLLAPSE/RESTORE labels for open/shut. _(source: user request; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-preview-queue-renderer.js`, `prototype/scripts/test-browser-collapse-renderer.js`, `prototype/README.md`)_
- [x] Phase B — Pins and favorites for documents/URLs linked to local storage (e.g. `~/.chromux/favorites.json`): pin/favorite from browser toolbar or queue item; favorites open into the active session's paired browser; global favorites for v1. _(source: user request)_
  - Tests first: add `prototype/scripts/test-favorites-renderer.js` and its `prototype/package.json` script; cover initial load, URL normalization/deduplication, toolbar and queue-item pin/unpin, global visibility across sessions, opening into the active paired browser, and restoring a collapsed browser before navigation.
  - Persistence: add bounded IPC methods in `prototype/main.js` and `prototype/preload.js` to read and atomically replace `~/.chromux/favorites.json`; validate records as global v1 `{ url, title, createdAt }` entries, reject unsupported protocols, and recover safely from absent or malformed files without exposing arbitrary filesystem access to the renderer.
  - UI and behavior: update `prototype/renderer/renderer.js` and `prototype/renderer/styles.css` with a browser-toolbar favorite toggle, queue-row pin action, and global favorites picker; opening a favorite must use the existing approval/open path for the active session and restore its browser when collapsed.
  - Documentation and release: document storage, privacy, and cleanup behavior in `prototype/README.md`, `prototype/docs/privacy-and-local-data.md`, and `prototype/docs/troubleshooting.md`; bump the minor app version and update `RELEASES.md`.
  - Validation: run the new favorites renderer test plus preview-queue, browser-collapse, shortcuts, and capture-record regression tests; syntax-check mutated JavaScript and inspect malformed-file/protocol handling adversarially before shipping.
- [x] Phase C — Saved projects with valid configs: store project cwd + start command; optional Start action when config is valid; on success queue the preview URL for the session (still user-approved open, no silent auto-navigate); use validated `package.json` scripts for v1 and defer devctl/`apps.json` until its schema is defined. _(source: user request; evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-projects-renderer.js`)_
- [x] Add a shared scale-to-fit viewer for all 36 fixed 1440×900 desktop concepts, preserve clean production routes and titles, move unchanged sources under generated `/designs/raw/`, and validate responsive presentation at desktop and narrow viewports. _(source: user request; evidence: `design-prototypes/viewer.html`, `scripts/build-design-viewers.js`, `scripts/test-design-viewer-browser.js`)_
- [x] Install managed updates immediately from an idle workspace without staging `UPDATE READY`, restart confirmation, or an empty restore snapshot, while retaining protected/manual flows otherwise. _(source: user request; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-update-queue-renderer.js`, `RELEASES.md`)_
- [x] Replace inert queued-update blocker focus with confirmed `EXECUTE` and confirmed `DISMISS` actions, while accepting the first macOS click on an inactive Chromux window. _(source: user report and correction; evidence: `prototype/main.js`, `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-update-queue-renderer.js`, `prototype/scripts/test-window-config.js`)_
