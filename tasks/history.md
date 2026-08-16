# Session History

## 2026-08-16 — Chromux Next v0.10.0 Situation Room experiment

- **User goal:** Build and ship a flag-gated operations-room interface that
  turns live runner approvals and structured questions into global,
  consequence-oriented strategy events without changing the secure runner
  protocol or the five saved standard interface approaches.
- **Changed files and purpose:** `chromux-next/src/main.ts` and package scripts
  propagate and smoke-test the ephemeral launch flag; `src/renderer.tsx`,
  `src/runner/situation-room.ts`, `src/ui/components.tsx`, and the Situation
  Room stylesheet implement the shell, pure queue projection, focus-contained
  event workflow, explicit non-backdrop deferral, and responsive visuals;
  deterministic fixtures plus unit/component/packaged scripts exercise
  ordering, counts, offered decisions, exact answer payloads, retry states,
  launch isolation, and visual states. README, UAT, release notes, version/lock,
  task queue, and this history entry own the 0.10.0 release boundary.
- **User-goal mapping:** The renderer collects all open-session interactions in
  chronological order; keys them by owning session and interaction; opens the
  oldest eligible event; keeps Later/Escape deferrals renderer-local; hides
  duplicate inline cards and native browser guests only in this mode; renders
  only contract-offered choices; requires one mutually exclusive answer per
  question; preserves answers and the event on failure; and advances only when
  authoritative runner state removes the resolved interaction. Luna findings
  and failures remain passive in the room.
- **Executable verification:** `npm run typecheck` passed. All 114 Vitest unit,
  component, contract, security, persistence, manager, and subprocess tests
  passed. Electron Forge packaging passed. Packaged baseline and explicit
  `--situation-room` launch smoke, two-launch runner restoration, and real
  browser-evidence smoke passed. Packaged visual qualification produced and
  visually reviewed 28 baseline plus 8 Situation Room standard/narrow captures
  covering approval, question, long overflow, deferred, reduced-motion, and
  empty states. `git diff --check` passed.
- **Skipped tests:** Manual live Codex approval/question UAT is documented in
  `chromux-next/docs/uat-0.10.0.md` but cannot be deterministic in the release
  harness. Windows/Linux packages, clean install, signing, and daily-driver
  proof remain the explicit successor cutover gate and do not block this macOS
  0.x prerelease.
- **Adversarial review:** A failure-oriented exact-diff review served as the
  equivalent gate because no repository quality-gate contract or reviewer lane
  exists and repository policy disallows unrequested subagents. It traced
  duplicate IDs across sessions, stale/resolved deferrals, new arrivals,
  offered-decision enforcement, incomplete/whitespace answers, free-form versus
  option exclusivity, repeated submission, synchronous protocol errors,
  successful state-removal races, backdrop/Escape behavior, native browser
  layering, focus restoration, restart semantics, preference persistence,
  narrow overflow, and reduced motion. The cross-session key collision finding
  was fixed and regression-tested; no blocking finding remains.
- **Residual risk and rollback:** Live Codex wording and unusually large
  normalized requests may expose copy or layout cases beyond deterministic
  fixtures; the retryable contract path remains covered. Roll back by removing
  prerelease `chromux-next-v0.10.0` and reverting the shipping commit. No IPC,
  persistence schema, legacy data, or stable update channel requires rollback.
- **Deploy status:** No manual deploy contract exists. The required deployment
  is the Git tag and GitHub prerelease; it must not become `/releases/latest`.
- **Next command:** Continue the active Chromux Next cutover-gate evidence work
  during the next product session.

## 2026-08-09 — Chromux Next v0.8.0 session browser and reviewed evidence

- **User goal:** Implement the next successor milestone: a session browser and
  reviewed evidence workflow.
- **Implementation:** Added main-owned per-session sandboxed browser guests,
  session-derived persistent partitions, renderer-measured/clamped geometry,
  explicit safe navigation, independently persisted last-page state, private
  page screenshots, bounded previews, and a serialized Awaiting Review →
  Approved/Rejected → Delivered workflow. Delivery targets immutable
  originating session provenance, occurs only after separate Approve and Send
  actions, becomes Delivered only after runner acceptance, and remains
  Approved after failure for retry.
- **Verification:** TypeScript, focused browser/view/workflow/recovery/IPC tests,
  the complete 106-test Vitest suite, packaged baseline and two-launch runner
  smokes, a real packaged two-session localhost browser/capture/review/delivery
  smoke, and 28-view packaged visual qualification cover the release boundary.
- **Scope and residual risk:** This milestone does not add browser automation,
  background capture, remote upload, or legacy-state import. Chromium history
  and cookies remain guest-owned, while Chromux persists only last safe page
  metadata and reviewed capture records. Stable cutover remains gated.
- **Rollback:** Remove prerelease `chromux-next-v0.8.0` and revert the shipping
  commit. The independent browser slice and artifacts can remain safely
  ignored by v0.7.1; legacy Chromux remains unchanged.
- **Ship manifest — User goal:** Implement and ship Chromux Next v0.8.0 session
  browser and reviewed evidence workflow.
- **Changed files:** `chromux-next/src/browser/contracts.ts`,
  `chromux-next/src/browser/workflow.ts`,
  `chromux-next/src/main/browser-view-service.ts`, `chromux-next/src/main.ts`,
  `chromux-next/src/ipc/{contracts,registry,bridge}.ts`,
  `chromux-next/src/preload.ts`, `chromux-next/src/persistence/local-store.ts`,
  `chromux-next/src/renderer.tsx`, `chromux-next/src/styles/legacy.css`,
  `chromux-next/tests/{browser-evidence,browser-view-service,ipc-contract,state-slice-recovery}.test.ts`,
  `chromux-next/scripts/{smoke-browser-evidence,visual-qualify}.mjs`,
  `chromux-next/package.json`, `chromux-next/package-lock.json`,
  `chromux-next/README.md`, `chromux-next/docs/{architecture,uat-0.8.0}.md`,
  `RELEASES.md`, `tasks/todo.md`, and `tasks/history.md`.
- **Per-file purpose and user-goal mapping:** Browser contracts and workflow own
  bounded persisted session/evidence state and the serialized human review
  gate; the browser-view service owns session partitions, safe navigation,
  popup denial, provenance-stable capture, and guest lifecycle; main/IPC/preload
  expose only validated operations and route approved evidence to the exact
  runner session; LocalStore adds an independently recoverable private slice;
  renderer/styles provide the responsive session browser and evidence rail and
  hide guests beneath dialogs; tests and packaged scripts cover those trust and
  lifecycle claims; metadata, architecture, UAT, release, and task documents
  define v0.8.0 and its rollback boundary.
- **Tests run:** `npm run verify` passed TypeScript, all 106 Vitest tests,
  Electron Forge packaging, baseline packaged smoke, two-launch/two-session
  restoration smoke, and the real packaged browser-evidence smoke. The latter
  served two distinct localhost pages, created two actual `WebContentsView`
  guests, captured a real PNG, returned a bounded preview, approved it, and
  delivered it through the fixture app-server. `npm run visual:packaged --
  /private/tmp/chromux-next-0.8.0-final-visual` produced 28 views; standard and
  820px Browser captures were visually inspected for clipping and hierarchy.
  `git diff --check` passed.
- **Skipped tests:** Windows/Linux packaging and real-device clean-install UAT
  remain part of the explicit successor cutover gate, not this macOS prerelease
  milestone. Public-internet browsing was not used because the deterministic
  real-HTTP localhost packaged smoke exercises the same Electron navigation and
  capture boundary without network or credential variability.
- **Adversarial review:** A failure-oriented changed-file audit was used as the
  skill-permitted equivalent review because repository policy disallows an
  unrequested reviewer subagent. It traced renderer-spoofed session IDs and
  bounds, unsupported schemes, script popups, cross-session storage, navigation
  races during capture, malformed/future slices, oversized previews, approval
  bypass, duplicate delivery, delivery failure, closed sessions, overlay
  hiding, stale preview images, and source/package version drift. Findings fixed
  before ship were popup-triggered navigation, provenance drift during capture,
  custom-scheme URL rewriting, stale preview display, and a packaged capture
  smoke that initially attempted capture from a hidden native guest.
- **Residual risk:** The packaged smoke verifies native Chromium on this Apple
  Silicon host only. Windows/Linux guest composition and clean-install behavior
  remain unproven until the cutover gate runs; users on those platforms would
  first notice incorrect guest geometry or unavailable capture. Evidence files
  are intentionally retained locally even when their oldest bounded metadata
  ages out, so future retention controls remain separate product work.
- **Next command:** Begin the active Chromux Next cutover gate with the macOS
  daily-driver and clean-install evidence run, then use those findings to scope
  the next successor prerelease.

## 2026-08-05 — Chromux Next v0.4.1 runner hardening

- **User goal:** Complete the runner-first release gate with deterministic
  subprocess fixtures, lifecycle cleanup, comprehensive protocol/Luna failure
  coverage, and a packaged two-session restoration smoke; ship v0.4.1 only on
  the Chromux Next prerelease channel.
- **Changed files and per-file purpose:** `chromux-next/src/runner/protocol.ts`
  owns incremental JSONL decoding, injectable production parameters, exact-once
  pending rejection, bounded recovery, version/request timeouts, and awaited
  TERM/KILL shutdown. `attention.ts` applies the same bounded subprocess
  framing and cleanup to Luna; `manager.ts` cleans up failed initialization,
  independently restores eligible sessions, and preserves bounded/redacted
  last-good attention. `main.ts` awaits shutdown and owns explicit-only runner
  smoke injection/restoration assertions. `forge.config.ts` packages the
  fixture as a launchable resource. `fixtures/subprocess-fixture.cjs`,
  `runner-protocol.integration.test.ts`,
  `luna-subprocess.integration.test.ts`, `runner-manager.test.ts`, and
  `scripts/smoke-runner-restoration.mjs` cover subprocess and wire behavior.
  Package metadata/lock, README, architecture, v0.4.1 UAT, `RELEASES.md`,
  `tasks/todo.md`, and this history entry own the prerelease and gate record.
- **User-goal mapping:** Arbitrarily fragmented responses, notifications, and
  server requests decode incrementally; malformed, schema-invalid, oversized,
  wrong-ID, timed-out, incompatible, authentication, early-exit, and missing
  CLI paths fail closed and clean up. Recovery observes the configured
  1/2/5-second production order and exhaustion bound. Every open persisted
  thread resumes independently without a turn; closed and individually failed
  sessions remain isolated. Command, network, amendment, file, question,
  decline/cancel, unknown, and cross-session approval behavior has exact
  app-server response assertions. The packaged two-launch smoke retains two
  original thread IDs, distinct drafts, group membership, and selection while
  proving no turn request and both fixture-child exits.
- **Executable verification:** `npm run typecheck` passed. The complete Vitest
  suite passed 76/76 tests across 15 files, including 15 real app-server and 6
  real Luna subprocess cases. Electron Forge packaged macOS arm64
  successfully. `npm run smoke:packaged` passed. The new
  `npm run smoke:runner-restoration` passed both packaged launches and its
  process/request invariant audit. `git diff --check` passed.
- **Adversarial review:** Exact-diff, failure-order, and packaging-boundary
  review checked fragment/inter-message ordering, UTF-8 byte limits,
  truncated lines, schema failures, unknown/wrong IDs, pending settlement,
  timer cancellation, repeated stop, restart exhaustion, version hangs,
  initialization/model cleanup, TERM/KILL races, stale evidence, redaction,
  last-good retention, restore isolation, smoke-only injection, and quit
  ordering. The review found and fixed a canceled-restart promise deadlock,
  duplicate truncated-line crash emission, fixture message interleaving, an
  `app.asar` executable boundary, and a false-positive second-launch restore
  check that trusted persisted idle state before model initialization.
- **Skipped checks, warnings, and residual risk:** Windows and Linux packaging
  remain part of the separate cutover gate and were not attempted on macOS.
  Visual qualification was skipped because no renderer layout or styling
  changed; both packaged smokes exercise the production main/preload/renderer
  boundary. `scripts/audit-task-docs.mjs` and `tasks/roadmap.md` are absent, so
  their checks are unavailable. `npm install --package-lock-only` reported 26
  existing dependency advisories; the lock diff changes only the app version,
  so dependency upgrades are intentionally outside this lifecycle release.
  Residual risk is platform-specific child signal behavior beyond macOS; the
  injected deterministic lifecycle suite covers Node semantics and the
  Windows/Linux package check remains an explicit cutover item.
- **Rollback note:** Revert the v0.4.1 shipping commit and publish a newer
  corrective Chromux Next prerelease. No persisted schema, renderer IPC, legacy
  metadata, or stable update channel changed.
- **Deploy status:** Deploy skipped because neither `deploy.md` nor
  `tasks/deploy.md` exists; the GitHub prerelease is the only shipping channel.
- **Ownership boundary:** The worktree was clean on `main` at start and all
  changed files belong to this v0.4.1 gate. `prototype/package.json` and all
  legacy Chromux behavior remain unchanged.
- **Next command:** Begin successor-native project onboarding and settings,
  the next active item in `tasks/todo.md`.

## 2026-08-03 — Chromux v0.80.2 Plan-handoff Working state

- **User goal:** Make Codex 0.146's one-key Plan-mode implementation handoff
  immediately display Working without duplicating PTY input, polluting
  Composer, or changing non-implementation numeric choices.
- **Changed files and per-file purpose:** `prototype/renderer/renderer.js`
  resolves the active numeric chooser's selected label, recognizes bounded
  Plan-handoff choices, and carries an internal logical-submission flag through
  the existing user-input event seam. `prototype/renderer/attention.js` accepts
  that flag as an alternative to CR/LF for turn transition only. The Composer
  real-Electron regression adds the current three-option fixture and
  cross-surface state assertions. Package metadata/lock, `RELEASES.md`,
  `tasks/todo.md`, and this entry own v0.80.2 bookkeeping.
- **User-goal mapping:** Options 1 and 2 enter completion-ready Pending,
  refresh recent activity, clear stale turn preview candidates, and project
  the existing Working presentation across tabs and Threads. The original
  digit follows the unchanged single PTY write. Option 3, permission choices,
  ordinary Plan questions, numbered prose, and non-Codex terminals retain
  their prior behavior and Composer-shadow policy. No public API, IPC,
  persistence schema, or migration changed.
- **Executable verification:** The new regression first failed against
  v0.80.1 with an unchanged Unknown turn, then passed after implementation.
  Composer, tab-activity, turn-signal, and session-rail focused suites passed;
  changed JavaScript passed `node --check`; `git diff --check` passed. The
  complete serial `npm test` matrix passed every renderer, Electron, service,
  platform, packaging-policy, Windows artifact, and signing-configuration
  suite.
- **Adversarial review:** The referenced `docs/quality-gate-contract.md`,
  `quality-sweep`, and `expert-review` are absent, so an exact-diff and
  failure-oriented input-path review served as the equivalent gate. It checked
  the live-Codex/visible-footer/selected-option bounds, multi-question chooser
  proximity, Plan prompt and label gates, options 1/2/3, permission and Plan
  questions, numbered prose, non-Codex input, shadow clearing, exactly one PTY
  writer, preview cleanup, recent sorting, generation advance, normal later
  activity/completion, and the untouched exact `/clear` text barrier. No
  blocking finding remains.
- **Warnings, skipped tests, and residual risk:** One session-rail run failed
  only while three real-Electron suites competed in parallel for window
  geometry; it passed immediately in isolation and again within the complete
  serial matrix. No packaged-app smoke was required because this renderer-only
  patch has real-Electron production-path coverage and does not change main
  process, preload, packaging, or persistence. Future Codex copy or layout
  changes outside the bounded fixture may require parser fixture updates.
- **Rollback note:** Revert the v0.80.2 shipping commit and publish a newer
  corrective release; no persisted data or external contract needs rollback.
- **Deploy status:** Deploy skipped because neither `deploy.md` nor
  `tasks/deploy.md` exists. The GitHub Release is Chromux's required update
  channel.
- **Ownership boundary:** The worktree was clean at start, and every changed
  file belongs to this scoped implementation.
- **Next command:** Continue the next unblocked Chromux product task or begin
  the pending daily-driver adoption record during the next real work session.

## 2026-08-03 — Chromux v0.80.1 Developer Inspect focus safety

- **User goal:** Stop the Developer Inspect session selector from flickering
  closed during live diagnostics refreshes, preserve its independent inspected
  session, and resume active-terminal hotkeys after a committed selection.
- **Changed files and per-file purpose:** `prototype/renderer/renderer.js`
  extracts keyed selector synchronization, skips every selector mutation while
  focused, reconciles only changed option state after blur, and restores active
  xterm focus after valid selection. The attention-diagnostics real-Electron
  test covers focused mutation observation, native selection state, timer and
  event refreshes, window focus, session lifecycle/order deferral, fallback,
  terminal focus, and hotkey guards. Package metadata/lock, `RELEASES.md`,
  `tasks/todo.md`, and this entry own v0.80.1 bookkeeping.
- **User-goal mapping:** Diagnostics groups and events continue rendering while
  the selector is focused, but option addition, removal, ordering, labels,
  disabled state, and programmatic selection wait until focus leaves. Closing
  an inspected session still updates internal inspection immediately using the
  active-or-first fallback. Valid native change blurs the selector, focuses the
  active terminal, and coalesces deferred diagnostics reconciliation without
  changing global shortcut policy or activating the inspected session.
- **Executable verification:** The new focused-selector regression failed
  against v0.80.0 before implementation and passed afterward.
  `npm run test:attention-diagnostics`, `npm run test:dev-mode`, JavaScript
  syntax checks, and `git diff --check` passed. The complete `npm test` matrix
  passed every renderer, Electron, service, platform, packaging-policy,
  Windows artifact, and signing-configuration suite. macOS arm64 packaging
  completed; bundle version/icon metadata, packaged settings persistence, and
  the isolated packaged `--smoke --dev-mode` executable all passed.
- **Adversarial review:** The referenced `docs/quality-gate-contract.md`,
  `quality-sweep`, and `expert-review` are absent, so an exact-diff and
  failure-oriented event-order review served as the equivalent gate. It
  checked focused no-op behavior for every selector property, background
  diagnostics continuity, queued addition/removal/exit/rename/reorder,
  inspected-session closure with and without an active session, stale native
  selection preservation, invalid values, blur/change coalescing, active versus
  inspected independence, terminal focus, editable-only shortcut guards, and
  empty-session disabling. No blocking finding remains.
- **Warnings, skipped tests, and residual risk:** `electron-packager` emitted
  its existing secondary `.icon`-format warning while retaining the configured
  `electron.icns`; bundle inspection and packaged execution passed. No physical
  click was injected into the native macOS popup because ordinary automated
  Electron windows intentionally remain hidden; the real-Electron test drives
  the same focus, value, change, blur, xterm-focus, and shortcut paths and
  observes all selector DOM mutations. Native AppKit presentation remains the
  small residual platform risk.
- **Rollback note:** Revert the v0.80.1 shipping commit and publish a newer
  corrective release; no public API, IPC, persistence schema, or migration
  changed.
- **Deploy status:** Deploy skipped because neither `deploy.md` nor
  `tasks/deploy.md` exists. The GitHub Release is Chromux's required update
  channel.
- **Ownership boundary:** The worktree was clean at start, and every changed
  file belongs to this scoped implementation.
- **Next command:** Continue the next unblocked Chromux product task or begin
  the pending daily-driver adoption record during the next real work session.

## 2026-08-03 — Chromux v0.80.0 Threads icon actions

- **User goal:** Replace the Threads 2×2 text-action grid with compact icon
  controls, keep the card/header as ordinary Open, limit Dismiss to supported
  reasons, preserve Snooze everywhere, and retire new Done triage without
  breaking saved Done records.
- **Changed files and per-file purpose:** `prototype/renderer/renderer.js`
  centralizes accessible SVG action construction, specialized-action and
  dismissibility policy, stable selectors, keyboard routing, and legacy Done
  compatibility. `prototype/renderer/styles.css` supplies right-aligned square
  geometry and hover, active, focus, and theme-variable states. Session-rail,
  turn-signal, update-queue, Dock-badge, theme, and native Streak tests cover
  behavior and presentation. README, troubleshooting, and privacy docs explain
  the new controls and persisted-data contract. Package metadata/lock,
  `RELEASES.md`, `tasks/todo.md`, and this entry own v0.80.0 bookkeeping.
- **User-goal mapping:** Ordinary session opening stays on the card and
  Enter/`o`; only Queue, Git-conflict, and system operations render the arrow
  icon. Input, completion, delivery, and dismissible system items render ×;
  permission, authentication, rate-limit, tool-failure, Queue, and conflict do
  not. Every reason renders the clock icon and retains Snooze presets.
  Keyboard `d` targets only a present Dismiss icon, so it is a no-op on
  protected reasons. The sole writer now creates only Snooze records, while
  the unchanged visibility filter continues reading legacy `state: "done"`
  records until the reopen token changes.
- **Executable verification:** Changed JavaScript passed `node --check` and
  `git diff --check`. Focused session-rail, turn-signal, update-queue, theme,
  native Streak click-target, and Dock-badge suites passed. The complete
  `npm test` matrix passed every renderer, Electron, service, platform,
  packaging-policy, Windows artifact, and signing-configuration suite.
- **Adversarial review:** The referenced `docs/quality-gate-contract.md`,
  `quality-sweep`, and `expert-review` are absent, so an exact-diff and
  interaction-policy review served as the equivalent gate. It checked every
  attention type, ordinary-versus-specialized Open, historical permission
  dismissal, all keyboard routes, stale text selectors, legacy reopen tokens,
  native pointer bounds, SVG accessibility, tooltip/label coverage, 24px
  geometry, narrow Streak widths, all theme modes, and unchanged persistence
  schema. It added explicit `o`, complete preset, non-dismissible `d`, and
  legacy Done assertions; no blocking finding remains.
- **Warnings, skipped tests, and residual risk:** The complete suite's first
  Dock-badge rejection fixture missed its asynchronous Settings guidance, then
  passed the runner's built-in one-time retry and had already passed directly;
  this timing-only warning is accepted without unrelated changes. Packaging
  and installer creation are skipped because this renderer/docs change adds no
  packaged resource or native dependency; real-Electron tests exercise the
  production DOM, CSS, pointer, and keyboard paths. Native `title` tooltips use
  Chromium timing and presentation, while their text and action targets are
  asserted deterministically.
- **Rollback note:** Revert the v0.80.0 shipping commit and publish a newer
  corrective release; no public API, IPC, restore schema, or migration changed.
- **Deploy status:** Deploy skipped because neither `deploy.md` nor
  `tasks/deploy.md` exists. The GitHub Release is Chromux's required update
  channel.
- **Ownership boundary:** The worktree was clean at start, and every changed
  file belongs to this scoped implementation.
- **Next command:** Continue the next unblocked Chromux product task or begin
  the pending daily-driver adoption record during the next real work session.

## 2026-08-03 — Chromux v0.79.3 terminal viewport preservation

- **User goal:** Preserve the exact visible terminal scrollback row across
  immediate native-scroll session switches and Chromux window focus changes.
- **Changed files and per-file purpose:** `prototype/renderer/renderer.js`
  synchronously maps the native xterm viewport to a clamped normal-buffer row,
  snapshots the active session before it is hidden and on window blur, and
  keeps deferred work limited to rendering the Skip to bottom control.
  `prototype/scripts/test-terminal-scroll-bottom-renderer.js` covers immediate
  downward and upward native-scroll switches plus blur/refit stability with
  real xterm. Package metadata/lock, `RELEASES.md`, `tasks/todo.md`, and this
  entry own v0.79.3 release and task bookkeeping.
- **User-goal mapping:** Activation fits consume the synchronously saved
  physical row and derive bottom-following from that row instead of potentially
  stale `buffer.viewportY`. Alternate-screen handling, smooth scrolling,
  inactive output, browser layout fitting, Composer behavior, and persistence
  remain unchanged.
- **Executable verification:** The red-phase terminal suite failed on the
  blur/refit race before implementation. After the fix,
  `npm run test:terminal-scroll-bottom-renderer`, startup-loader,
  session-tab-groups, session-rail, Composer, and browser-collapse renderer
  suites passed, followed by the complete `npm test` matrix including macOS
  window behavior and Windows platform, setup, signing-configuration, and
  artifact checks.
- **Skipped tests:** Packaging and installer creation are skipped because this
  renderer-only patch changes no packaged resource or native dependency; the
  complete real-Electron suite exercises the production renderer and xterm.
  Deploy is skipped because neither `deploy.md` nor `tasks/deploy.md` exists.
- **Adversarial review:** Exact-diff review checked normal/alternate buffer
  boundaries, zero/no-scrollback geometry, fractional native positions,
  clamping, bottom-following, activation ordering, blur ordering, and deferred
  disposal. One session-rail animation assertion failed only while five
  Electron suites ran concurrently; its isolated rerun and complete-suite run
  passed, so the timing-only result is accepted without unrelated changes.
- **Residual risk:** Native scroll pixels are intentionally rounded to the
  nearest logical xterm row; sub-row pixel offsets are not meaningful terminal
  content positions. Platform compositor timing beyond the real-Electron race
  coverage remains low risk.
- **Rollback note:** Revert the v0.79.3 shipping commit and publish a newer
  corrective patch; no IPC, public API, persisted schema, or migration changed.
- **Ownership boundary:** The worktree was clean at start, and every changed
  file belongs to this scoped patch.
- **Next command:** Continue the next unblocked Chromux product task or begin
  the pending daily-driver adoption record during the next real work session.

## 2026-07-30 — Chromux v0.76.1 Developer Inspect dropdown stability

- **User goal:** Prevent one-second and event-driven diagnostics refreshes from
  disrupting the open native Developer Inspect selector while preserving
  independent selection, session ordering, lifecycle updates, and fallback.
- **Changed files and per-file purpose:** `prototype/renderer/renderer.js`
  reconciles options by session ID and exposes narrow Electron-test helpers.
  `prototype/scripts/test-attention-diagnostics-renderer.js` covers node
  identity, timer/event refreshes, selection, ordering, lifecycle changes, and
  both fallback branches. Package metadata/lock, `RELEASES.md`,
  `tasks/todo.md`, and this entry own v0.76.1 release bookkeeping.
- **User-goal mapping:** Surviving options are updated and reordered in place;
  only new or closed sessions add or remove nodes. Selection and disabled state
  are applied after reconciliation. Diagnostics groups, events, relative ages,
  and the one-second refresh remain unchanged.
- **Executable verification:** The red-phase targeted renderer test failed on
  replaced node identity, then `npm run test:attention-diagnostics`,
  `npm run test:dev-mode`, JavaScript syntax checks, the direct session-rail
  and Favorites renderer tests, and the complete `npm test` matrix passed. A
  final-diff rerun passed through resource UI in-sandbox; after its Electron
  handoff stalled, the restore test and remaining registered suffix passed
  outside the sandbox.
- **Skipped tests:** App packaging and visual screenshot comparison are not
  useful for this DOM-lifecycle-only fix; real Electron coverage exercises the
  native selector DOM and actual one-second timer. Deploy is skipped because
  neither `deploy.md` nor `tasks/deploy.md` exists.
- **Adversarial review:** Failure-oriented exact-diff review checked stale-node
  removal, session ordering, exited-label mutation, selection assignment
  timing, active/first fallback, unchanged refresh cadence, and unrelated
  changes. It added explicit ordering and no-active fallback assertions. The
  full suite's retry wrapper observed one unrelated session-rail focus-preview
  failure in the first run and one unrelated Favorites deduplication failure in
  the final-diff prefix; their immediate retries and separate direct reruns all
  passed, so the transients are accepted without changing unrelated code.
- **Residual risk:** Platform-native select-menu behavior itself is not
  screenshotable in headless Electron, but node identity is the browser
  contract that keeps an already-open native menu intact and is exercised
  across both refresh sources.
- **Rollback note:** Revert the v0.76.1 shipping commit and publish a newer
  corrective release; no persisted data, migration, API, or interval changed.
- **Ownership boundary:** The worktree was clean at start, and every changed
  file belongs to this scoped patch.
- **Next command:** Run Developer Mode and manually hold the Inspect dropdown
  open across several one-second refreshes if native macOS confirmation is
  desired.

## 2026-07-30 — Chromux v0.76.0 Contextual Sidebar Lab

- **User goal:** Build and ship a standalone developer-only Electron lab that
  compares the current Threads sidebar with nine market-inspired alternatives
  over identical synthetic data, captures task-level evidence, and recommends
  a synthesized production direction without changing production Threads.
- **Changed files and per-file purpose:** `prototype/sidebar-lab-main.js` and
  `prototype/sidebar-lab-preload.js` own the temporary profile and three
  lab-local IPC methods. `prototype/sidebar-lab/{fixtures,variants,core}.js`
  own the 18-session/four-project fixture, six scenarios, ten layout models,
  transitions, counterbalancing, scoring, aggregation, sanitization, and
  recommendation. `prototype/sidebar-lab/{index.html,styles.css,model-browser.js,renderer.js}`
  own Gallery/Study rendering, responsive/reduced-motion behavior, search,
  filters, history, keyboard actions, telemetry, ratings, and reset flow.
  `prototype/scripts/test-sidebar-lab-{core,renderer,smoke}.js` and
  `run-sidebar-lab-uat.js` own deterministic, Electron, responsive, export,
  and no-model matrix coverage. `prototype/docs/sidebar-lab*.md`,
  `prototype/docs/testing/sidebar-lab-*`, and `prototype/README.md` document
  reproduction, sources, limits, and archive the report/screenshots.
  `prototype/package.json`, lockfile, `RELEASES.md`, `tasks/todo.md`, and this
  entry own commands, v0.76.0 metadata, release notes, and bookkeeping.
- **User-goal mapping:** Gallery renders all ten concepts over stable fixture
  identities. Study uses a seeded variant order, deterministic status churn,
  six task flows, behavioral metrics, three flow ratings, and clean resets.
  Schema-v1 export allowlists identifiers/metrics, reports task and overall
  medians plus spatial churn, and recommends a synthesis instead of blindly
  selecting the aggregate leader. The separate main/preload imports no
  production session, preference, PTY, Git, or renderer state.
- **Tests run:** `npm run test:sidebar-lab` passed core, renderer-contract,
  desktop Electron, 760px Electron, reduced-motion, isolation, identity, and
  sanitized-export checks. `npm run uat:sidebar-lab` generated all 60
  deterministic variant/scenario records. `npm run
  test:session-rail-renderer` passed. The exact final diff passed `npm test`,
  JavaScript syntax checks, `git diff --check`, version metadata validation,
  and visual inspection of the Gallery and Study PNGs.
- **Skipped tests:** No live model or real user-session study was run because
  the accepted scope requires synthetic fixtures and a no-model UAT; human
  usability evidence is explicitly required before production adoption. App
  packaging was skipped because this developer entry point ships as source
  inside the existing prototype and the complete Electron suite exercises it.
  Deploy was skipped because neither `deploy.md` nor `tasks/deploy.md` exists.
- **Adversarial review:** Used the quality-gate contract's permitted
  failure-oriented equivalent: exact-diff ownership scan, production-file
  zero-diff check, hostile report-field unit input, fixture-path scan,
  Node/browser layout parity checks, desktop/narrow Electron isolation,
  complete regression suite, and visual QA. Findings fixed were a hidden Study
  concept being counted as an eleventh Gallery card, capture racing Chromium
  paint, author CSS overriding the `hidden` attribute, project IDs appearing
  as Current Hybrid labels, Current Hybrid priority groups following recency
  instead of the production order, missing Linear triage and Claude split
  secondary surfaces, and two completed fixture rows with invalid agent names.
- **Residual risk:** The deterministic UAT proves instrumentation and report
  plumbing, not comparative usability. A human evaluator must run Study mode
  before using its recommendation. The Node and browser layout implementations
  are duplicated because the sandboxed renderer cannot `require`; parity tests
  cover placement/identity, and `npm run test:sidebar-lab` is the first check
  if either model changes.
- **Rollback note:** Revert the v0.76.0 shipping commit and publish a newer
  corrective release. Production Threads requires no state migration or
  rollback because its files and contracts are unchanged.
- **Ownership boundary:** The worktree was clean at start. Every changed or
  added file belongs to this feature; no pre-existing user changes are included.
- **Next command:** Run `npm run sidebar-lab` and collect the first internal
  human Study report before planning a production sidebar candidate.

## 2026-07-29 — Chromux v0.74.1 reliable Codex activity indicators

- **User goal:** Restore immediate Codex working feedback without conflating
  internal pending state with provider-confirmed Working, accept authoritative
  completion when no start heuristic fired, retain exact `/clear` safety, and
  prove the lifecycle with an upgraded isolated Activity Lab before publishing
  the patch release.
- **Changed files:** `prototype/renderer/attention.js` owns pending projection,
  completion acceptance, and exact-clear barriers;
  `prototype/renderer/renderer.js` supplies the canonical rendered/shadow
  submitted line; `prototype/main.js` accepts whitespace-bearing Codex notify
  JSON in the generated v1 fallback; `prototype/activity-lab/runner.js`,
  `prototype/scripts/run-activity-lab-uat.js`, and the fake CLI fixture own
  production-like PTY submission, trust/update/config handling, OSC/reducer
  exercise, notify diagnostics, resident cleanup, filtered metadata-only
  diagnosis, and configured-binary provenance. Activity, notifier, turn,
  indicator, Threads, and diagnostics tests carry the regressions.
  `docs/testing/activity-lab-uat-0.74.1.md` archives sanitized live evidence.
  Package metadata/lock, `RELEASES.md`, `tasks/todo.md`, and this entry own the
  v0.74.1 release boundary.
- **User-goal mapping:** Enabled indicators project pending as a spinner while
  state remains pending, update-unsafe, and outside the Working section.
  Ordinary rendered, native, and Composer submissions leave the completion
  barrier open; only exact trimmed `/clear` arms it. Authenticated v2 and
  generated v1 completion can therefore finish pending directly, producing
  Idle when active and Completed when backgrounded. Existing generation,
  timestamp, session/token, event-id/sequence, focus, cancellation, exit, and
  disabled-indicator contracts remain unchanged.
- **Executable verification:** The requested focused Activity Lab, runner,
  Electron smoke, Codex notifier, turn-signal, tab-indicator, session-rail,
  diagnostics, and update-queue suites passed. Changed JavaScript syntax
  checks passed. The complete registered `npm test` matrix passed. Source
  `npm run smoke` passed. `npm run package:mac` produced the arm64 app; both
  plist version fields are `0.74.1`, the bundle references `electron.icns`,
  and the packaged executable returned `SMOKE_OK`. The opt-in five-scenario
  live UAT passed against an exact temporary Codex 0.145.0 installation with
  no timeouts, stale spinners, or cross-session leakage; every normal scenario
  completed, cancellation stopped, and idle stayed idle.
- **Skipped tests:** Physical Windows/WSL UI qualification remains covered by
  the complete deterministic Windows platform/setup matrix because the change
  is renderer-domain and lab-only process orchestration. No production deploy
  was run because neither `deploy.md` nor `tasks/deploy.md` exists. The global
  CLI advanced to 0.146.0 during testing, so the planned 0.145.0 gate used a
  verified temporary npm prefix rather than mutating the installed CLI.
- **Adversarial review:** Applied
  `.agents/skillpacks/docs/quality-gate-contract.md` through an exact-diff,
  failure-oriented review of ordinary/direct/rendered/Composer submissions,
  ambiguous autocomplete, `/clear` variants, wrong-session and duplicate
  envelopes, active/background consumption, disabled indicators, update
  safety, concurrent runs, cancellation, process exit, temporary trust,
  version drift, update prompts, shell topology, notify invocation/delivery,
  sanitization, and cleanup. Findings fixed were rendered `/clear` being lost
  at Enter, whitespace-bearing notify JSON missing the v1 guard, fake compact
  JSON hiding that bug, direct lab startup bypassing PTY submission, prompt
  text landing in trust/update choosers, version-specific composer chrome,
  configured-binary provenance drift, and empty sanitized session IDs.
- **Residual risk:** Codex 0.145.0 invoked the live notify hook, matched its
  payload, and successfully wrote `/dev/tty`, but the lab's outer node-pty did
  not observe that OSC; live stop evidence therefore came from the same
  production title-idle reducer used by Chromux. The fake resident TUI requires
  the complete generated-v1 notify → production OSC parser → pending reducer
  path, and renderer coverage separately proves authenticated v2 and generated
  v1 pending completion. If future Codex versions remove title-idle evidence,
  rerun `npm run test:activity-lab` and the opt-in UAT before changing fallback
  order.
- **Accepted warning:** Electron Packager emitted its established optional
  `.icon` probe warning; the produced app contains and references the `.icns`
  icon and passed packaged smoke.
- **Rollback note:** Revert the v0.74.1 shipping commit and publish a newer
  corrective patch. Do not move or delete the release tag as an implicit
  rollback.
- **Ownership boundary:** The worktree was clean at start. Every modified or
  added file belongs to this release; generated `prototype/dist/` output and
  the temporary pinned CLI/report files remain untracked or outside the
  repository and are not in the commit.
- **Next command:** Complete the outstanding Vercel public OAuth registration
  and live deployment proof recorded in `tasks/todo.md`.

## 2026-07-29 — Chromux v0.74.0 session-first Threads and dedicated Git sessions

- **User goal:** Resolve the existing merge conflict without dropping either
  side, then implement and publish the accepted plan that restores Threads as
  a session-first inbox and replaces the embedded Git mutation drawer with
  reusable dedicated worktree sessions.
- **Changed files:** `.github/workflows/windows-release.yml`,
  `.github/workflows/windows.yml`, `RELEASES.md`, `prototype/README.md`,
  `prototype/git-worktree-service.js`, `prototype/main.js`,
  `prototype/package.json`, `prototype/package-lock.json`,
  `prototype/preload.js`, `prototype/renderer/index.html`,
  `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`,
  `prototype/scripts/test-composer-renderer.js`,
  `prototype/scripts/test-full-browser-composer-renderer.js`,
  `prototype/scripts/test-git-worktree-service.js`,
  `prototype/scripts/test-restore-session-identity.js`,
  `prototype/scripts/test-session-rail-renderer.js`,
  `prototype/scripts/test-streak-attention-click-targets-renderer.js`,
  `tasks/todo.md`, and this history entry. The workflow files are the
  already-reviewed Node 24 action updates integrated from current
  `origin/main`. The preceding
  conflict-resolution commit also reconciles the user-owned `RELEASES.md`,
  `tasks/history.md`, and `tasks/todo.md` records while preserving both source
  lines.
- **Per-file purpose:** Renderer markup, styles, and logic own the exclusive
  Threads ranking, accurate counts, searchable Git navigator, dedicated
  worktree-session lifecycle, and bounded unsent Composer inserts. The
  integrated workflows retain the primary branch's current artifact runtimes.
  Main and preload retain only read-only Git observation/catalog/forget
  bridges and add schema-v11 restore sanitation; the Git service removes
  mutation methods. Renderer/service/restore tests prove the changed behavior,
  the Streak fixture keeps native pointer verification in a visible window,
  and the two Composer harnesses retain their source contracts. Package
  metadata, docs, release notes, and task records advance and explain v0.74.0.
- **User-goal mapping:** Every live session renders in exactly one highest
  priority section and carries all its reasons there; empty priority sections
  disappear and All Sessions excludes ranked sessions. Ordinary worktree
  obligations stay in Git, while only live-associated conflicts enter Action
  Required and open the same canonical worktree session. Git rows expose
  branch/status/divergence/age/session context; selection inherits the newest
  associated agent or Codex, preserves reused drafts and terminal state, and
  never auto-submits. Restore metadata is bounded and exact-path matched.
- **Tests run:** `node --check` passed for changed application and test
  JavaScript. Focused `npm run test:git-worktree-service`,
  `npm run test:session-rail-renderer`,
  `npm run test:restore-session-identity`,
  `npm run test:composer-renderer`, and
  `npm run test:full-browser-composer-renderer` passed. The complete
  `npm test` prototype matrix and source `npm run smoke` passed. Final
  conflict-triage and stale-selection review fixes passed the affected
  session-rail renderer suite again. `npm run package:mac` produced the arm64
  app, both packaged plist version fields reported `0.74.0`, and the packaged
  executable returned `SMOKE_OK`. The renderer geometry fixture exercised
  large catalogs, narrow-sidebar containment, keyboard focus, and every
  supported appearance/mode. `git diff --check`, mutation-surface scans, and
  package/lock version checks passed.
- **Skipped tests:** Physical Windows/WSL terminal restoration and signed
  Squirrel install/update require the external Windows release machine. A
  live Vercel deployment was not run because this feature only prepares an
  unsent agent prompt and intentionally leaves the existing reviewed
  `VERCEL · READY` shipping action canonical; no `deploy.md` or
  `tasks/deploy.md` contract exists.
- **Adversarial review:** Applied
  `.agents/skillpacks/docs/quality-gate-contract.md` through a
  failure-oriented exact-diff review of section exclusivity, catalog scale,
  lifecycle reuse, restore trust boundaries, byte limits, DOM/IPC/service
  mutation remnants, and release topology. Findings fixed were projected
  conflict rows ignoring explicit Done/Snooze triage and a stale catalog
  selection refreshing without retrying its target. The review also changed
  agent inheritance to use the newest associated session even when its
  terminal has ended, as required by the accepted plan. Exact-merge validation
  exposed intermittent macOS native hover delivery in a background Electron
  window; the pointer fixture now requests a visible window and passed five
  consecutive repetitions without weakening its hover, geometry, or click
  assertions.
- **Residual risk:** Native Windows/WSL path canonicalization and session
  resurrection remain covered by contract fixtures rather than a physical
  machine. If a restored Git session fails to reuse there, first run
  `npm run test:restore-session-identity`, then inspect the sanitized runtime,
  distro, cwd, and worktree identity tuple before changing matching rules.
  Electron Packager also emits its established optional `.icon` probe warning
  while successfully producing the `.icns` bundle.
- **Rollback note:** Revert the v0.74.0 shipping commit and its preceding
  conflict-resolution commit, then publish a newer corrective release; do not
  delete user worktrees, drafts, or repository catalog data. Removing the tag
  or GitHub Release is a separate explicit release rollback.
- **Ownership boundary:** All current tracked modifications are listed above
  and belong to this release. No unrelated untracked or user-owned worktree
  changes are included, and the original conflict sides remain represented in
  history.
- **Next command:** After publication, complete the remaining live Vercel OAuth
  dashboard/UAT gate recorded in `tasks/todo.md`.

## 2026-07-28 — Chromux v0.69.2 Windows 10 and dependency-audit candidate

- **User goal:** Resolve the post-sync Windows 10/terminal-contrast stash
  conflicts originally based on published v0.67.0, preserve upstream work and
  the backup stash, apply safe npm audit fixes, then rebase the candidate over
  concurrent published work through v0.69.1 and ship it as v0.69.2.
- **Changed files:** `.github/workflows/windows.yml`, `README.md`,
  `RELEASES.md`, deletion of `docs/testing/windows-uat-0.62.0.md`, addition of
  `docs/testing/windows-uat-0.69.2.md`, `prototype/README.md`,
  `prototype/package-lock.json`, `prototype/package.json`,
  `prototype/platform/host.js`, `prototype/renderer/renderer.js`,
  `prototype/scripts/test-themes-renderer.js`,
  `prototype/scripts/test-windows-platform.js`, `tasks/history.md`, and
  `tasks/todo.md`.
- **Per-file purpose:** The workflow, package metadata, prototype guide,
  release-parser fixture, release notes, task gate, and UAT report align
  v0.69.2 Squirrel names and release checks. The root/prototype guides define
  Windows 10 build 19045+, updated WSL2, and retained per-distribution Projects
  Roots. `host.js` owns strict build parsing and the x64/build-19045 gate.
  `renderer.js` maps ANSI white/bright-white to readable light foregrounds and
  gives every live, preview, and test terminal a 4.5:1 minimum contrast ratio.
  The theme and Windows scripts combine upstream geometry/palette coverage with
  contrast, malformed-version, architecture, WSL1, boundary, and v0.69.2 asset
  assertions. The lockfile resolves `brace-expansion` 5.0.8 and `tar` 7.5.22.
  Task/history records retain upstream history and define the remaining gate.
- **User-goal mapping:** Windows x64 build 19045 and newer, including Windows
  11, is accepted; older, malformed, ARM64, and ia32 environments are rejected.
  Light-terminal Codex headers remain readable without changing dark palettes.
  Upstream v0.62-v0.69.1 release history and project-root behavior remain
  intact, the obsolete v0.62 UAT is replaced by the v0.69.2 gate, every
  resolved path is included, and `stash@{0}` remains available.
- **Tests run:** `npm install` rebuilt `node-pty`; changed JavaScript passed
  `node --check`; `npm run test:themes-renderer`,
  `npm run test:windows-platform`, `npm run test:ci:windows`,
  `node scripts/test-capture-packaging.js`, and `npm run smoke` passed, with
  `THEMES_RENDERER_OK`, Windows platform/CI success, packaging success, and
  `SMOKE_OK`. The complete registered matrix was run in sorted segments; every
  platform-applicable suite outside the host limitations below passed.
  `npm audit --omit=dev` reports zero vulnerabilities. Package/lock/version,
  single-gate, conflict-marker, staged-boundary, and `git diff --check` audits
  passed. After rebasing over concurrent v0.68.0-v0.69.1 changes, the changed
  JavaScript syntax checks, theme renderer, complete Windows CI command,
  capture-packaging test, production audit, and source smoke all passed again
  against the exact v0.69.2 tree.
- **Skipped tests:** Real Windows 10/WSL2 interaction and Squirrel
  install/update require the external build-19045 machine and remain the
  publication gate. On this Linux host the macOS-only capture integration
  correctly reports unsupported, the Prevent Sleep renderer lacks D-Bus, and
  project-launcher/session-rail/native-pointer geometry fixtures cannot obtain
  stable native display integration; their platform-neutral contracts,
  Windows CI subset, themes, packaging, and source smoke passed.
- **Adversarial review:** Applied
  `.agents/skillpacks/docs/quality-gate-contract.md` through a failure-oriented
  exact-diff review. It checked malformed and four-component Windows releases,
  build/architecture boundaries, WSL1 retention, every terminal constructor,
  all light/dark palettes, workflow/UAT/parser asset parity, one Windows todo,
  historical release preservation, package/lock resolution, secret-like text,
  conflict markers, unstaged changes, and stash retention. Findings fixed were
  stale v0.62/v0.67.1 asset references, a superseded UAT path in history, and
  the post-fetch version collision with concurrent v0.68.0-v0.69.1 releases;
  the candidate was retargeted to v0.69.2 without dropping their source,
  release notes, or tests. No production finding remains.
- **Residual risk:** Thirty-four development-only npm findings remain nested in
  Electron Forge/Squirrel with no compatible automatic fix; `npm audit fix
  --force` proposes an unsafe Forge downgrade and was rejected, while the
  production tree is clean. Physical ConPTY/WSL2, unsigned Squirrel lifecycle,
  SmartScreen behavior, and Windows caption/input geometry remain unverified
  until the real-machine UAT passes. The Linux-only display fixture failures
  above also remain environmental verification gaps, not accepted production
  behavior.
- **Rollback note:** Revert the v0.69.2 candidate commit to return to the prior
  published source; do not delete `stash@{0}`. If a release is later published,
  remove its tag/GitHub Release only as an explicit rollback operation.
- **Next command:** On a real Windows 10 Pro 22H2 build-19045 x64 machine, use
  `$guide` to complete `docs/testing/windows-uat-0.69.2.md`, build and hash the
  three Squirrel assets, then tag/publish only after a complete PASS.

## 2026-07-27 — Chromux v0.67.1 Windows 10 and terminal-contrast candidate

- Rebased the Windows 10 build-19045 compatibility and light-terminal contrast
  work onto the published v0.67.0 line without rewriting prior release history.
  Windows x64 build 19045 or newer is accepted, including Windows 11; older,
  malformed, ARM64, and ia32 environments remain rejected.
- Mapped ANSI white and bright-white to each light palette's readable foreground
  and enabled xterm's 4.5:1 minimum contrast ratio for live terminals, hover
  previews, and renderer test terminals. Updated WSL2 requirements, Windows
  packaging metadata, release fixtures, and the real-machine gate to v0.67.1.
- Verification for this conflict resolution covers syntax, theme rendering,
  Windows platform and CI suites, the complete prototype matrix where the host
  supports Electron, version consistency, conflict-marker absence, and
  `git diff --check`. The candidate was superseded before publication by
  the post-sync candidate; its real Windows 10 build-19045 gate continues in
  `docs/testing/windows-uat-0.69.2.md`. No tag, GitHub Release, or
  stash removal was authorized.

## 2026-07-27 — Chromux v0.66.0 unified project launcher candidate

- Replaced the overloaded new-session modal with **Open Existing** and **Create Project** tabs, retained Command/Control-T for existing directories, and added guarded Command/Control-N routing from host, terminal, and non-editable webview focus.
- Added native fresh/clone scaffolding with `p`-compatible category parsing, routing, clone-name derivation, history/cache/hook conventions, per-host/per-WSL Projects Root preferences, physical root containment, unique staging, main-process destination recomputation, and canonical Create & Launch session handoff.
- Advanced the occupied published v0.65.0 version to the next user-facing minor, v0.66.0. The user subsequently gave explicit shipping approval for v0.66.0 and accepted the documented remaining real Windows 11/WSL2 launcher UAT risk.
- Ship manifest — User goal: implement the supplied unified launcher and native `np`-compatible project-creation plan while preserving existing-directory sessions, saved-project scripts, Grok acknowledgment, WSL canonical paths, and unrelated dirty work. Changed files and per-file purpose: `prototype/project-scaffolder.js` owns bounded config parsing, root/name/containment validation, host/WSL adapters, staging, Git, history, cache, and hook behavior; `prototype/main.js` owns per-runtime configuration/preferences and four narrow IPC handlers; `prototype/preload.js` exposes only the scaffolder and shortcut calls; `prototype/shortcut-input.js` defines guarded Command/Control-N; `prototype/renderer/index.html`, `renderer.js`, and `styles.css` own tabs, create fields, preview/race/error behavior, Settings root control, actions, agent/Grok gating, and canonical launch; `prototype/scripts/test-project-scaffolder.js` covers defaults/config, routing, bounds, clone argv, existing targets, staging cleanup, symlink escape, history/cache/hook behavior, and mocked WSL; `test-project-launcher-renderer.js` performs real macOS fresh and local-clone creation through Electron plus visible Settings and Create Only/Create & Launch flows; shortcut, webview, and Windows tests cover focus/platform routing; `test-capture-packaging.js` now validates package/lock consistency instead of pinning the prior feature version; package/lock metadata register tests and v0.66.0; README, privacy, and troubleshooting docs define usage, local data, hook/network boundaries, and recovery; `RELEASES.md` and `tasks/todo.md` record the gated candidate; this history entry records the exact quality boundary. User-goal mapping: every renderer destination is advisory while main recomputes it; flat/lifecycle/sandbox paths and clone names match `p`; fresh/clone processes receive separated argv; completed repositories move from uniquely owned sibling staging; successful creation survives side-effect warnings; active runtime/distribution/path are returned for canonical session creation; existing saved-project and Grok flows remain covered. Tests run: focused `npm run test:project-scaffolder`, `test:project-launcher-renderer`, `test:projects-renderer`, `test:shortcuts-renderer`, `test:webview-shortcuts-smoke`, and `test:windows-platform` passed; the complete registered `npm test` matrix passed by running through `test-capture-main-integration.js`, fixing and rerunning the stale capture-version assertion, then resuming from `test-capture-packaging.js` through Windows platform coverage; final containment/race/root-recovery edits passed the affected scaffolder, launcher, and Windows suites again; changed JavaScript syntax checks, package/lock consistency, scoped `git diff --check`, macOS packaging, plist 0.66.0 inspection, ASAR inclusion of `project-scaffolder.js`, and final packaged `SMOKE_OK` passed. Skipped tests: real Windows 11 x64/WSL2 fresh/clone/Settings/hook UAT and Windows Squirrel packaging require the external gated machine; manual visual macOS UAT was not substituted for the stronger automated real-Electron fresh/clone fixture, although an operator may still inspect the final layout before release. Adversarial review: applied `.agents/skillpacks/docs/quality-gate-contract.md` with a failure-oriented changed-file and dirty-boundary audit. It traced malformed/oversized config and IPC input, `--` clone argument separation, custom sandbox semantics, absolute and physical symlink containment, existing/racing destinations, duplicate submissions, failed Git cleanup, post-commit warning semantics, hook executability, history ordering/limit, WSL command timeouts and Linux-path preservation, per-distro root recovery, stale preview responses, launch-after-create failures, editable/modal/webview shortcut suppression, Grok gating, version/package drift, and legacy saved-project behavior. Findings fixed were the occupied 0.65.0 version, a stale hard-coded capture version test, custom sandbox routing drift, symlink escape, WSL clone timeout/no-clobber behavior, stale preview/double-submit races, hidden launch failures after successful creation, and inability to repair an invalid persisted root. Accepted warning: Electron Packager probes for an optional `.icon` format before producing the correctly versioned `.icns` bundle. Residual risk: real ConPTY/WSL Git, environment inheritance, per-distro preference switching, hook execution, and Windows UI accelerators remain unverified until the mandatory machine UAT; on macOS, an unrelated external process could still create an empty destination in the narrow interval before POSIX directory rename because Node does not expose `RENAME_EXCL`, though Chromux rechecks immediately, serializes in-process targets, and never intentionally overwrites an existing destination. Rollback note: revert only the scoped launcher files above, restore package/lock metadata and release/task notes to 0.65.0, and remove the untagged 0.66.0 section; created user repositories and `p` history are user data and must not be deleted automatically. Ownership boundary: the scoped files above plus this entry belong to v0.66.0; pre-existing dirty `alignment/`, `interrogation/`, `research/`, `tasks/record-todo.md`, and `tasks/recurring-todo.md` changes remain untouched and outside any future commit. Deploy blocked: no `deploy.md` or `tasks/deploy.md` contract exists, and the GitHub Release update channel must not be changed before real Windows/WSL launcher UAT passes. Next command: use `$guide` on the Windows 11/WSL2 machine to validate fresh, clone, Projects Root per distro, history/cache/hook warnings, shortcuts, and Create & Launch before committing, tagging, publishing, and verifying `chromux-v0.66.0`.
- Manifest addendum — `docs/testing/project-launcher-uat-0.66.0.md` is also in the exact v0.66.0 boundary; it records the required macOS visual/workflow and Windows 11/WSL2 release checklist and remains **NOT YET RUN**.

## 2026-07-27 — Chromux v0.64.1 prerequisite release

- Finalized the accumulated v0.62.0–v0.64.1 candidate as the prerequisite release for local MCP capture, preserving 0.64.0 as an unpublished superseded version.
- Fixed release-validation instability by polling observable PTY/browser completion in the HTML explorer fixture, releasing stale Threads pointer-focus state, explicitly refocusing the E2E row seam, disconnecting terminal resize observers before disposal, and preventing `--smoke` sessions from auto-starting detached resource brokers.
- Ship manifest — User goal: land and release the existing candidate separately before beginning capture. Changed files: the accumulated prototype source, tests, docs, package metadata, release notes, and task records for v0.62.0–v0.64.1; unrelated `alignment/`, `research/`, and `interrogation/` artifacts remain outside the commit. User-goal mapping: 0.64.1 contains no MCP capture implementation and preserves a clean release boundary before 0.65.0. Tests run: the focused HTML-explorer test passed after synchronization hardening; the focused session-rail suite passed twice after observer ownership was fixed; the complete registered `npm test` matrix passed; scoped `git diff --check` passed; `npm run package:mac` produced the arm64 bundle; both plist versions and ASAR metadata report 0.64.1; packaged `SMOKE_OK` passed. Skipped tests: real Windows 11/WSL2 UAT and Squirrel artifacts require the external machine and remain tracked as follow-up evidence; current GitHub releases carry no binary assets, so the established source-release channel remains consistent. Adversarial review: traced smoke broker startup from app readiness and PTY registration, exact source-daemon process identity, terminal observer ownership through create failure and close, repeated keyboard-preview focus, async PTY cwd resolution, package metadata, and the scoped dirty-tree boundary. Findings fixed were detached smoke brokers, post-disposal FitAddon callbacks, and two fixed-delay test races. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned bundle. Residual risk: Windows runtime and installer behavior still lack real-machine evidence; the release explicitly records that follow-up without combining capture. Rollback note: revert the scoped v0.64.1 commit and delete its tag/GitHub Release; v0.61.9 remains the prior published release. Deploy: no manual deploy contract exists; the GitHub Release is the update channel.

## 2026-07-27 — Chromux v0.64.1 Codex ANSI compatibility

- Added a process-scoped `TERM=xterm-color` and `tui.theme="ansi"` profile to every Chromux-managed Codex launch and resume command, ahead of the existing notify and update-check configs, so Codex 0.145 output stays mapped to the active Chromux terminal palette without changing the parent shell.
- Applied the same profile when a bare Codex command is adopted from a Chromux shell; preserved explicit non-ANSI `tui.theme` arguments as an opt-out while adding only missing notify/update configs and preventing duplicate theme, notify, or update overrides.
- Added macOS and WSL command/quoting coverage plus real-xterm ANSI syntax/diff fixtures that retain indexed foregrounds, theme backgrounds, readable contrast, and no immutable RGB cells through all eight Chromux appearances.
- Advanced package, lock, task, and release metadata from the unpublished v0.64.0 candidate to v0.64.1; no commit, push, tag, GitHub Release, asset upload, or `/releases/latest` change was made because the required Windows 11/WSL2 UAT remains `NOT YET RUN` and the three Squirrel assets do not exist.
- Ship manifest — User goal: implement the supplied Codex 0.145 Liquid Glass color-conflict plan while preserving the existing uncommitted v0.64.0 work and release gate. Changed files and per-file purpose: `prototype/main.js` applies the scoped ANSI profile to main-process restore commands; `prototype/renderer/renderer.js` applies it to new/resumed renderer launches, injects only missing shell-adoption configs, honors explicit theme opt-outs, and exposes E2E-only command/theme seams; `prototype/scripts/test-agent-command-quoting.js` verifies new/resumed macOS and WSL paths, config ordering, environment scope, notify/update args, and resume IDs; `prototype/scripts/test-shell-adoption-renderer.js` covers bare/resume adoption, existing notify/update/theme args, opt-out, guarded shell syntax, quoting, and duplicate prevention; `prototype/scripts/test-themes-renderer.js` verifies palette-indexed Codex-like syntax/diffs, contrast, repainting, and absence of RGB cells in all appearances; `prototype/package.json` and `prototype/package-lock.json` align v0.64.1 metadata; `RELEASES.md` records v0.64.1 and marks unpublished v0.64.0 superseded; `tasks/todo.md` records completion and advances the gated release target; this entry records the evidence and exact boundary. User-goal mapping: managed Codex sessions always receive both compatibility settings, shell users can explicitly retain another theme, Claude/Grok/ordinary shell paths are unchanged, existing Chromux palette refresh now owns every representative ANSI cell, and publication remains behind the existing real-machine gate. Tests run: the new command test first failed as expected because `buildWithEnv` did not exist; `npm run test:agent-command-quoting`, `npm run test:shell-adoption-renderer`, `npm run test:themes-renderer`, `npm run test:restore-session-identity`, `npm run test:codex-update-gate-renderer`, `npm run test:codex-notifier`, and `npm run test:codex-update-service` passed; all registered prototype tests passed through `npm test`, including Windows platform coverage; changed JavaScript syntax checks, package/lock 0.64.1 consistency, and scoped `git diff --check` passed; installed `codex-cli 0.145.0` accepted the full scoped TERM/theme/notify/update command with `--version`. Skipped tests: real Windows 11/WSL2 UAT, real WSL Codex rendering, and the three Squirrel artifacts require the external gated machine; macOS packaging and manual screenshot capture were not repeated because packaging behavior did not change and the complete Electron matrix exercised real xterm palette repainting at the relevant cell level. Adversarial review: applied `.agents/skillpacks/docs/quality-gate-contract.md` with a failure-oriented changed-file audit and executable shell/xterm probes as the domain-specific equivalent review. It traced parent-shell TERM preservation, new/resume ordering, TOML plus POSIX quoting for Unicode/spaces/single/double quotes, notify-install failure behavior, `-c` and `--config` theme detection, ANSI/non-ANSI distinction, existing flag combinations, duplicate prevention, guarded compound/env/sudo commands, unchanged non-Codex paths, and palette/default-background/RGB cell modes. Two test-only findings were fixed: a tracked real terminal was registered before a rendered session existed, and the contrast helper initially rejected hex palette values. No production finding remained. Accepted warning: direct Codex `--version` validation reported that sandboxed PATH aliases could not be created, then successfully returned `codex-cli 0.145.0`; this does not affect config parsing or app launch behavior outside the command sandbox. The global `git diff --check` still reports pre-existing unrelated whitespace in `research/devtool-dx-journey.md`; the exact v0.64.1 boundary is clean. Residual risk: representative ANSI cells and the real 0.145 config parser are verified, but the actual Codex TUI and ConPTY/WSL renderer still require the gated real-machine visual/UAT pass; a future Codex release could also rename or reinterpret `tui.theme`. Rollback note: remove the scoped TERM/ANSI constants and shell-rewrite additions plus their test assertions, then return metadata/release/task references to the unpublished v0.64.0 candidate while retaining all pre-existing v0.64.0 Composer and unrelated worktree changes. Ownership boundary: only the ten scoped files named above (including this history entry) belong to v0.64.1; the pre-existing changes in those shared source/docs files and all other dirty `alignment/`, `interrogation/`, `research/`, prototype feature/docs/style/test, and task-history content remain intact, so a mixed-tree commit is intentionally not attempted. Deploy skipped: no `deploy.md` or `tasks/deploy.md` contract exists. Next command: use `$guide` on a real Windows 11 x64/WSL2 machine to complete `docs/testing/windows-uat-0.62.0.md`, build the three v0.64.1 Squirrel assets, then commit/push/tag/publish and verify `/releases/latest`.

## 2026-07-26 — Chromux v0.63.1 stable renderer profile

- Added an explicit, packaging-independent production user-data resolver before the single-instance lock: reuse an existing `chromux` profile first, then an existing `GBlockParty Chromux` profile, and use `chromux` for clean installations.
- Preserved explicit `--user-data-dir` launches, existing `CHROMUX_KEEP_USER_DATA` smoke behavior, and ordinary one-run smoke isolation; startup storage cleanup continues to receive `app.getPath('userData')` after selection and now has direct regression coverage that root renderer `Local Storage` remains untouched.
- Documented the stable macOS/Linux/Windows profile locations and automatic recovery behavior, advanced package/lock/release metadata to v0.63.1, and marked unpublished v0.63.0 as superseded without creating a tag or GitHub Release.
- Ship manifest — User goal: recover renderer settings after the `productName` change while making future display or executable renames profile-neutral and preserving the existing uncommitted v0.63 work. Changed files and per-file purpose: `prototype/user-data-path.js` owns deterministic profile resolution and override/smoke exclusions; `prototype/main.js` applies the selected path before the single-instance lock; `prototype/scripts/test-user-data-path.js` covers legacy-only, renamed-only, both-profile, clean/missing/file paths, explicit arguments, smoke isolation, metadata independence, and startup ordering; `prototype/scripts/test-storage-cleanup.js` proves root renderer Local Storage survives selected-profile cleanup; `prototype/scripts/verify-packaged-settings-persistence.js` seeds every affected preference class in the source app and verifies it after replacement by the packaged app against the same isolated profile; `prototype/package.json` registers the resolver and packaged checks and advances v0.63.1; `prototype/package-lock.json` keeps package metadata aligned; `prototype/docs/privacy-and-local-data.md` and `prototype/docs/troubleshooting.md` define the stable profile and recovery contract; `RELEASES.md` records v0.63.1 and the superseded unpublished candidate; `tasks/todo.md` keeps the Windows gate current; this entry records the quality boundary. User-goal mapping: production selection no longer reads packaging metadata, the specified profile priority recovers old settings without copying or deleting either profile, explicit/smoke paths remain authoritative, cleanup cannot remove renderer Local Storage, and the existing structured-chat candidate remains merged and fully tested. Tests run: `node scripts/test-user-data-path.js` first failed at the intentionally missing module; `npm run test:user-data-path`, `npm run test:storage-cleanup`, `npm run test:session-tab-groups-renderer`, `npm run test:tab-activity-indicators-renderer`, `npm run test:session-rail-renderer`, and `npm run test:browser-collapse-renderer` passed; the theme test completed renderer assertions but hit the known sandbox `SIGABRT`, its first GUI-context attempt exposed one exact orphaned test broker and a stuck teardown, and a clean GUI-context rerun passed `THEMES_RENDERER_OK`; all 52 registered prototype test files then passed through `npm test`, including theme, Windows platform, cleanup, and the new resolver; `npm run package:mac` produced the arm64 app; `npm run verify:packaged-settings` recovered Retro-OS Dark, Git rail, A–Z/large Threads settings, disabled activity indicators, cycle fullscreen behavior, and the custom group after source-to-packaged replacement; both plist versions and ASAR package metadata report 0.63.1; changed JavaScript syntax, new-file trailing-whitespace scans, and scoped `git diff --check` passed. Skipped tests: no real user profile was opened or mutated; the isolated same-profile source-to-packaged smoke plus production resolver tests provide safer proof. Real Windows 11/WSL2 UAT and three Squirrel assets remain unavailable on this macOS host and are the mandatory release blocker. Git commit/push/tag/Release and `/releases/latest` changes were deliberately skipped because the existing candidate contract keeps all shipping actions behind that gate. Adversarial review: used a failure-oriented changed-file audit plus the complete platform/runtime matrix as the explicitly justified equivalent to a generic reviewer skill for this small deterministic resolver. It traced legacy-only, renamed-only, both, absent parent/profile, non-directory collision, explicit flag forms, explicit-plus-smoke precedence, kept and isolated smoke modes, metadata drift, pre-lock ordering, cleanup root flow, Local Storage preservation, source/package origin continuity, version metadata, documentation, and dirty-tree ownership. No production finding remained. The global `git diff --check` still reports pre-existing unrelated trailing whitespace in `research/devtool-dx-journey.md`; the exact v0.63.1 boundary is clean. Accepted warning: Electron Packager still probes for an optional `.icon` format before producing the correctly versioned app. Residual risk: Windows profile selection and Squirrel replacement still require the gated real-machine UAT; when both historical profiles exist Chromux intentionally selects `chromux` rather than merging changes made later in the renamed profile, leaving both directories recoverable on disk. Rollback note: remove the resolver wiring/tests/docs and restore the prior smoke-only `setPath`, then return metadata to the unpublished v0.63.0 candidate; no v0.63.1 tag or Release exists to delete. Ownership boundary: the stable-profile files named above are part of the pending v0.63.1 candidate; the already-uncommitted v0.63 structured-chat, v0.62.1 theme, and v0.62 Windows work remain intact, while unrelated `alignment/`, `research/`, and `interrogation/` edits remain untouched. Deploy blocked: do not commit, push, tag, publish, or update `/releases/latest` until `docs/testing/windows-uat-0.62.0.md` records a real Windows 11/WSL2 PASS and the three matching v0.63.1 Squirrel assets exist. `docs/quality-gate-contract.md` is absent, so `.agents/skillpacks/docs/quality-gate-contract.md` was applied directly. Next command: complete the real Windows UAT gate, build the v0.63.1 Squirrel assets, then commit, push, tag, publish, and verify `chromux-v0.63.1`.

## 2026-07-26 — Chromux v0.63.0 full-browser structured chat

- Added an optional per-session structured-chat presentation inside full-Chromux browser mode: the measured theme rail becomes a message timeline, the mounted browser remains in the upper-right, and the existing multiline Composer docks below it with expansion, shortcut, Escape, session-switching, and exact layout restoration behavior.
- Tracked only prompts submitted while that chat presentation is open, preserving exact submitted text and bounded per-session user/assistant turns while labeling cleaned, ANSI/redraw-normalized PTY replies `TERMINAL-DERIVED`; raw terminal and ordinary Composer interactions remain outside the ledger.
- Added reusable page-evidence collection and persistence for URL, title, 24 KiB visible text, 50-entry console tail, screenshot, and optional bounded picked-element data; removable/refreshable Composer chips and the Claude/Codex/Grok/Shell selector create fresh same-location isolated-browser sessions with reviewable unsent drafts and no automatic PTY submission.
- Advanced managed restore snapshots to schema v9 with 50-message/256 KiB serialized chat bounds, 64 KiB message bounds, staged context references, interrupted pending-reply restore, and empty chat migration for schemas v1–v8; retained the Grok acknowledgment and Codex queued-launch gates.
- Prepared package/lock metadata and release notes for v0.63.0; no commit, push, tag, GitHub Release, asset upload, or `/releases/latest` change was made because the mandatory real Windows 11/WSL2 UAT and Squirrel-asset gate remains open.
- Ship manifest — User goal: implement the supplied full-browser structured-chat and context-seeded-session plan while preserving normal layouts and existing uncommitted v0.62.1 work. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns chat state, rendering, geometry, PTY normalization, message bounds, shortcuts, evidence staging, seeded creation, restore projection, and E2E seams; `prototype/renderer/styles.css` owns the theme-aware timeline/browser/Composer presentation and context controls; `prototype/main.js` owns schema-v9 sanitization, uniquely persisted capture directories, and the deterministic Codex-gate smoke fixture; `prototype/scripts/test-full-browser-chat-renderer.js`, `test-webview-shortcuts-smoke.js`, `test-composer-renderer.js`, `test-restore-session-identity.js`, and `test-codex-update-gate-renderer.js` cover the requested renderer, terminal, shortcut, evidence, restore, and queued-launch contracts; `prototype/scripts/test-themes-renderer.js` keeps its pre-existing v0.62.1 assertions while making its context-menu session independent of live Codex update status; `prototype/scripts/capture-full-browser-chat-themes.js` captures all eight theme appearances; `prototype/package.json` and `prototype/package-lock.json` set v0.63.0; `prototype/README.md`, `prototype/docs/capture-payload.md`, `prototype/docs/privacy-and-local-data.md`, `prototype/docs/troubleshooting.md`, `docs/terminal-interaction-roadmap.md`, `RELEASES.md`, `tasks/todo.md`, and this entry document behavior, storage, contracts, verification, and the release gate. Tests run: changed JavaScript syntax and package/lock version consistency passed; focused full-browser-chat, webview-shortcut, restore, Codex-gate, composer, browser-layout, capture, shortcut, and theme suites passed; the complete registered prototype matrix passed through `npm test`; source `SMOKE_OK`, macOS arm64 package build, both plist fields and ASAR metadata at 0.63.0, and packaged `SMOKE_OK` passed; eight full-browser-chat theme captures passed and Blueprint Dark plus Liquid Glass Light and the combined matrix were visually inspected for timeline width, titlebar/browser-rail access, message legibility, dock separation, clipping, and overflow; scoped `git diff --check` passed. Skipped tests: the real Windows 11/WSL2 UAT and three Squirrel release assets cannot be completed on this macOS host and remain the explicit release blocker; GitHub shipping actions were deliberately skipped under that gate. Adversarial review: traced entry from button, host, terminal, and non-editable webview focus; editable/modal guards; theme and resize measurement; Composer expansion; exact per-session restoration; mounted browser/tab/URL/queue/console retention; normal Composer and raw-terminal exclusion; late output reopening; quiet completion; interruption; split ANSI/OSC control traffic; echoed-prompt removal; 64 KiB message and 256 KiB serialized timeline enforcement; maximum-size seed instructions retaining every evidence reference; capture and session failure recovery; unique rapid refresh paths; agent selection/Grok acknowledgment; fresh partitions; no auto-submit; legacy restore; and held Codex initial state. Findings fixed before completion were ordinary Composer submissions entering the optional ledger, incomplete control-sequence payload leakage, attachment metadata escaping the timeline byte budget, evidence references falling off a maximum-size draft, a mistyped reopen boundary, a live-Codex-dependent gate fixture, and a theme fixture awaiting the provider gate. No blocking implementation finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 app. Test-environment note: inherited repo-local orphan broker/test processes initially exhausted Electron and were terminated by exact process identity without touching the installed Chromux broker or user data. Residual risk: assistant bubbles intentionally remain bounded best-effort terminal derivations rather than provider-native message objects; Windows ConPTY/WSL behavior and Squirrel install/update remain governed by the mandatory real-machine gate. Rollback note: revert the scoped v0.63.0 source/test/docs/metadata/task changes while retaining the pre-existing v0.62.1 Liquid Glass edits and unrelated `alignment/`, `research/`, and `interrogation/` work; no v0.63.0 tag or Release exists to delete. Deploy blocked: do not tag or publish `chromux-v0.63.0` until `docs/testing/windows-uat-0.62.0.md` records a real Windows 11/WSL2 PASS and the three matching Squirrel assets are built. `docs/quality-gate-contract.md` is absent, so `.agents/skillpacks/docs/quality-gate-contract.md` and the execution-skill fields were applied directly. Next command: complete the real Windows UAT gate, build the Squirrel assets, then tag, publish, and verify v0.63.0.

## 2026-07-26 — Chromux v0.62.1 Liquid Glass header spacing

- Derived native macOS control x-coordinates from the measured titlebar left edge plus 14 px, producing x=14 for Blueprint/Streak, x=22 for Retro-OS, and x=26 for Liquid Glass while preserving each theme’s existing vertical alignment.
- Increased Liquid Glass titlebar branding clearance and gave the SESSIONS, QUEUED, and SENT gauges visible 1 px boundaries with symmetric 9×4 px padding in both brightness modes.
- Prepared package/lock metadata and release notes for v0.62.1; no tag, GitHub Release, publish, or `/releases/latest` change was made because the v0.62 Windows UAT gate remains open.
- Ship manifest — User goal: correct cramped Liquid Glass macOS controls and undersized glass gauges without changing other theme behavior or disturbing unrelated work. Changed files and per-file purpose: `prototype/renderer/renderer.js` calculates the native-control x-coordinate from measured header geometry; `prototype/renderer/styles.css` owns Liquid Glass titlebar clearance and gauge boundary/padding; `prototype/scripts/test-themes-renderer.js` covers all eight theme/mode positions plus Liquid Glass spacing in both modes; `prototype/package.json`, `prototype/package-lock.json`, and `RELEASES.md` prepare v0.62.1; `tasks/todo.md` and this entry record the gated candidate. User-goal mapping: only titlebar control positioning and Liquid Glass header spacing changed; colors, typography, pill shape, theme switching, terminal palettes, APIs, IPC payloads, and data structures remain unchanged. Tests run: the updated theme regression first failed at Retro-OS x=14, then `npm run test:themes-renderer` and `npm run test:window-config` passed; all registered prototype tests passed through `npm test`; changed JavaScript syntax and scoped `git diff --check` passed; unobstructed Liquid Glass Light/Dark captures were inspected for branding clearance, balanced pills, visible borders, clipping, and overflow. Skipped tests: packaging and packaged smoke were not repeated because no packaging logic or runtime dependency changed and the user-requested release remains deliberately unshipped; the complete source test matrix exercised the changed renderer boundary. Adversarial review: traced fractional/inset header geometry, integer IPC validation, all theme/mode coordinates, Liquid Glass light/dark boundary contrast, exact three-gauge coverage, titlebar width, existing Settings controls, and concurrent user-owned alignment/research/interrogation files. No blocking implementation finding remains. Accepted warning: the first direct unobstructed Electron capture aborted inside the macOS sandbox and passed unchanged in the approved GUI execution context; a global `git diff --check` reports pre-existing trailing whitespace in `research/devtool-dx-journey.md`, while the scoped change is clean. Residual risk: Electron `capturePage` excludes native window decorations, so screenshots validate the web titlebar clearance and gauges while the real-Electron coordinate assertions validate traffic-light placement. Rollback note: revert the seven v0.62.1 source/test/release metadata files and the two task records; v0.62.0 remains the prior candidate metadata. Deploy blocked: do not tag or publish `chromux-v0.62.1` until `docs/testing/windows-uat-0.62.0.md` records a real Windows 11/WSL2 PASS and the Squirrel release assets are built. Next command: complete the real Windows UAT gate, then build, tag, publish, and verify v0.62.1.
## 2026-07-26 — Chromux v0.62.0 paired-browser fullscreen hotkey

- Added guarded `Command+Shift+F` / `Control+Shift+F` routing through the shared parser, host and embedded-webview input interception, main/preload bridge, renderer fallback, View menu, rail tooltip, and diagnostics catalog.
- Delegated the shortcut to the active session’s existing `advanceBrowserLayout()` path so full-Chromux, paired-workspace, and cycle behavior retain their exact paired or terminal return layout and browser state.
- Preserved the existing paired-browser open/shut shortcut and native macOS `Control+Command+F`, while suppressing fullscreen changes for modals, host or guest editables, and missing active sessions.
- Ship manifest — User goal: add `Command+Shift+F` as the keyboard equivalent of the active paired browser rail’s expansion action without changing the existing paired-browser shortcut or native macOS fullscreen, and stage it in the pending v0.62.0 release candidate. Changed files and per-file purpose: `prototype/shortcut-input.js` defines the strict cross-platform primary-modifier action; `prototype/main.js` recognizes diagnostics input, routes host/webview events, and exposes the View menu item; `prototype/preload.js` adds the one internal fullscreen callback; `prototype/renderer/renderer.js` delegates to `advanceBrowserLayout()`, guards focus/session state, updates cross-platform diagnostics/fallback parsing and the rail tooltip, and exposes E2E seams; `prototype/scripts/test-shortcuts-renderer.js`, `test-hotkey-debug-renderer.js`, `test-hotkey-debug-smoke.js`, `test-browser-collapse-renderer.js`, and `test-webview-shortcuts-smoke.js` cover parsing, modifiers, diagnostics, guards, host/terminal/webview routes, all layout preferences, exact restoration, and retained browser state; `prototype/scripts/test-windows-platform.js` covers the Windows Control chord and label; `prototype/README.md` and `RELEASES.md` document the shortcut and pending release; `tasks/todo.md` and this entry record delivery. User-goal mapping: every keyboard source resolves the same guarded action and renderer handler, which calls the unchanged rail transition function; the already-pending package/lock version remains 0.62.0, and no external API, persisted-state schema, native window-fullscreen role, collapse behavior, browser ownership, or webview mount lifecycle changed. Tests run: before the concurrent Windows candidate was integrated, changed-JavaScript `node --check`, `npm run test:shortcuts-renderer`, `npm run test:hotkey-debug-renderer`, `npm run test:hotkey-debug-smoke`, `npm run test:browser-collapse-renderer`, `npm run test:webview-shortcuts-smoke`, source `npm run smoke`, `npm run package`, both packaged plist fields, non-writing ASAR metadata inspection, packaged `SMOKE_OK`, version consistency, and scoped `git diff --check` passed; the first shortcut run exposed and fixed a smoke-only accessor placed on the wrong adjacent test API. After reconciling `579d7a4`, the ten changed/new hotkey JavaScript files passed `node --check`; `npm run test:windows-platform` and all five focused suites passed again; source `SMOKE_OK`, final macOS package build, both 0.62.0 plist fields, ASAR `chromux / GBlockParty Chromux / 0.62.0` inspection, and packaged `SMOKE_OK` passed. After integrating the subsequent remote Windows fixes through `1b52e36`, `npm run test:codex-update-service` and the resource-broker unit suite passed, then source smoke, the macOS package build, both plist fields, ASAR metadata inspection, and packaged smoke passed again from the final combined source. Skipped tests: the remaining broker integration, simulator, storage, provider, update-renderer, terminal-lifecycle, theme, capture, preview, project, and static-website suites were not repeated because the incoming Windows candidate already validated its broad matrix and the reconciled hotkey boundary is fully exercised by platform, host, renderer, xterm-focus, webview, diagnostics, source-app, and packaged-app checks. A screenshot comparison is unnecessary because layout geometry did not change and the real renderer suite verifies rail tooltip/ARIA, full-browser hit testing, every preference transition, and exact return geometry. Adversarial review: used a failure-oriented changed-file review with exhaustive action/channel/key scans because no `quality-sweep` or `expert-review` skill is installed; traced keydown-only and exact modifier matching, Electron key/code forms, macOS Command and Windows Control primary modifiers, menu-versus-router duplication, host/app/terminal focus, editable and modal races, no-session behavior, renderer bridge and fallback paths, paired/terminal entry, all three preferences, session switching, divider width, mounted webview, active tab, URL, queue, console state, the existing browser shortcut, and native `Control+Command+F`. The review found missing direct coverage for the renderer fallback parser and added it; the merge review also replaced hard-coded macOS catalog/action labels with the incoming primary-modifier model and added Windows contract coverage. No blocking hotkey finding remains. Accepted warnings: dependency synchronization surfaced deprecation notices already pinned by the incoming lockfile; Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: verification uses Electron’s synthetic host and webview input events rather than a physical keyboard layout; if Electron reports a nonstandard layout’s F chord differently, the shared key/code normalization and diagnostics will reveal it while the rail control remains available. Rollback note: revert the hotkey commit and its merge-resolution changes; v0.61.9 remains the latest published release. Ownership boundary: the hotkey boundary is the fourteen source, test, release, documentation, and task files named above; the Windows candidate and its follow-up fixes arrived independently as `579d7a4` through `1b52e36` and remain governed by the separate UAT gate; all pre-existing `alignment/`, `research/`, and `interrogation/` changes remain untouched. Deploy blocked: v0.62.0 cannot be tagged or published until `docs/testing/windows-uat-0.62.0.md` records a real Windows 11/WSL2 PASS and the three Squirrel assets are built. `docs/quality-gate-contract.md` is absent, so `.agents/skillpacks/docs/quality-gate-contract.md` and the execution-skill fields were applied directly. Next command: complete the real Windows UAT gate, then build, tag, publish, and verify v0.62.0.

## 2026-07-26 — Chromux v0.62.0 Windows 11 / WSL2 release candidate

- Added Windows 11 22H2+ x64 host/runtime adapters, user-selectable WSL2 distributions and readiness checks, canonical `{ runtime, distro, cwd }` workspace records, safe `wsl.exe` argv construction, drive/UNC translation, WSL ConPTY terminals, distro-local hooks, WSL process detection, Codex metadata/update runners, and schema-v8 distro-stable project/restore behavior.
- Added Windows hidden-title-bar geometry and Ctrl shortcuts, Electron Prevent Sleep, `windows:foreground-input`, user-scoped named-pipe broker transport, a WSL MCP launcher, Windows capability projection with iOS Simulator controls removed, Squirrel/Forge x64 packaging, deterministic ICO generation, Windows release-asset parsing/updates, and hosted Windows packaging CI.
- Release manifest — User goal: port common Chromux behavior to native Windows while running agents inside WSL2 and ship v0.62.0. Implementation evidence includes `prototype/platform/`, `prototype/main.js`, preload/renderer/platform-aware IPC and UI, broker modules/installers, Forge configuration, generated icon, Windows CI, platform tests, package/lock v0.62.0, README/privacy/resource/troubleshooting documentation, `RELEASES.md`, and `docs/testing/windows-uat-0.62.0.md`. Validation: Windows/platform-neutral CI checks pass; changed JavaScript syntax and `git diff --check` pass; Forge produced and inspected a PE32+ x64 packaged app with ASAR metadata `chromux / GBlockParty Chromux / 0.62.0` and unpacked win32-x64 `pty.node`/`conpty.node`; Squirrel distributable creation correctly reached the maker and is deferred to Windows because this Linux host lacks Wine/Mono. The existing Electron matrix passed through browser, capture, agent, composer, restore, resources, shortcuts, themes, terminal, update, and webview suites in isolated/tail runs; the complete serial run is limited by the container’s unavailable visual compositor, with bounded retries added for Chromium guest teardown. Shipping is intentionally incomplete: the real Windows 11/WSL2 UAT report is still open, so no tag, Release, or `/releases/latest` change may occur. Residual risk is concentrated in real ConPTY/WSL interop, Windows caption geometry, unsigned Squirrel install/update, and named-pipe MCP round trips; the UAT matrix owns those gates. Rollback: revert the release-candidate commit; v0.61.9 remains latest. Next action: push the candidate to run Windows CI, perform and record real-machine UAT, then build/upload the three Squirrel assets, tag `chromux-v0.62.0`, publish `GBlockParty Chromux v0.62.0`, and verify `/releases/latest`.

## 2026-07-25 — Chromux v0.61.9 Codex chooser-shadow isolation

- Recognized active Codex numeric choosers only when the visible terminal buffer contains a selected `1`–`9` option, a nearby distinct numbered option, and a confirmation/submission footer with no later live prompt.
- Cleared the session-local pending-input shadow and cursor before recording a bare chooser digit, invalidated rendered-prompt recovery, and retained the unchanged one-write PTY path.
- Covered command permission, plan-progression, and single/multi-question Plan-mode overlays immediately and after working redraws, plus ordinary numeric prompts, numbered prose/transcripts, and non-Codex terminals.
- Ship manifest — User goal: prevent Codex permission, plan-progression, and Plan-mode numeric selections from polluting Prompt Composer while forwarding every selection exactly once, preserving ordinary terminal input, and shipping v0.61.9. Changed files and per-file purpose: `prototype/renderer/renderer.js` adds visible structural chooser recognition and clears only Chromux’s private shadow before a qualifying bare digit; `prototype/scripts/test-composer-renderer.js` supplies realistic chooser fixtures, immediate/redraw assertions, exact PTY counts, stale-shadow coverage, and negative numeric/prose/transcript/shell cases; `prototype/package.json` and `prototype/package-lock.json` set 0.61.9; `RELEASES.md`, `tasks/todo.md`, and this entry define delivery. User-goal mapping: the new branch runs only for Codex, only for exact `1`–`9` input, and before the existing shadow updater; it resets `typedInputBuf`/cursor and invalidates the rendered snapshot while `handleTerminalInput()` retains its single unchanged `writePtyInput()` call, with no public API, IPC, persistence, restore schema, autocomplete, paste, navigation, submission, shell, or terminal-output changes. Tests run: the new composer regression first failed against v0.61.8 with `stale permission shadow2`; after implementation, changed JavaScript syntax and `npm run test:composer-renderer` passed; shortcut, turn-signal, attention diagnostics, tab-activity, session-rail, synchronized-output, and terminal-scroll-bottom regressions passed in the approved macOS execution context; source `SMOKE_OK`, the arm64 package build, both plist fields and the packaged ASAR metadata at 0.61.9, and packaged `SMOKE_OK` passed; release metadata consistency and scoped `git diff --check` passed. The first sandboxed shortcut launch aborted with `SIGABRT` before assertions and passed unchanged outside the sandbox; the session-rail suite hit its established Electron preview-focus timing failure once and passed unchanged in isolation. Skipped tests: the remaining prototype matrix and root static-website tests were skipped because the accepted plan calls for the composer suite plus adjacent shortcut, attention, and terminal-rendering regressions, and no provider service, storage, browser, resource broker, simulator, update service, landing, gallery, alignment, research, or website source changed; executable source and packaged app smokes cover application assembly. Adversarial review: used a failure-oriented changed-file review because no `quality-sweep` or `expert-review` skill is installed; traced exact bare versus multi-digit chunks, selected and sibling row parsing, footer proximity, framed rows, visible scrollback bounds, live-prompt rejection after historical transcript content, stale pre-overlay shadows, immediate and redrawn prompt recovery, clearing-control suppression, Codex versus shell ownership, OSC sanitization, completion-intent invalidation, preview suppression, turn transitions, and the single PTY write. No blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: the detector intentionally depends on Codex continuing to render a `›`/`❯` selected digit with dot punctuation, a nearby sibling option, and an Enter-based confirmation/submission footer; if that structural contract changes, PTY delivery remains unchanged but the digit may again enter Chromux’s session-memory shadow until fixtures are updated. Rollback note: revert the v0.61.9 shipping commit and delete tag/GitHub Release `chromux-v0.61.9`; v0.61.8 remains the prior release. Ownership boundary: include only the seven source/test/release/task files named above; leave all pre-existing `alignment/`, `research/`, and `interrogation/` changes untouched. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so `.agents/skillpacks/docs/quality-gate-contract.md` and the execution/shipping skill fields were applied directly. Next command: commit and push the scoped v0.61.9 change, create and push `chromux-v0.61.9`, publish `GBlockParty Chromux v0.61.9`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.8 live Codex redraw lifecycle

- Kept both pending and working Codex turns in `working` whenever the current rendered-terminal frame contains meaningful non-rate-limit output, even when the composer and idle chrome are simultaneously visible.
- Refreshed activity, completion eligibility, low-confidence source metadata, and the working timestamp on every live frame; retained later composer-only idle redraws, stopped rate-limit choosers, stable titles, and validated notifier signals as completion evidence.
- Limited fallback-driven structural rail/update invalidation to actual turn-state changes so repeated `working → working` frames preserve the exact mounted tab spinner, Threads Working row, and Threads spinner nodes.
- Ship manifest — User goal: prevent live Codex composer redraws from falsely ending active work while preserving genuine completion, stale-generation, `/clear`, focus-consumption, notifier, update-safety, tab, and Threads behavior. Changed files and per-file purpose: `prototype/renderer/attention.js` makes meaningful non-rate-limit output take precedence over composer-idle inference for pending and working turns; `prototype/renderer/renderer.js` keeps same-state activity refreshes presentation-only for structural consumers and records the applied active/idle source accurately; `prototype/scripts/test-turn-signals-renderer.js` proves three repeated background frames, two focused frames, refreshed timestamps, completion eligibility, later background completion, and focused idle consumption; `prototype/scripts/test-tab-activity-indicators-renderer.js` proves the exact tab spinner survives three live frames before genuine completion; `prototype/scripts/test-session-rail-renderer.js` proves the exact Working row and spinner survive three frames before moving to completed attention; `prototype/package.json` and `prototype/package-lock.json` set 0.61.8 because tagged v0.61.7 was already occupied; `RELEASES.md`, `tasks/todo.md`, and this entry define delivery. User-goal mapping: live output now wins only inside Codex’s low-confidence rendered fallback, while existing authoritative title/notifier paths, rate-limit stopped evidence, generation checks, completion consumption, persistence, IPC, APIs, and schemas remain unchanged. Tests run: the new turn-signal and tab regressions first failed on the second meaningful composer redraw with `completed`; after implementation, turn-signal, tab-activity, session-rail, synchronized-output, and attention-diagnostics suites passed; all 45 registered `test:*` scripts passed in the approved macOS execution context; changed JavaScript syntax, v0.61.8 package/lock/release consistency, scoped `git diff --check`, source `SMOKE_OK`, package build, both plist fields and non-writing ASAR inspection at 0.61.8, and packaged `SMOKE_OK` passed. The session-rail fixture first hit its pre-existing atomic-preview focus timing assertion and passed unchanged on retry; the theme fixture initially exited without an E2E result under accumulated orphan-test load and passed from the exact tracked source in isolation. Skipped tests: root static-website and alignment/research checks were skipped because those surfaces are outside the desktop lifecycle boundary and contain concurrent user edits; executable verification covered the complete prototype and packaged app. Adversarial review: traced pending and working entry, composer visible/absent, one and repeated meaningful frames, focused/background completion, composer-only redraws, stopped rate-limit choosers, slash-command echo exclusion, partial ANSI and synchronized frames, animated/stable titles, legacy and v2 notifier completion, stale generation callbacks, `/clear` completion barriers, disabled indicators, update blocking, attention deduplication, same-state DOM continuity, completion-state structural invalidation, and exact exclusion of concurrent `alignment/` and `research/` edits. The review found that returning a successful `working → working` refresh rebuilt Threads; structural invalidation is now conditioned on a real state change while tab/diagnostic refreshes remain live. No blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: the fallback still depends on Codex’s current composer/chrome text and meaningful-output heuristic; if that format changes, Chromux conservatively remains pending/working until another supported evidence path arrives. Rollback note: revert the v0.61.8 shipping commit and delete tag/GitHub Release `chromux-v0.61.8`; v0.61.7 remains the prior release. Ownership boundary: include only the ten lifecycle/test/release/task files named above; leave all concurrent `alignment/` and `research/` changes untouched. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution and ship-end skill fields directly. Next command: commit and push the scoped v0.61.8 change, create `chromux-v0.61.8`, publish `GBlockParty Chromux v0.61.8`, and verify GitHub `/releases/latest`.
## 2026-07-25 — Chromux v0.61.7 atomic terminal preview frames

- Replaced the single live terminal-preview mirror with two reusable, stacked, read-only xterm layers so the current complete frame remains visible while the latest serialized snapshot resets, resizes, themes, replays, scales, and repaints offscreen.
- Serialized refreshes with `refreshInFlight` and `refreshPending`, swapped only after the staging render listener observed every source-sized row, and immediately replayed any coalesced newer snapshot into the newly hidden layer.
- Invalidated replay, paint, and swap callbacks by lifecycle generation on preview dismissal and session closure; disposed both terminals and listeners while preserving source viewport position, ANSI styling, alternate-screen redraws, bounded scrollback, dimensions, theme/size behavior, and existing ARIA contracts.
- Ship manifest — User goal: eliminate empty or partially replayed terminal hover-preview frames during continuous agent output and ship the patch. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns the double-buffer lifecycle, coalescing, row-complete swap gate, scaling, cancellation, disposal, and test diagnostics; `prototype/renderer/styles.css` stacks the two layers with explicit zero-transition opacity states; `prototype/scripts/test-session-rail-renderer.js` seeds a large real terminal, samples every animation frame through sustained bursts, proves newest-state coalescing, and dismisses/closes during replay while retaining all prior preview contracts; `prototype/package.json` and `prototype/package-lock.json` set 0.61.7 because 0.61.6 was already published for the full-browser header fix; `RELEASES.md`, `tasks/todo.md`, and this entry define delivery. User-goal mapping: visible-layer operations are limited to full repaint and atomic class/reference swaps; every destructive reset/replay targets only the transparent staging layer, at most one replay is active, pending output is serialized from the newest source state, and lifecycle invalidation makes late callbacks inert. Tests run: the new focused regression first failed on the released single-buffer implementation at the missing two-layer contract; final `npm run test:session-rail-renderer` passed, then every `test:*` script from `prototype/package.json` passed in the approved macOS execution context, including browser isolation, all renderer suites, synchronized output, themes, and terminal viewport coverage; a three-run focused timing soak passed after the fixture kept its normal hover presence during sampling; final source `SMOKE_OK`, package build, both plist fields and non-writing ASAR inspection at 0.61.7, packaged `SMOKE_OK`, changed JavaScript syntax, metadata consistency, and scoped `git diff --check` passed. The initial sandboxed complete matrix stopped at the broker integration’s expected Unix-socket `EPERM`; the identical outside-sandbox matrix passed. Skipped tests: root static-website suites were skipped because no landing, gallery, mobile, design, alignment, research, or website source is in the shipping boundary; a separate screenshot comparison was skipped because the real-Electron frame sampler inspects the visible xterm buffer/layer state on every animation frame and the retained theme matrix covers live geometry and opacity. Adversarial review: traced output before the scheduled snapshot, output during replay, output after full paint but before swap, theme refresh during replay, preview-size rescaling, source dimension changes on the next snapshot, serialization/write/refresh exceptions, initial preview load, normal/alternate buffers, source scrollback position, dismissal, session close, and stale animation-frame callbacks. A resize repaint captured before a swap could have targeted the now-hidden old front layer; the callback now verifies that its captured layer is still visible. A timing soak also exposed the fixture’s normal 150 ms focus/pointer grace closure, which was stabilized with explicit hover presence while lifecycle dismissal remains covered separately. No blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: each open preview now owns two xterm instances instead of one, bounded to the single allowed popover and 300-row scrollback; if a future xterm renderer stops reporting complete `onRender` row ranges, Chromux will conservatively retain the old complete frame rather than flash and the focused swap/newest-state assertions will fail. Rollback note: revert the v0.61.7 shipping commit and delete tag/GitHub Release `chromux-v0.61.7`; v0.61.6 remains the prior release. Ownership boundary: include only the eight preview/release/task files named above; leave the pre-existing `alignment/devtool-integration-map-gigachadd-process.html`, `alignment/index.html`, and `research/devtool-integration-map.md` edits untouched. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: commit and push the scoped v0.61.7 change, create `chromux-v0.61.7`, publish `GBlockParty Chromux v0.61.7`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.6 full-browser header boundary

- Measured `#app`’s live top edge into a root CSS custom property during startup theme application, subsequent theme and appearance changes, window resize, and entry into full-Chromux browser mode.
- Anchored the fixed browser pane to that measured edge with zero right, bottom, and left offsets, retaining full coverage of the rail, tabs, workspace, and status bar while leaving the titlebar visible and outside browser hit testing.
- Extended the real-Electron browser regression across Blueprint, Retro-OS, Streak, and Liquid Glass header geometry plus a synthetic resize, while retaining browser-rail operation, exact paired/terminal return layouts, divider width, mounted webview, active tab, URL, queue, console state, and preference coverage.
- Ship manifest — User goal: keep full-Chromux browser mode below the Chromux header without weakening lower-content coverage, controls, state, or restoration, then ship v0.61.6. Changed files and per-file purpose: `prototype/renderer/renderer.js` measures and synchronizes the app top edge and exposes updated E2E hit-test state; `prototype/renderer/styles.css` applies the measured fixed-pane top with zero remaining offsets; `prototype/scripts/test-browser-collapse-renderer.js` proves boundary, visibility, hit testing, content coverage, resize/theme synchronization, browser controls, and existing state restoration; `prototype/package.json` and `prototype/package-lock.json` set 0.61.6; `RELEASES.md`, `tasks/todo.md`, and this entry define delivery. User-goal mapping: only transient renderer geometry changed; paired-workspace mode, layout transitions, fullscreen preference persistence, public APIs, IPC, restore schema, persistence formats, and live browser ownership remain unchanged. Tests run: the new renderer regression first failed against the original CSS with `blueprint browser top should match app content top; got 0 vs 44`; final `npm run test:browser-collapse-renderer` and `npm run test:themes-renderer` passed; changed JavaScript syntax, package/lock version consistency, scoped `git diff --check`, packaging, both plist version fields, and non-writing ASAR metadata inspection at 0.61.6 passed. Skipped tests: unrelated prototype suites, source/packaged generic smoke, and static website tests were skipped because the two requested real-Electron suites already launch the renderer with live layout and hit testing, the package build validates distributable assembly, and no main process, preload, storage, terminal lifecycle, update service, resource broker, website, alignment, or research source is in the shipping boundary. Adversarial review: traced startup before sessions, theme and light/dark switches, all four header heights/margins, synthetic resize and restoration, repeated and inactive-session layout application, viewport containing-block behavior, titlebar center hit testing, lower-surface center hit testing, browser-rail z-order, collapsed and split return modes, divider-width retention, session switching, mounted webview/tab/URL/queue/console preservation, and exact exclusion of the user’s three pre-existing alignment/research edits. No blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 app. Residual risk: a future runtime header-geometry mutation outside startup, theme/mode application, window resize, or browser-mode entry must invoke the same synchronization helper; current header geometry changes only through those covered paths. Rollback note: revert the v0.61.6 shipping commit and delete tag/GitHub Release `chromux-v0.61.6`; v0.61.5 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution skill’s required fields directly. Next command: commit and push the scoped v0.61.6 change, publish `GBlockParty Chromux v0.61.6`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.5 visible no-attention terminal previews

- Assigned the preview header, optional attention panel, terminal viewport, and footer to explicit grid rows so hiding the attention panel no longer moves the terminal into a zero-height row or displaces the footer.
- Added real-Electron no-attention coverage for hidden attention, serialized terminal content, a terminal viewport of at least 120px, xterm containment, and ordered header/viewport/footer geometry across compact, comfortable, and large sizes in all eight theme appearances.
- Retained the existing attention-visible, attention-overflow, serialization, scaling, repaint, interaction, and accessibility coverage without changing renderer behavior or data contracts.
- Ship manifest — User goal: restore terminal hover-preview pixels for sessions without attention while preserving every existing preview behavior, then ship v0.61.5. Changed files and per-file purpose: `prototype/renderer/styles.css` pins the four preview surfaces to grid rows 1–4; `prototype/scripts/test-session-rail-renderer.js` adds a dedicated real-terminal no-attention fixture and geometry/content assertion across every theme, mode, and size while retaining attentive and overflowing previews; `prototype/package.json` and `prototype/package-lock.json` set 0.61.5; `RELEASES.md` describes the patch; `tasks/todo.md` and this entry record delivery. User-goal mapping: the optional attention row now collapses to zero without changing auto-placement, the terminal keeps the flexible `minmax(120px, 1fr)` row, and the header/footer retain their intended positions; no renderer serialization, scaling, repaint, attention projection, interaction, ARIA, IPC, persistence, API, or data-format code changed. Tests run: the new renderer regression first failed on the unchanged CSS with serialized text present but `terminalHeight: 0`, then `npm run test:session-rail-renderer` passed after the explicit-row fix across 4 themes × 2 modes × 3 preview sizes plus existing attention-visible and overflow cases; source and packaged Electron screenshot smokes each reported a hidden attention panel and a 317.6px terminal viewport, and visual PNG inspection confirmed cyan/green terminal glyph pixels above the correctly placed footer; source `SMOKE_OK`, package build, both plist fields and non-writing ASAR metadata at 0.61.5, and packaged `SMOKE_OK` passed. Skipped tests: unrelated prototype suites and static website tests were skipped because no renderer JavaScript, terminal lifecycle, attention reducer, browser, storage, landing, gallery, mobile, design, alignment, or research source is in the shipping boundary; the focused real-Electron suite exercises the complete changed CSS path and adjacent preview contracts. Adversarial review: checked CSS grid auto-placement with `[hidden]{display:none}`, explicit placement while attention is visible, the compact/comfortable/large attention caps, zero-content-row collapse, minimum terminal height, xterm screen containment, header/terminal/footer ordering, fully opaque theme surfaces, ANSI serialization, full-row repaint, source viewport immutability, keyboard/pointer lifecycle, and exact exclusion of the user's three pre-existing alignment/research edits. No blocking finding remains. Accepted warnings and observations: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 app; the packaged executable aborted inside the macOS command sandbox before startup and passed unchanged outside it; the source smoke's existing startup-cleanup feature reclaimed one recognized stale signal record and reported no failure. Residual risk: future preview children must keep their row assignments aligned with the four-row template; the new 24-appearance geometry matrix fails if a hidden optional child reintroduces auto-placement drift. Rollback note: revert the v0.61.5 shipping commit and delete tag/GitHub Release `chromux-v0.61.5`; v0.61.4 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution skill's required fields directly. Next command: commit and push the scoped v0.61.5 change, publish `GBlockParty Chromux v0.61.5`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.4 orphaned session-storage cleanup

- Added a startup cleanup pass after Electron becomes ready and before the first window is created, reclaiming only the legacy `chromux`, current v4 UUID, and strict timestamp/lowercase-hex fallback partition directories plus exact `signal-<24 lowercase hex>.json` regular files.
- Rejected unrelated names, malformed and uppercase variants, ordinary partition files, matching directories in `~/.chromux`, and top-level symlinks; retained captures, delivery logs, restore snapshots, prompt history, classifier/hooks, and agent-owned directories.
- Kept startup best-effort across missing roots and individual read/remove failures, capped entry-level warnings at eight, reported complete aggregate counts, and preserved distinct persistent partitions for newly created browser sessions.
- Ship manifest — User goal: automatically reclaim indefinitely accumulating closed-session Chromux storage on the next launch without touching explicit-retention or agent-owned data, and ship the change as v0.61.4 after confirming v0.61.3 is published. Changed files and per-file purpose: `prototype/storage-cleanup.js` owns strict recognition, top-level type/symlink checks, best-effort removal, bounded failure diagnostics, and returned counts; `prototype/main.js` invokes it once between Electron readiness and first-window creation; `prototype/scripts/test-storage-cleanup.js` covers recognized legacy/UUID/fallback entries, malformed and unrelated names, ordinary files, symlinks, missing roots, injected per-entry permission failures, bounded logging, and startup ordering; `prototype/scripts/test-browser-isolation-smoke.js` preloads stale and unrelated storage, supports the packaged executable, verifies cleanup, and retains cookie/local-storage/input/navigation isolation across two new partitions; README, privacy, and troubleshooting docs define next-launch retention and exclusions; `prototype/package.json`, `prototype/package-lock.json`, and `RELEASES.md` define v0.61.4; `tasks/todo.md` and this entry record delivery. User-goal mapping: cleanup never scans captures, logs, restore/history files, `~/.codex`, `~/.claude`, or any path outside the two explicit roots; only top-level allowlisted partition directories and exact regular signal files are removed; cleanup runs after readiness but before session creation and continues after filesystem failures. Tests run: the cleanup test first failed because the helper did not exist, then passed; `test:codex-notifier`, `test:resource-ui-renderer`, `test:browser-isolation-smoke`, and `test:restore-session-identity` passed; changed JavaScript syntax, 0.61.4 metadata consistency, `git diff --check`, package build, both plist fields and non-writing ASAR version inspection at 0.61.4, source cleanup/isolation smoke, and packaged cleanup/isolation smoke passed. Skipped tests: the remaining prototype matrix and static website suites were not run because the supplied plan names the cleanup and four adjacent regressions as its verification boundary; executable verification covers the new filesystem helper, startup hook, notifier compatibility, renderer partition contract, restore identity, real webviews, and packaged application. Adversarial review: checked exact legacy/v4 UUID/13-digit timestamp plus 1–14 lowercase-hex fallback recognition, uppercase/malformed/path-type rejection, top-level symlink retention, missing and unreadable roots, `lstat`/remove races that surface as `ENOENT`, per-entry failure continuation, warning caps with complete aggregate totals, main-process ordering, single-instance protection, explicit path injection, current-session partition isolation, and exact exclusion of the user's three pre-existing alignment/research edits. Findings fixed before ship were the renderer fallback's observed 14-character random suffix, case-insensitive macOS fixture collisions, strict UUID filtering in the smoke harness, and packaged guest `capturePage()` instability; screenshot coverage remains in the source smoke while packaged isolation uses cookies, local storage, input, and navigation. Accepted warnings: the first packaged smoke was sandbox-blocked from opening its loopback fixture, then exposed Electron `UnknownVizError` only in unrelated packaged guest screenshot capture; the revised packaged contract passed outside the sandbox. Electron Packager also probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: a future renderer partition naming format will be retained rather than guessed and deleted, and synchronous cleanup time scales with the amount of recognized orphaned Chromium data; both are conservative failure modes. Rollback note: revert the v0.61.4 shipping commit and delete tag/GitHub Release `chromux-v0.61.4`; v0.61.3 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution and shipping skills’ required fields directly. Next command: commit and push the scoped v0.61.4 change, publish `GBlockParty Chromux v0.61.4`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.3 complete OSC color-reply residue cleanup

- Expanded correlated rendered-prompt cleanup from the inner OSC 10/11/12 RGB signature to the exact printable `]signature\`, `]signature`, `signature\`, and `signature` forms, ordered longest-first and removed without trimming or pattern matching.
- Preserved the 24-signature session-local bound, streaming OSC parser, raw PTY forwarding, clean-shadow preference, artifact-only empty resolution, legitimate mixed prompt bytes, and all existing composer acquisition and completion behavior.
- Reproduced the observed adjacent `]10;rgb:e7e7/eded/f7f7\]11;rgb:1111/1818/2727\` residue across wrapped xterm rows and covered existing drafts, clean shadows, mixed prompts, repeated ST/BEL/C1 forms, partial framing, and uncorrelated lookalikes.
- Ship manifest — User goal: remove complete printable framing around correlated Codex OSC color-reply residue and ship the patch; because `chromux-v0.61.2` already existed on `main` for the Recent Threads fix, the next valid patch is v0.61.3. Changed files and per-file purpose: `prototype/renderer/renderer.js` builds the four exact correlated variants and removes all occurrences longest-first; `prototype/scripts/test-composer-renderer.js` proves the real wrapped residue, artifact-only and existing-draft behavior, clean-shadow precedence, exact mixed-text preservation, every framing/terminator form, session isolation, and unchanged PTY bytes; `prototype/package.json` and `prototype/package-lock.json` set 0.61.3; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: no OSC-looking regex, whitespace trim, unrelated text deletion, parser change, PTY mutation, public API, IPC, persistence, schema, completion-intent, history, or size-limit change was introduced. Tests run: the failure-first composer regression failed at the wrapped artifact-only assertion while raw PTY delivery passed, then `test:composer-renderer` passed after implementation; `test:osc-parser`, `test:synchronized-output-renderer`, and `test:themes-renderer` passed; all 48 `prototype/scripts/test-*.js` files passed serially or in the isolated resource-sensitive tail; changed-JavaScript syntax, 0.61.3 metadata consistency, `git diff --check`, source `SMOKE_OK`, package build, both plist fields and non-writing ASAR inspection at 0.61.3, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build tests were skipped because no landing, gallery, alignment, research, or website source is in the shipping boundary; executable verification covered the complete desktop prototype and packaged application. Adversarial review: traced longest-first overlap handling across all four variants and multiple signatures, exact all-occurrence removal, adjacent/repeated/wrapped replies, BEL/ESC-ST/C1 observations, partially and fully stripped framing, 24-signature correlation, clean and contaminated shadows, empty prompts with existing drafts, byte-exact mixed text, uncorrelated printable lookalikes, raw terminal delivery, non-Codex acquisition, completion intent, history recall, multiline wrapping, and prompt bounds. No blocking finding remains. Accepted warnings: sandboxed theme runs reached their fixed timeout without assertions until the existing repo-local PPID-1 test brokers were identified and terminated by exact PID; the unchanged fixture and remaining matrix passed outside the macOS sandbox. Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: cleanup intentionally recognizes only exact printable forms of replies observed in the same session; a future Codex transformation outside those forms will remain visible rather than risk deleting user-authored text. Rollback note: revert the v0.61.3 shipping commit and delete tag/GitHub Release `chromux-v0.61.3`; v0.61.2 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution skill’s required fields directly. Next command: commit and push the scoped v0.61.3 change, publish `GBlockParty Chromux v0.61.3`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.2 stable Threads navigation

- Stopped session focus and activation from mutating `lastActivityAt`, removed the obsolete `recordActivity` activation option, and retained creation, submitted-prompt, turn-transition, rendered-completion, and explicit attention-action activity updates.
- Ignored session-row mouse click events with `detail > 1`, preserving pointer single clicks and keyboard-generated `detail === 0` clicks while preventing a post-render second click from activating a newly exposed Threads row.
- Expanded the real-Electron session-rail regression across stable ordinary, Working, and Needs Attention navigation; Recent group/row reordering from terminal/composer submissions and genuine turn transitions; section-changing completion activation; post-render double clicks; and all existing preview, A–Z, active-row confirmation, and inline-action behavior.
- Ship manifest — User goal: keep Recent Threads ordering stable during navigation, define recency around substantive work, prevent post-render double-click misactivation, and ship v0.61.2. Changed files and per-file purpose: `prototype/renderer/renderer.js` removes activation recency and guards follow-up mouse clicks; `prototype/scripts/test-session-rail-renderer.js` proves stable navigation, meaningful-work reordering, and the rebuilt-DOM hazard while retaining existing interactions; `prototype/README.md` documents meaningful-work recency and stable navigation; `prototype/package.json` and `prototype/package-lock.json` set 0.61.2; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: Recent and A–Z remain available and persisted; creation, prompt, turn, completion, and attention semantics remain intact; no public API, IPC, persistence shape, or restore schema changed. Tests run: the focused regression first failed because ordinary focus still changed recency, then passed after implementation; turn-signal, attention-diagnostics, tab-activity, tab-title, and grouped-tab suites passed; all 48 `prototype/scripts/test-*.js` files passed serially or, after exact cleanup of leaked PPID-1 test daemons, in isolated tail reruns; changed-JavaScript syntax, version consistency, complete removal of `recordActivity`, `git diff --check`, source `SMOKE_OK`, package build, plist/ASAR 0.61.2 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build tests were skipped because no landing, gallery, mobile, design, or website input changed; executable verification covered the complete desktop prototype and packaged application. Adversarial review: traced every `lastActivityAt` write, new versus restored creation, ordinary/Working/Needs Attention focus, completion consumption, custom-group rerenders, restore target activation, pointer details 0/1/2+, single and redundant double clicks, active-row confirmation, preview cancellation, inline attention actions, Recent group/session tie breakers, A–Z isolation, and exact exclusion of the user’s three pre-existing alignment/research edits. No blocking finding remains. Accepted warnings: the complete serial Electron matrix exposed the existing PPID-1 resource-broker daemon leak and the theme fixture timed out until only exact prototype test daemons were terminated; the clean isolated theme and remaining tail passed. Electron Packager also probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. A read-only ASAR CLI inspection unexpectedly extracted over the tracked root website manifest; it was restored exactly from `HEAD`, verified with zero diff, and replaced by a non-writing ASAR API inspection. Residual risk: browser click sequencing is represented by synthetic `MouseEvent.detail` values in the renderer regression; Electron’s underlying DOM event contract is stable, and the conservative guard ignores only repeated mouse clicks. Rollback note: revert the v0.61.2 shipping commit and delete tag/GitHub Release `chromux-v0.61.2`; v0.61.1 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution skill’s required fields directly. Next command: commit and push the scoped v0.61.2 change, publish `GBlockParty Chromux v0.61.2`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.61.0 configurable browser fullscreen layouts

- Replaced the paired browser’s collapsed/fullscreen booleans with session-local `paired`, `terminal`, `browserWorkspace`, and `browserChromux` layout modes, including an exact paired/terminal return mode and retained divider width.
- Added the local `chromux.browserFullscreenBehavior` preference and Settings selector for paired-area expansion, paired → terminal → full-Chromux cycling, or full-Chromux toggling; missing and invalid values default to full Chromux.
- Promoted full-Chromux browser geometry over the complete renderer without native macOS fullscreen or webview remounting, while retaining the browser toolbar, tabs, queue, favorites, console, rail controls, and per-session mode across keyboard session switching.
- Kept Command-Shift-B and the rail collapse control dedicated to paired-browser open/shut behavior, including a direct terminal-focused exit from either expansion mode; updated next-action icons, tooltips, accessible names, and pressed state.
- Ship manifest — User goal: add configurable browser fullscreen behavior with exact session-local restoration and ship v0.61.0. Changed files and per-file purpose: `prototype/renderer/index.html` adds the Settings selector; `prototype/renderer/renderer.js` owns preference validation/persistence, four layout modes, return-state transitions, session switching, shortcut behavior, full-renderer promotion, and test seams; `prototype/renderer/styles.css` owns workspace versus viewport geometry and theme-safe full-renderer layering; `prototype/scripts/test-browser-collapse-renderer.js` proves defaults, invalid fallback, every preference, cycle order, exact returns, divider retention, viewport coverage, chrome occlusion, rail usability, session shortcut switching, state continuity, and Command-Shift-B; package metadata sets 0.61.0; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: layout state remains renderer/session-local, the new preference remains localStorage-only, native fullscreen and preload/IPC/persistence schemas stay unchanged, and browser/terminal DOM nodes remain mounted through every transition. Tests run: the browser-collapse regression failed first because no preference seam existed, then passed after implementation; all 48 `prototype/scripts/test-*.js` files produced passing results, including browser tabs/HTML explorer, browser isolation, shortcuts, session rail, themes/modes, terminal viewport, and webview shortcut coverage; changed JavaScript syntax checks, source `SMOKE_OK`, package build, plist and ASAR 0.61.0 inspection, packaged `SMOKE_OK`, and `git diff --check` passed. Skipped tests: static website suites were skipped because no landing, gallery, mobile, or website source changed; executable verification covered the complete desktop prototype and packaged app. Adversarial review: traced every transition from paired and terminal, behavior changes during both expansion modes, stale/invalid local values, inactive full-Chromux sessions, keyboard activation, close cleanup, theme backdrop-filter containing blocks, overlay/rail z-order, divider drag gating, explicit URL/browser-tab openings, native fullscreen isolation, DOM/webview identity, console/queue/favorites continuity, and exclusion of the user’s pre-existing `alignment/` and `research/` edits. No blocking finding remains. Accepted warnings: the complete serial Electron matrix exposed an existing smoke-harness leak of PPID-1 resource-broker daemons and later launch `SIGABRT`s; only those exact orphan processes were terminated and each affected suite passed unchanged in isolated or outside-sandbox reruns. Electron Packager also probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: full-Chromux geometry depends on disabling an active theme ancestor’s backdrop-filter containing block; the real-Electron viewport and chrome-coverage assertions exercise the default Liquid Glass case, while all eight theme appearances passed their existing renderer suite. Rollback note: revert the v0.61.0 shipping commit and delete tag/GitHub Release `chromux-v0.61.0`; v0.60.4 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the execution skill’s required fields directly. Next command: commit and push `main`, publish `GBlockParty Chromux v0.61.0`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.60.4 queue-close-on-success

- Tracked the latest queue-approved navigation as transient session/tab/URL state, kept its review panel visible during loading, and closed only that panel after a matching successful page completion.
- Advanced the pending target across main-frame redirects, ignored unrelated and stale same-tab completion/failure events, and cleared the state after matching main-frame failure, browser-tab closure, or session closure.
- Preserved immediate dequeue on `OPEN`, existing offline loopback restoration, recheck/server-launch recovery, and unchanged restore snapshots, IPC, and public APIs.
- Ship manifest — User goal: close the browser queue only after its selected page loads successfully, while retaining the queue through loading and failures, and ship as v0.60.4. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns runtime-only pending selection, redirect/failure/success matching, panel closure, and lifecycle cleanup; `prototype/scripts/test-preview-queue-renderer.js` proves dequeue-with-visible-loading, success and redirect closure, unrelated-tab isolation, latest-selection precedence, offline failure recovery, and tab-close cleanup; `prototype/package.json` and `prototype/package-lock.json` set v0.60.4; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: `OPEN` still navigates and dequeues immediately, only the selected page’s successful completion hides the queue, and failures leave recovery controls visible without adding persistence, IPC, or schema surface. Tests run: the new renderer regression first failed because no pending queue-navigation seam existed; `test:preview-queue-renderer`, `test:browser-tabs-html-explorer`, changed-JavaScript syntax checks, version consistency, `git diff --check`, source Electron `SMOKE_OK`, package build, plist and ASAR v0.60.4 inspection, and packaged Electron `SMOKE_OK` passed. Skipped tests: unrelated terminal, agent lifecycle, capture, favorites, projects, resource-broker, update, theme, and static website suites were skipped because the change is confined to paired-browser queue navigation; the focused queue, adjacent browser-tab, source-app, and packaged-app checks exercise the affected runtime boundaries. Adversarial review: traced new versus existing tabs, redirects, multiple redirects, unrelated tabs and sessions, latest same-tab replacement, stale aborted/final events, main-frame versus subframe failures, Electron error-page completion after failure, loopback versus non-loopback behavior, tab/session closure, snapshot exclusion, version metadata, and exact exclusion of the user’s three pre-existing alignment/research edits. No blocking finding remains. Accepted warnings: the first rapid sandboxed Electron rerun aborted before fixture execution with `SIGABRT` and passed unchanged outside the sandbox; Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle; an initial read-only ASAR inspection used an incorrect CLI output mode and the corrected API inspection passed. Residual risk: a future Electron navigation-event ordering change that omits `did-redirect-navigation` could leave a successfully redirected queue selection open rather than closing it; this is the conservative failure mode. Rollback note: revert the v0.60.4 shipping commit and delete tag/GitHub Release `chromux-v0.60.4`; v0.60.3 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the shipping skill’s required fields directly. Next command: commit and push `main`, publish `GBlockParty Chromux v0.60.4`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.60.3 Codex Finder-start update detection

- Built the Codex update service's child environment from the full parent environment while replacing `PATH` with the same augmented search path used for executable discovery.
- Applied that environment to initial version detection, `codex update`, and post-update verification without changing direct `execFile` execution, timeouts, output bounds, progress reporting, install-source selection, caching, or error handling.
- Added a real executable regression with a `#!/usr/bin/env node` Codex fixture, a Finder-like parent PATH, and an augmented service PATH containing the fixture and Node; also asserted all three subprocess phases receive the augmented PATH.
- Ship manifest — User goal: make boot-time Codex update detection work for Node-based launchers when Chromux starts from Finder, and ship the fix as v0.60.3. Changed files and per-file purpose: `prototype/codex-update-service.js` owns the shared child environment and subprocess options; `prototype/scripts/test-codex-update-service.js` proves the real shebang failure mode and all three execution phases; `prototype/package.json` and `prototype/package-lock.json` set v0.60.3; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: executable discovery and child execution now use one canonical augmented PATH, with no public API, IPC, UI, persistence, or schema change. Tests run: the new real-child regression first failed against v0.60.2 because `/usr/bin/env node` inherited the Finder-like PATH, then passed after implementation; `test:codex-update-service`, `test:codex-update-gate-renderer`, changed-JavaScript syntax checks, version consistency, source Electron `SMOKE_OK`, package build, plist and ASAR v0.60.3 inspection, packaged Electron `SMOKE_OK`, and `git diff --check` passed. Skipped tests: unrelated renderer, resource-broker, browser, capture, project, theme, and static website suites were skipped because the change is isolated to the Codex update service and its existing gate contract; executable verification covered the affected service, renderer gate, source app, and packaged app. Adversarial review: traced environment capture, PATH replacement while preserving other variables, real `/usr/bin/env node` resolution, initial/cache/install/verification flows, missing executable and failed verification behavior, progress output, unchanged timeout/output limits, direct no-shell execution, and exact exclusion of the user's three pre-existing alignment/research edits. No blocking finding remains. Accepted warnings: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle; the first sandboxed packaged Electron launch exited before application output and passed unchanged outside the sandbox. Residual risk: the child environment intentionally snapshots `process.env` when the service is created, matching its existing `envPath` snapshot; later process-environment mutations are not propagated. Rollback note: revert the v0.60.3 shipping commit and delete tag/GitHub Release `chromux-v0.60.3`; v0.60.2 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the shipping skill's required fields directly. Next command: commit and push `main`, publish `GBlockParty Chromux v0.60.3`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.60.2 correlated OSC color-reply cleanup

- Made terminal-input OSC parsing streaming across split `ESC`/`]` introducers and split `ESC`/`\` terminators while continuing to forward the original xterm input bytes to the PTY unchanged.
- Recorded at most 24 bounded, session-local printable signatures for observed OSC 10/11/12 replies, then correlated those signatures before accepting a Codex-rendered prompt as canonical.
- Preferred the clean keystroke shadow when available, removed only exact correlated residue when no shadow exists, and treated artifact-only rendered prompts as empty without clearing the PTY line.
- Ship manifest — User goal: prevent OSC color replies from entering Compose through the Codex rendered-prompt path while preserving autocomplete, history, multiline wrapping, normal user text, non-Codex behavior, and terminal protocol delivery. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns the streaming input parser, bounded reply signatures, and conservative Codex prompt acquisition; `prototype/scripts/test-composer-renderer.js` proves split boundaries, repeated replies, clean-shadow preference, artifact-only and mixed prompts, uncorrelated lookalikes, autocomplete/history/multiline behavior, non-Codex fallback, and unchanged PTY bytes; `prototype/package.json` and `prototype/package-lock.json` set v0.60.2; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: only exact color-reply residue observed in the same live session is eligible for removal, no public bridge or persisted schema changes, and the unmodified byte stream still reaches the PTY. Tests run: the new focused regression first failed at the split OSC introducer, then passed after implementation; all 27 renderer suites passed outside the macOS Electron sandbox, with the theme fixture passing unchanged in immediate isolation after one empty-output timing failure; changed-JavaScript syntax checks, version consistency, `git diff --check`, source `SMOKE_OK`, package build, packaged plist/ASAR v0.60.2 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website suites are unrelated because no landing, gallery, alignment, research, or website input is in the shipping boundary; executable verification covered the full renderer and packaged-application scope. Adversarial review: traced BEL, C1, and `ESC`/`\` termination, introducer and terminator splits, ordinary CSI split after `ESC`, adjacent and repeated replies, bounded malformed content, per-session isolation, clean-shadow precedence, artifact-only and mixed residue, exact uncorrelated lookalikes, Codex completion intent, history recall, multiline wrapping, non-Codex prompt transfer, and exact exclusion of the user’s three pre-existing alignment/research edits. The review added an explicit split non-OSC CSI regression; no blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 app. Residual risk: correlation intentionally recognizes only OSC 10/11/12 replies whose printable signature is preserved exactly by Codex; a future Codex transformation of that residue will conservatively leave it untouched rather than risk deleting user text. Rollback note: revert the v0.60.2 shipping commit and delete tag/GitHub Release `chromux-v0.60.2`; v0.60.1 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the shipping skill’s required fields directly. Next command: commit and push `main`, publish `GBlockParty Chromux v0.60.2`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.60.1 atomic Codex terminal redraws

- Added a renderer-local DEC synchronized-output adapter that removes `CSI ?2026 h`/`l` across every PTY chunk boundary, buffers open frames, and sends each completed Codex redraw to xterm.js in one write.
- Preserved ordinary output grouping and ordering, OSC extraction, titles, preview detection, rendered-completion recovery, terminal scrolling, themes, composer input, and shell adoption; repeated begin and unmatched reset markers are consumed without exposing protocol bytes.
- Bounded malformed frames to one second or 1 MiB, restored incomplete marker bytes after timeout, flushed pending output on PTY exit, and discarded timers/buffers on session close.
- Ship manifest — User goal: stop intermittent whole-pane flashing and vertical input shifts in Codex without taking the riskier xterm.js 6 migration. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns synchronized-output session state, parsing, bounded flushing, PTY routing, lifecycle cleanup, and the smoke-only test seam; `prototype/scripts/test-synchronized-output-renderer.js` uses real xterm to exercise every split boundary and Codex-style clear/reposition/redraw frames plus prefix/suffix, repeated/unmatched markers, timeout, cap, and disposal; `prototype/package.json` registers the regression and sets v0.60.1; `prototype/package-lock.json` keeps lock metadata aligned; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: xterm.js remains at 5.5, only the two DEC 2026 markers are intercepted, completed frames reach xterm, preview detection, and completion recovery exactly once, and all other PTY bytes retain their existing path. Tests run: the new synchronized-output fixture first failed because no adapter existed, then passed; the requested themes, composer, terminal-scroll, turn-signal, session-rail, browser-collapse, shortcut, and shell-adoption suites passed; all 44 registered `test:*` scripts passed serially or unchanged in immediate isolation; changed-JavaScript syntax checks, version consistency, `git diff --check`, source `SMOKE_OK`, package build, packaged plist v0.60.1 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build checks were skipped because no landing, gallery, alignment, research, or website build input is in the shipping boundary; the complete desktop prototype matrix and packaged app were executed. Adversarial review: traced markers split at every byte, multiple frames per chunk, ordinary ANSI and OSC traffic, repeated begin, unmatched reset, empty frames, incomplete marker timeout, UTF-8 byte accounting, cap reset, PTY exit, close-before-timeout, callback generation capture, and exact exclusion of the user’s three pre-existing alignment/research edits. The review found and fixed an initial parser that preserved bytes but split ordinary ANSI chunks into intermediate writes, which could trigger early rendered-completion recovery; the existing turn-signal suite now guards that integration boundary. Accepted warnings: grouped-tabs, HTML-explorer, and themes Electron fixtures each hit an unrelated timing-sensitive assertion during the long serial matrix and passed immediately unchanged in isolation; Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 app. Residual risk: a synchronized redraw that legitimately takes longer than one second or exceeds 1 MiB is intentionally released early to avoid hidden or unbounded output; future xterm.js migration work should remove the adapter only after equivalent native DEC 2026 and viewport tests pass. Rollback note: revert the v0.60.1 shipping commit and delete tag/GitHub Release `chromux-v0.60.1`; v0.60.0 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. `docs/quality-gate-contract.md` is absent, so this manifest applies the shipping skill’s required fields directly. Next command: commit and push `main`, publish `GBlockParty Chromux v0.60.1`, and verify GitHub `/releases/latest`.

## 2026-07-25 — Chromux v0.60.0 paired-browser fullscreen and queue reveal

- Added per-session paired-browser fullscreen within the Chromux session workspace, keeping the permanent 40px rail and dividing it into equal collapse/open and fullscreen controls with native tooltips and accessible labels.
- Restored the exact prior collapsed or split layout on fullscreen exit, retained split width and all browser-owned state, and made both the collapse control and Command-Shift-B shut a fullscreen browser directly into the terminal-focused collapsed layout.
- Changed Needs Attention queue `OPEN` to activate its session, restore a collapsed browser, reveal the review queue, and leave the queued URL unconsumed and unnavigated.
- Ship manifest — User goal: reveal collapsed queues from Needs Attention and add browser-only workspace fullscreen without losing browser state or changing persisted workspace/public APIs. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns transient fullscreen/return state, layout transitions, split rail controls, queue reveal, shortcut behavior, and test accessors; `prototype/renderer/styles.css` owns equal rail geometry and full-workspace browser layout; browser-collapse and session-rail renderer tests prove transition, geometry, accessibility, queue, and state-preservation behavior; package metadata sets v0.60.0; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: fullscreen is session-local and transient, the existing expanded grid template remains the divider-width authority, collapse remains the terminal-focused state, and attention queue review uses the existing panel without invoking the queue row’s navigation/consumption action. Tests run: browser-collapse, session-rail, shortcuts, browser-tabs/HTML-explorer, and theme renderer suites; capture-records renderer and browser-isolation smoke; changed-JavaScript syntax checks; version consistency; `git diff --check`; source `SMOKE_OK`; package build; plist/ASAR v0.60.0 inspection; and packaged `SMOKE_OK` all passed. Skipped tests: the remaining unrelated prototype matrix was not used as release proof because repeated serial Electron launches encountered host-wide macOS app-registration contention; all suites named by the approved test plan plus source and packaged application checks passed, and no public bridge, persistence schema, main process, preload, resource broker, update, agent lifecycle, or website source changed. Adversarial review: traced entry/exit from both collapsed and split layouts, exact divider restoration, per-session switching, mounted webview/tab/URL/queue/console retention, narrow toolbar overflow, terminal refits, rail geometry and accessibility, divider disabling, collapse-control and shortcut shutdown from fullscreen, and focused queue attention without consumption. The review found and fixed a synthetic renderer fixture missing the new rail button and a test-only dead-localhost race that legitimately added failure-recovery queue entries; no product defect remains. Accepted warning: Electron Packager probed for an optional `.icon` format before successfully producing the correctly versioned arm64 app. Residual risk: fullscreen is intentionally transient and therefore returns to the normal collapsed default after application restart; no persisted-workspace schema change was requested. Rollback note: revert the v0.60.0 shipping commit and delete tag/GitHub Release `chromux-v0.60.0`; v0.59.1 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: commit and push `main`, publish `GBlockParty Chromux v0.60.0`, and verify GitHub `/releases/latest`.

## 2026-07-24 — Chromux v0.58.7 Codex skill-autocomplete transfer

- Preserve each Codex session's exact pre-completion input prefix when Tab is sent, then allow a chrome-free rendered prompt to become canonical only when it is a strict, bounded extension of the same `$` token.
- Return extracted prompt text with ambiguous render status, preserve cursor-cell trailing spaces and wide Unicode safely, and invalidate completion intent after further input, successful resolution, incompatible rendering, submission, cancellation, or session exit.
- Extend the real-xterm composer regression with chrome-free `$inve` → `$investigate ` transfer, narrow wrapping, following text, immediate reopen, and missing, incompatible, and intervening-input rejection cases.
- Ship manifest — User goal: fix Compose transferring stale `$inve` after Codex visibly completes `$investigate`, without weakening ambiguous terminal-output safeguards. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns session-scoped Tab intent, ambiguous candidate extraction, strict completion proof, Unicode-safe cursor-bound rendering, invalidation, and canonical transfer; `prototype/scripts/test-composer-renderer.js` proves the reported sequence and negative boundaries in real xterm; `prototype/package.json` and `prototype/package-lock.json` set v0.58.7; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: the Tab intent connects the stale keystroke shadow to Codex's rendered completion, while same-prefix, strict-extension, token-boundary, agent, session, and invalidation checks keep unrelated `›` output on the existing conservative fallback. Tests run: changed JavaScript syntax checks; `npm run test:composer-renderer`; `npm run test:shortcuts-renderer`; `npm run test:turn-signals-renderer`; source `npm run smoke`; `npm run package`; packaged plist version inspection; packaged `SMOKE_OK`; and `git diff --check` passed. Skipped tests: unrelated resource broker, browser, capture, projects, themes, update, and website suites do not exercise terminal input tracking, rendered composer extraction, or the unchanged public bridge; no lint or typecheck script exists. Adversarial review: traced no-Tab output, incompatible tokens, equal/non-strict tokens, token boundaries, post-Tab edits and controls, submission/cancellation, session exit/replacement, resolved chrome/framed prompts, non-Codex sessions, repeated open/clear behavior, narrow wrapping, following text, trailing spaces, emoji cell width, and 64 KiB overflow; the first focused run exposed and the fix corrected a surrogate split caused by treating xterm cell columns as JavaScript string offsets. Accepted warning: Electron Packager probed for an optional `.icon` format before successfully producing the correctly versioned arm64 app. Residual risk: the proof recognizes Codex skill-token characters (`A–Z`, `a–z`, digits, colon, underscore, and hyphen); a future Codex skill syntax using other characters will conservatively retain the shadow until this allowlist is updated. Rollback note: revert the v0.58.7 shipping commit and delete tag/GitHub Release `chromux-v0.58.7`; v0.58.6 remains the prior release. Deploy skipped: no explicit manual deploy contract exists. `docs/quality-gate-contract.md` is absent, so this manifest applies the shipping skill's required fields directly. Next command: commit and push `main`, publish `GBlockParty Chromux v0.58.7`, and verify GitHub `/releases/latest`.

## 2026-07-24 — Chromux v0.58.6 group-aware Command-digit switching

- Changed `⌘1` through `⌘9` in grouped mode to index the visible primary group strip, restore the destination group’s remembered session on entry, and cycle its visible lower session order with wraparound on repeated presses.
- Kept one-session groups stable, ignored empty group slots, preserved modal/editable-focus guards, returned group/session identifiers for diagnostics and tests, and retained global session indexing in flat mode.
- Updated Developer Mode shortcut descriptions to identify group targets and empty group slots without changing the shared main-process chord or IPC payload.
- Ship manifest — User goal: make Command-digit switching follow primary group-tab order and cycle within each group while preserving flat-mode behavior. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns grouped shortcut interpretation, selected identifiers, and mode-aware debug descriptions; `prototype/scripts/test-session-tab-groups-renderer.js` proves visible-index selection, remembered entry, cycling, wraparound, one-session stability, empty slots, custom-group precedence, and flat fallback; `prototype/scripts/test-hotkey-debug-renderer.js` proves grouped and flat catalog descriptions; `prototype/package.json` and `prototype/package-lock.json` set v0.58.6; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: the existing zero-based shortcut payload now resolves through `effectiveTabGroups()` only when grouping is enabled, and every selected session still flows through the existing activation path. Tests run: shortcut renderer, hotkey-debug renderer, grouped-tab renderer, and webview shortcut smoke passed; changed JavaScript syntax checks, source `SMOKE_OK`, package build, plist and ASAR version 0.58.6 inspection, packaged `SMOKE_OK`, and `git diff --check` passed. The first grouped-tab run hit its existing spinner-animation elapsed-time timing assertion before the new shortcut coverage; an immediate isolated rerun passed unchanged. Skipped tests: the remaining prototype matrix and static website suites were skipped because the changed behavior is confined to numeric shortcut routing and diagnostics, with the four requested runtime suites plus source and packaged smoke covering the affected boundaries. Adversarial review: traced custom-before-directory ordering, remembered and never-visited entry, active-session membership versus focused-group state, visible lower order, last-to-first wrap, one/zero-session targets, invalid indices, modal/host/guest editable guards, direct renderer and main-process IPC paths, flat-mode return shape, catalog availability, and unchanged chord/payload ownership; no blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before successfully producing the correctly versioned arm64 app. Residual risk: effective group order is intentionally derived live on each keypress, so a simultaneous group membership/order change makes the newest visible order authoritative. Rollback note: revert the v0.58.6 shipping commit and delete tag/GitHub Release `chromux-v0.58.6`; v0.58.5 remains the prior release. Deploy skipped: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: commit and push `main`, publish `GBlockParty Chromux v0.58.6`, and verify GitHub `/releases/latest`.

## 2026-07-24 — Chromux v0.58.4 grouped-tab interaction continuity

- Reconciled aggregate group tabs and mounted session tabs by stable DOM identity instead of rebuilding both grouped strips during ordinary state updates.
- Kept hover handling local to title-marquee classes, coalesced badge/tab invalidation into one render, and restored reliable lower session-tab activation after hover.
- Added real-Electron regression coverage for exact group/session spinner nodes, CSS Animation identity and elapsed time, zero child detachments during title/hover updates, and post-hover session activation.
- Ship manifest — User goal: stop grouped-mode Working indicators from repeatedly resetting or appearing paused and make lower session tabs reliably activate their corresponding terminals. Changed files and per-file purpose: `prototype/renderer/renderer.js` preserves keyed tab nodes, narrows hover updates, and removes duplicate badge-triggered rendering; `prototype/scripts/test-session-tab-groups-renderer.js` proves DOM, animation, hover, and activation continuity; `prototype/package.json` and `prototype/package-lock.json` set v0.58.4; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: mounted group/session nodes retain their active CSS animations and pointer identity while existing status, count, badge, ordering, overflow, focus, and flat-mode behavior remain authoritative. Tests run: all 46 `prototype/scripts/test-*.js` files passed serially outside the macOS app-registration sandbox; changed renderer syntax, metadata consistency, `git diff --check`, source `SMOKE_OK`, package build, bundle plist/ASAR v0.58.4 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website suites were skipped because no landing, gallery, mobile, or website source changed; executable verification covered the complete prototype runtime and packaged application. Adversarial review: traced flat/grouped transitions, stable and changing group order, stale-group removal, focused-group changes, hidden session tabs, sticky action movement, status/badge projection, hover enter/leave idempotence, animation-node identity, pointer target continuity, and render-flush ordering; no blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before successfully producing the arm64 app with the existing icon assets. Residual risk: an actual group membership or grouping-mode transition can still move a tab between containers and restart its animation once, which is expected because the rendered navigation context genuinely changes. Rollback note: revert the v0.58.4 commit and delete tag/GitHub Release `chromux-v0.58.4`; v0.58.3 remains the prior release. Next command: commit and push `main`, publish `GBlockParty Chromux v0.58.4`, and verify GitHub `/releases/latest`.

## 2026-07-24 — Chromux v0.58.0 two-level session tab groups

- Added an opt-in upper group strip and always-present lower session strip while preserving the existing flat navigation by default; automatic groups use exact normalized cwd identity, duplicate basenames gain the shortest unique parent suffix, and custom groups lead in creation order.
- Added persistent Settings CRUD for bounded custom groups, focused context-menu movement with automatic/create options, last-active group navigation, search/shortcut cross-group reveal, horizontal overflow handling, and aggregate group count/status/attention badges.
- Upgraded restore snapshots to schema v8 with sanitized custom membership and focus flags, legacy v1–v7 reads, orphan fallback, exact focus restoration, same-group fallback after partial failures, and successful-session-first rebuilding.
- Ship manifest — User goal: add opt-in session grouping with two-level navigation, persistent custom management and exact-cwd automatic grouping, restart-safe membership/focus, aggregate status, and no flat-mode regression. Changed files and per-file purpose: `prototype/renderer/index.html` adds the two strips and Settings controls; `prototype/renderer/renderer.js` owns validated local definitions, effective ordering/labels, navigation, movement, CRUD, badges/status, snapshot metadata, restore focus, and test seams; `prototype/renderer/styles.css` owns overflow, selected/focus/attention states, two-row theme geometry, picker, and Settings presentation; `prototype/main.js` sanitizes schema-v8 membership/focus while stripping those fields from legacy reads; the new grouping suite plus restore/composer updates prove behavior and schema compatibility; README/privacy/release/task files and package metadata define v0.58.0. User-goal mapping: flat mode retains the original DOM order and behavior; grouped mode derives exact normalized cwd identity unless valid custom membership exists, restores last-active/exact focus after all successful sessions are rebuilt, and routes every existing search/shortcut activation through the same group-aware activation path. Tests run: the requested grouping, tab-title, tab-activity, shortcuts, themes, restore identity, Developer Mode, and update-queue suites passed; all 46 `prototype/scripts/test-*.js` files passed serially outside the macOS app-registration sandbox; changed JavaScript syntax, version consistency, `git diff --check`, source `SMOKE_OK`, package build, bundle plist 0.58.0, and packaged `SMOKE_OK` passed. Skipped tests: static website suites were skipped because no landing, gallery, mobile, or website source changed; executable verification covered the complete prototype runtime and packaged application. Adversarial review: checked corrupt/oversized local records, case-insensitive duplicate and bounded names, path case/symlink preservation, root/trailing separators, shortest unique parent labels, stable custom/directory/session ordering, empty groups, confirmed nonempty deletion, active moves, nested picker focus/bubbling, active/working/completed/exited/queue aggregation, both overflow strips, search/numeric navigation, schema-v1–v7 isolation, invalid/orphan IDs, multiple focus flags, partial restore failure cleanup, same-group/global fallbacks, Codex restore concurrency, and flat-mode restoration. Findings fixed before ship were the already-claimed v0.57.0 release number (advanced to v0.58.0), nested picker click propagation, stale composer schema-v7 assertion, legacy snapshots accepting v8-only fields, and partial PTY-creation cleanup. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the arm64 app with existing icon assets. Residual risk: group definitions intentionally remain device/profile-local and restore membership falls back to directory grouping if those definitions are removed; cross-device sync, drag reordering, and crash-recovery expansion remain out of scope. Rollback note: revert the v0.58.0 shipping commit and delete tag/GitHub Release `chromux-v0.58.0`; v0.57.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.58.0 implementation, publish `GBlockParty Chromux v0.58.0`, and verify `/releases/latest`.

## 2026-07-24 — Chromux v0.57.0 attention-aware terminal previews

- Added a visible, summary-only Needs Attention band between each inactive Threads preview header and terminal mirror, driven directly by the existing session attention projection.
- Rendered every projected reason in priority order with its semantic label, color, expanded detail, restored-history context, and queued-preview URL; open previews now synchronize as reasons are added, resolved, or reordered.
- Added an accessible attention description, independent scrolling at the compact/comfortable/large caps, a 120px terminal minimum, opaque theme surfaces, and a stale resize-frame ownership guard.
- Ship manifest — User goal: show all outstanding session attention details in terminal hover/focus previews without changing attention semantics, actions, persistence, or preview activation behavior. Changed files and per-file purpose: `prototype/renderer/renderer.js` projects session-only attention into the open preview, maintains its accessible description, synchronizes live changes, guards disposed-preview resize frames, and exposes attention/geometry test state; `prototype/renderer/styles.css` owns the bounded band layout, semantic detail presentation, scrolling, hidden state, and opaque theme materials; `prototype/scripts/test-session-rail-renderer.js` proves single/multiple/none states, priority and complete detail text, queued URLs, restored overflow, live add/resolve/reorder synchronization, action-free rows, ARIA, all three size caps, terminal minimum height, pointer/keyboard/click lifecycle, and all eight theme appearances; `prototype/package.json` and `prototype/package-lock.json` set 0.57.0; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: preview rows reuse `attentionItems()` and filter exact session scope, so global update items remain excluded and current ordering, suppression, queue, capture, completion, and restored-record contracts stay authoritative; the band contains no buttons and all preview clicks retain activation. Tests run: `npm run test:session-rail-renderer`, `npm run test:preview-queue-renderer`, `node scripts/test-attention-diagnostics-renderer.js`, `npm run test:themes-renderer`, changed-JavaScript syntax checks, version consistency, `git diff --check`, source `SMOKE_OK`, package build, plist/ASAR 0.57.0 inspection, and packaged `SMOKE_OK` passed. The first sandboxed session-rail launch aborted with `SIGABRT` before assertions and passed outside the sandbox; the first theme run ended with no assertion output and passed cleanly on an isolated rerun. Skipped tests: the remaining prototype matrix and static website suites do not independently consume terminal-preview attention DOM; the changed projection and all adjacent preview, queue, diagnostics, theme, source-app, and packaged-app paths received executable coverage. The requested live manual UI inspection was attempted, but the Computer Use connector timed out before returning app state; the real-Electron session-rail regression supplies pointer-hover, keyboard-focus, semantic-color, opacity, padding, and geometry coverage in its place. Adversarial review: traced recursion through attention invalidation, exact global/session filtering, live and restored coexistence, priority stability, queue URL expansion, semantic colors, ARIA name/description precedence, empty-band omission, scroll/click propagation, minimum terminal geometry, theme opacity, title synchronization, and preview disposal. Findings fixed before ship were missing initial band synchronization, translucent Liquid Glass/semantic band backings, and a scheduled size callback touching a disposed xterm preview; no blocking finding remains. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the arm64 app with the existing icon assets. Residual risk: direct human visual inspection remains uncompleted because the desktop connector timed out, but the same real Electron runtime exercised all eight appearances and both opening modes with pixel geometry and computed-style assertions. Rollback note: revert the v0.57.0 shipping commit and delete tag/GitHub Release `chromux-v0.57.0`; v0.56.2 remains the prior release. Deploy: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: commit and push the scoped v0.57.0 change, publish `GBlockParty Chromux v0.57.0`, and verify `/releases/latest`.

## 2026-07-24 — Chromux v0.56.2 simplified attention session cards

- Removed the separate lifecycle-status icon from Needs Attention session headers and used the recovered width for the single-line session title.
- Rendered the highest-priority reason once at the header edge with semantic color and `+N`, kept its summary/actions without a repeated label, and retained labels for additional reasons.
- Allowed summaries to wrap to two lines while preserving actions, ordering, counts, row activation, previews, keyboard behavior, and natural-language accessible status descriptions.
- Ship manifest — User goal: eliminate the three-way completion repetition in attention session cards without changing attention state or lifecycle behavior. Changed files and per-file purpose: `prototype/renderer/renderer.js` owns the attention-card header/body DOM, semantic reason metadata, accessible status projection, and smoke-only inspection helpers; `prototype/renderer/styles.css` owns semantic header/additional-reason colors, recovered card spacing, and two-line summary clamping; session-rail, Streak click-target, tab-activity, theme, and update-queue tests cover the redesigned DOM and preserved interactions; the theme fixture now uses an isolated temporary home so live Chromux state cannot preempt the renderer test; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.56.2. User-goal mapping: the highest-priority reason is the sole header status (`COMPLETE` for completion), primary body rows contain only summary/actions, additional rows retain their label/summary/actions and semantic colors, ordinary and Working rows still render their existing lifecycle icon, and no attention reducer, API, IPC, persistence, ordering, or restore schema changed. Tests run: the new session-rail regression first failed against the duplicate green check; session rail, turn signals, attention diagnostics, update queue, Streak native click targets, themes, and tab activity indicators passed; all 45 `prototype/scripts/test-*.js` files passed serially outside the macOS app-registration sandbox with the HTML-explorer fixture using a canonical `/private/tmp`; changed-JavaScript syntax, metadata consistency, `git diff --check`, source `SMOKE_OK`, package build, plist/ASAR 0.56.2 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website suites do not exercise prototype attention cards; the complete prototype runtime and packaged application otherwise received executable coverage. Adversarial review: traced completion-only, primary-plus-count, mixed permission/completion semantic colors, additional labels/actions/order, two-line clamping, accessible Completed/Action required descriptions, title ellipsis, ordinary/Working status icons, click/double-click/preview/focus/dismiss behavior, diagnostics comparisons, restore records, update queue ordering, and theme-specific hit-target geometry. The full matrix found and fixed the tab-activity fixture's obsolete expectation that attention rows retain a `.rail-status` node and isolated the theme fixture from the live app profile; no blocking finding remains. `docs/quality-gate-contract.md` and the task-doc audit script are absent, so this manifest applies the required fields directly. Accepted warning: sandboxed Electron launches can abort with `SIGABRT`; the authoritative matrix ran outside that sandbox. Residual risk: CSS line clamping depends on Electron's supported WebKit implementation, which is exercised by the real-Electron geometry assertion across the current runtime. Rollback note: revert the v0.56.2 commit and delete tag/GitHub Release `chromux-v0.56.2`; v0.56.1 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.56.2 change, publish `GBlockParty Chromux v0.56.2`, and verify `/releases/latest`.

## 2026-07-24 — Chromux v0.56.1 research review and saved-project test stability

- Refreshed the GIGACHADD integration-map alignment page as a Stage 2 artifact review with re-verified public-source limits, expanded evidence and integration seams, explicit approval gates, section feedback, and compiled YAML responses; updated the alignment index to route reviewers to it.
- Replaced the saved-project renderer fixture's fixed 1.2-second startup delay with a bounded poll for the actual server URL approval-queue outcome, preserving the existing ten-second failure ceiling and behavioral assertions.
- Ship manifest — User goal: wrap up and ship the current alignment-review and saved-project regression work cleanly. Changed files: `alignment/devtool-integration-map-gigachadd-process.html` contains the revised Stage 2 review, approval gates, feedback controls, response compiler, and narrow-screen code wrapping; `alignment/index.html` identifies and orders the refreshed review; `prototype/scripts/test-projects-renderer.js` waits for the asserted URL queue condition; `prototype/package.json` and `prototype/package-lock.json` set v0.56.1; `RELEASES.md`, `tasks/todo.md`, and this entry record the patch. Per-file purpose and user-goal mapping: the alignment files provide the review artifact without performing Stage 3 canonical writes, the renderer test removes a known startup race without weakening its assertions, and metadata/task files satisfy the repository shipping contract. Tests run: `npm run test:projects-renderer` passed four times total from `prototype/`; source and packaged Electron smoke both returned `SMOKE_OK`; `npm run package` produced an arm64 app whose plist, ASAR metadata, and selected `electron.icns` all report v0.56.1; root `npm run build` and `npm test` passed serially, verifying all 36 desktop viewers at four viewport sizes and seven mobile routes; changed-JavaScript syntax, metadata consistency, `git diff --check`, and the final secret-pattern scan passed. A targeted headless-Chromium audit exercised the revised page at 1440px and 480px, toggled the chart/table, approved all seven gates, compiled complete approval YAML, compiled clarification feedback YAML, and observed zero runtime exceptions. Skipped tests: the remaining prototype renderer/unit matrix was not rerun because product runtime code, dependencies, IPC, persistence, and schemas are unchanged; the changed fixture passed repeatedly and both source and packaged applications were executed. The in-app browser surface was unavailable, so the repository Chromium/CDP harness supplied equivalent local browser verification; TTS playback and the successful Clipboard API permission path remain outside automated coverage. Adversarial review: walked the exact eight-file boundary for weakened assertions, unbounded polling, stale Stage 3 claims, missing approval blockers, malformed YAML status, runtime exceptions, mobile overflow, package-version drift, and unrelated generated-skill artifacts. The browser audit found a 65px mobile overflow from a long inline code path; adding `overflow-wrap:anywhere` to inline code fixed it, and the same interaction/layout audit then passed. The first root build/test attempt was mistakenly concurrent against their shared `dist-site` output and failed through mutual file deletion; both exact commands passed serially, proving no source failure. The packager's optional `.icon` probe warning is accepted because `electron.icns` was selected and the packaged metadata/smoke passed. Residual risk: browser clipboard success depends on permission and secure-context policy not present in the headless local audit, but the page exposes a selectable-text fallback; TTS uses the unchanged shared script and was not replayed. Rollback note: revert the v0.56.1 shipping commits and delete tag/GitHub Release `chromux-v0.56.1`; v0.56.0 remains the prior release. Next command: commit and push the scoped v0.56.1 boundary, publish `GBlockParty Chromux v0.56.1`, and verify `/releases/latest`.

## 2026-07-24 — Chromux v0.56.0 focused action-required attention

- Narrowed focused-session suppression so live input, permission, authentication, rate-limit, and tool-failure states remain visible in Needs Attention, while focused completion, queue, delivery failure, acknowledged action, and restored-history records stay hidden.
- Reused the existing Threads projection to keep the active action-required row amber, `aria-current`, directly interactive, counted, and deduplicated from Working and cwd groups; a resumed turn moves back to Working normally.
- Ship manifest — User goal: keep focused sessions visible in Needs Attention only while their live turn requires user action. Changed files and per-file purpose: `prototype/renderer/attention.js` narrows active-session projection and makes diagnostics suppression conditional on an actually empty projection; `prototype/scripts/test-attention-diagnostics.js` covers all five focused action projections plus acknowledged, queue, and delivery suppression; `prototype/scripts/test-attention-diagnostics-renderer.js` proves focused diagnostics report PERMISSION rather than `SUPPRESS active-session`; `prototype/scripts/test-turn-signals-renderer.js` covers labels/actions and focused completion, queue, and restored-history suppression; `prototype/scripts/test-tab-activity-indicators-renderer.js` preserves the focused amber action indicator; `prototype/scripts/test-session-rail-renderer.js` proves Needs Attention membership, Working/cwd deduplication, `aria-current`, active-row terminal focus/confirmation, count, and resumed Working placement; `prototype/scripts/test-update-queue-renderer.js` updates the shared focused-input expectation without changing update safety; `prototype/package.json` and `prototype/package-lock.json` set 0.56.0; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. User-goal mapping: the shared projection now exempts only unacknowledged live action states from focus suppression, so every existing renderer consumer receives the same item without API or persisted-schema changes. Tests run: the new diagnostics assertion first failed against v0.55.0; attention diagnostics, turn signals, tab activity, session rail, and update queue passed; changed-JavaScript syntax, version metadata, `git diff --check`, source `SMOKE_OK`, package build, plist/ASAR 0.56.0 inspection, and packaged `SMOKE_OK` passed. The broader 45-file prototype matrix passed all relevant and remaining suites; browser-tabs passed alone after sequence-sensitive failures, saved-project server-URL queueing failed identically on untouched v0.55.0 `HEAD`, and the session-rail preview suite passed alone after its known long-matrix timing failure. Skipped tests: static website suites do not exercise prototype attention state; the complete prototype runtime and packaged application otherwise received executable coverage. Adversarial review: traced all five action priorities/labels/actions, active and dead sessions, acknowledged actions, focused completion/queue/delivery/history, simultaneous action plus suppressed queue, diagnostics ordering, update safety, Threads grouping/deduplication, active row click/focus, turn resume, and exclusion of the user’s two unrelated `alignment/` edits; no production renderer, public API, IPC, or persisted-state changes are needed. `docs/quality-gate-contract.md` is absent, so this manifest applies its required fields directly. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned bundle. Residual risk: the session-rail preview test retains pre-existing timing sensitivity under consecutive Electron launches, and the unrelated saved-project fixture currently fails on both v0.55.0 and v0.56.0; neither path is modified here. Rollback note: revert the v0.56.0 commit and delete tag/GitHub Release `chromux-v0.56.0`; v0.55.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.56.0 change, publish `GBlockParty Chromux v0.56.0`, and verify `/releases/latest`.

## 2026-07-23 — Chromux v0.54.1 Codex clear autocomplete state

- Resolved autocomplete-dispatched Codex `/clear` only when the rendered composer is a slash-command prefix and `/clear` is the unique matching command visible in the popup, then routed the resolved command through the existing authoritative Idle boundary and stale-completion suppression.
- Replaced the false-positive completed-text fixture with real xterm `/cl` plus selected-popup rendering, added ambiguous-menu, unrelated-command, argument, diagnostics, tab, Threads, update-safety, and next-prompt lifecycle coverage, and isolated the Grok warning renderer test from the user's live Chromux profile.
- Ship manifest — User goal: make autocomplete-dispatched Codex `/clear` leave Working immediately and project Idle consistently without changing direct typing, composer submission, arguments, unrelated slash prefixes, non-Codex input, persistence, or public APIs. Changed files: `prototype/renderer/renderer.js` owns bounded visible-popup candidate extraction and pre-Enter `/clear` resolution; `prototype/scripts/test-turn-signals-renderer.js` proves the real `/cl` fixture, unique/ambiguous candidates, unrelated prefixes, arguments, direct/composer behavior, stale completions, and next-prompt re-arming; `prototype/scripts/test-attention-diagnostics-renderer.js` proves tracked/expected Idle, tab Idle, update-safe Idle, zero mounted Threads/tab mismatches, and return to Working through the real autocomplete path; `prototype/scripts/test-grok-warning-renderer.js` gives the previously profile-coupled suite a temporary HOME/PATH like the other renderer fixtures; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.54.1. Per-file purpose and user-goal mapping: candidate recognition is Codex-only, standalone-Enter-only, exact-lowercase-prefix-only, and requires one visible matching menu command; the resolved `/clear` still flows through the existing attention reducer, so Threads, tabs, diagnostics, turn tracking, update safety, and delayed-completion rejection share one state transition. Tests run: the corrected `/cl` fixture first failed against v0.54.0 with Working state; after implementation, turn signals and attention diagnostics passed, as did composer, session rail, tab activity indicators, and update queue; all 45 `prototype/scripts/test-*.js` files passed serially outside the macOS app-registration sandbox; changed-JavaScript syntax, metadata consistency, `git diff --check`, source Electron `SMOKE_OK`, package build, plist/ASAR 0.54.1 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build suites were skipped because no landing, gallery, mobile, design, or website build input changed; executable verification covered the complete prototype runtime and packaged application. Adversarial review: traced exact `/clear`, `/cl`, shorter and unrelated prefixes, one/multiple/absent popup candidates, arguments, case sensitivity, wrapped popup descriptions, standalone versus combined Enter payloads, direct terminal and Chromux composer submission, Codex versus non-Codex sessions, idle/working generations, stale rendered/native completions, next-prompt re-arming, Threads grouping, tab indicators, diagnostics mismatch detection, update blockers, bounded buffer scanning, temporary-profile isolation, version metadata, and exact exclusion of the user's two `alignment/` edits. The review found and fixed one-space popup descriptions being omitted from ambiguity detection; the full matrix also exposed and fixed the Grok renderer fixture restoring the live user profile and native PTYs. `docs/quality-gate-contract.md` and the task-doc audit script are absent, so this manifest applies the required fields directly. Accepted warning: initial sandboxed Electron launches aborted with `SIGABRT` before assertions and passed outside the sandbox; Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: recognition depends on the established Codex prompt glyph/chrome and text-visible popup rows; if Codex changes that TUI contract, Chromux conservatively preserves the prefix as an ordinary submission instead of guessing. Rollback note: revert the v0.54.1 commits and delete tag/GitHub Release `chromux-v0.54.1`; v0.54.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.54.1 changes, publish `GBlockParty Chromux v0.54.1`, and verify `/releases/latest`.

## 2026-07-23 — Chromux v0.54.0 Codex-aware DETECT labels

- Added a short-lived, bounded `codex app-server --stdio` metadata adapter that initializes the supported protocol, queries each unique exact cwd for the newest interactive CLI thread, reads newest-first agent items, normalizes and Unicode-bounds labels/excerpts, and cleans up on success, malformed output, timeout, or early exit.
- Preserved rollout-file resume identity independently for every Codex row when the executable or required method is unavailable, including the installed Codex version's current `thread/items/list is not supported yet` response.
- Rendered representative Codex names and latest-agent excerpts as searchable, accessible DETECT content while retaining terminal title/app/TTY/cwd/process/resume metadata, legacy response compatibility, transient excerpt privacy, directory-based FRESH names, and uniqueness-suffixed representative RESUME names.
- Ship manifest — User goal: make DETECT's inferred Codex resume row identifiable by its local thread name/first prompt and latest agent reply without changing exact-directory/newest-thread inference, non-Codex behavior, persistence, or fallback identity. Changed files: `prototype/codex-detect-metadata.js` owns the four-second deadline, 2 MiB aggregate/512 KiB line output bounds, JSON response validation, exact-cwd/CLI/recency filtering, read-only state-DB listing, newest-first item pagination, Unicode normalization, per-cwd failure isolation, and EOF/TERM/KILL cleanup; `prototype/codex-update-service.js` exposes and reuses one Codex executable search contract; `prototype/main.js` merges successful enrichment over the existing rollout index without changing `detect-external`; `prototype/renderer/renderer.js` and `styles.css` own enriched title/excerpt/metadata/search/ARIA presentation and representative resume naming; the fake app server plus adapter, DETECT renderer, and restore-identity tests prove protocol, timeout, malformed/wrong-ID/oversized/unsupported/early-exit, cleanup, fallback, display, search, accessibility, naming, and non-persistence behavior; README, troubleshooting, privacy docs, package metadata, `RELEASES.md`, `tasks/todo.md`, and this entry document v0.54.0. User-goal mapping: names prefer explicit thread name, then first-user preview, then basename; excerpts select the newest nonempty agent message and append `…` only when the 160-code-point cap truncates; only the validated ID and representative launch name can flow into ordinary live/restore session state, never the excerpt. Tests run: the new adapter and enriched DETECT renderer tests first failed against the missing implementation; all 45 `prototype/scripts/test-*.js` files passed through the complete registered prototype suite, with session rail, preview queue, and update queue passing unchanged on isolated rerun after parallel-only timing misses; changed-JavaScript syntax, `git diff --check`, metadata consistency, real installed-Codex protocol shape/fallback probes, source Electron `SMOKE_OK`, package build, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build suites were skipped because no landing, gallery, mobile, design, or website build input changed; executable verification covered the complete prototype runtime and packaged app. Adversarial review: checked executable discovery drift, initialization/experimental negotiation, numeric response IDs, out-of-order replies, exact cwd/source/recency validation, state-DB-only reads, pagination cycles and caps, empty/malformed/oversized output, per-cwd versus global failure, unsupported methods, early exit, timeout and child reaping, UUID/timestamp bounds, control/whitespace normalization, surrogate-safe truncation, ellipsis semantics, tooltip exposure, search/ARIA text, fallback and FRESH compatibility, resume uniqueness, restore sanitation, and exact exclusion of the user's two `alignment/` edits. Findings fixed before ship included sharing executable discovery, correcting per-line versus aggregate stdout bounds, rejecting unsafe timestamp multiplication, preventing app-server scan/repair writes with `useStateDbOnly`, deriving the initialization client version from package metadata, and adding wrong-response-ID/oversized-output/unsupported-method coverage. `docs/quality-gate-contract.md` is absent, so this manifest applies its required fields directly. Accepted warnings: three Electron suites exposed existing parallel timing sensitivity and passed unchanged in isolation; Electron Packager probed for an optional `.icon` format before producing the arm64 bundle. Residual risk: the installed Codex 0.145.0 advertises but does not yet implement `thread/items/list`, so it intentionally uses rollout fallback until Codex enables that method; compatible versions are covered by the fake protocol server and the live installed server validated the shared initialization/thread-list shape. Rollback note: revert the v0.54.0 shipping commit and delete tag/GitHub Release `chromux-v0.54.0`; v0.53.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.54.0 change, publish `GBlockParty Chromux v0.54.0`, and verify `/releases/latest`.

## 2026-07-23 — Chromux v0.53.0 hover preview and single-click activation

- Replaced preview-first Threads clicks with one-click activation for ordinary, Working, and Needs Attention rows, retaining active-row confirmation, inline action isolation, tab revelation, and scheduled terminal or composer focus.
- Added 250 ms pointer-hover and immediate keyboard-focus preview opening, a 150 ms row/preview exit grace, row-owned Escape dismissal, non-modal labelled-region semantics, and pointer/focus-preserving live preview behavior without changing source terminal state.
- Ship manifest — User goal: make hover or keyboard focus preview inactive Threads sessions and make one row click activate them across every section. Changed files: `prototype/renderer/renderer.js` owns the shared hover/focus timers, surface presence, Escape/click lifecycle, non-modal ARIA, preview activation, and smoke-only test controls; `prototype/renderer/styles.css` removes the obsolete focus outline from the now non-focusable preview; `prototype/scripts/test-session-rail-renderer.js` proves delayed open, early leave, row-to-preview grace, focus open/leave, Escape, ordinary/Working/Needs Attention hover and single-click activation, pending-timer cancellation, preview activation, inline-action isolation, redundant double-click safety, live refresh, sizing, title-stable Working DOM, outside/mode/collapse/close dismissal, and eight theme appearances; `prototype/README.md` documents the interaction; `prototype/package.json`, `prototype/package-lock.json`, and `RELEASES.md` define v0.53.0; `tasks/todo.md` and this entry record delivery. Per-file purpose and user-goal mapping: every row is still constructed by one shared helper, every activation still converges on `activateSession()`, the preview keeps its existing serializer/geometry/theme paths, and no IPC, public API, persistence, or restore schema changed. Tests run: the updated session-rail regression first failed against the old click-preview bridge, then passed after implementation and timer hardening; all 44 `prototype/scripts/test-*.js` suites were accounted for serially outside the macOS app-registration sandbox; the pre-existing Streak native pointer suite failed once after prior Electron launches and passed unchanged on immediate isolated rerun, then the remaining eight suites passed; changed-JavaScript syntax, metadata consistency, source Electron `SMOKE_OK`, package build, plist/ASAR 0.53.0 inspection, packaged `SMOKE_OK`, and `git diff --check` passed. Skipped tests: static website build/route suites were skipped because no landing, gallery, mobile, design, or website build input changed; executable verification covered the complete prototype runtime and packaged application. Adversarial review: traced pointer focus versus keyboard focus, early leave, row-to-preview and preview-to-row movement, focus-without-pointer exit, physical cursor presence in Electron, open/close timer ownership, row-to-row hover replacement, click during pending/open preview, active-row confirmation, native double-click ordering without `ondblclick`, inline action propagation, ordinary/Working/Needs Attention construction, attention consumption, tab revelation, terminal/composer focus, title-only row synchronization, live/alternate-buffer refresh, source viewport preservation, sizing, outside click, group collapse, rail changes, session close, ARIA control/label semantics, and exact exclusion of the user’s two `alignment/` edits. The review found and fixed an old-preview close callback canceling a different row’s pending hover; the focus-only grace fixture also neutralizes the real macOS cursor so it does not falsely model continued pointer presence. `docs/quality-gate-contract.md` is absent, so this manifest applies its required fields directly. Accepted warnings: the sandboxed full-suite Electron launch aborted with `SIGABRT` before assertions and passed outside the sandbox; Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: hover timing depends on Electron pointer enter/leave delivery, but deterministic row, preview, focus, and lifecycle coverage exercises every timer boundary; keyboard and click activation remain independent fallbacks. Rollback note: revert the v0.53.0 shipping commit and delete tag/GitHub Release `chromux-v0.53.0`; v0.52.2 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.53.0 change, publish `GBlockParty Chromux v0.53.0`, and verify `/releases/latest`.

## 2026-07-23 — Chromux v0.52.2 rendered clear and spinner continuity

- Captured a trustworthy nonempty Codex prompt from the real xterm buffer immediately before standalone Enter submissions and fed it through the existing shared turn transition, while retaining the keystroke shadow for unsupported, ambiguous, empty, combined paste, and composer timing cases.
- Prevented presentation-only Codex title frames from moving Recent Threads rows or rewriting an unchanged status class, preserving the exact Working spinner element, CSS `Animation` object, and elapsed animation time; A–Z still reorders mounted rows when the normalized label truly changes.
- Ship manifest — User goal: recognize exact rendered Codex `/clear` despite stale autocomplete/history shadows and keep animated terminal titles from restarting Threads Working spinners. Changed files: `prototype/renderer/renderer.js` owns pre-Enter rendered capture, semantic fallback selection, no-op status projection, and order-aware A–Z reconciliation; `prototype/scripts/test-turn-signals-renderer.js` proves real-xterm idle/working clear recognition, partial/autocomplete/history-edited shadows, composer fallback, delayed native/rendered completion rejection, and post-clear re-arming; `prototype/scripts/test-session-rail-renderer.js` proves exact row/spinner/animation identity, monotonic animation time, zero Recent DOM movement, stable order, and genuine A–Z reorder; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.52.2. Per-file purpose and user-goal mapping: all semantic state still flows through the existing attention reducer, all row changes remain renderer-local, and no API, schema, persistence, or restore format changed. Tests run: both new regressions failed against v0.52.1 before implementation; the adversarial empty-render/composer case also failed before fallback hardening; turn signals, session rail, tab activity, composer, attention diagnostics/domain, and update queue passed; all 44 `prototype/scripts/test-*.js` files passed serially outside the macOS app-registration sandbox; final changed-JavaScript syntax, metadata consistency, source Electron `SMOKE_OK`, package build, plist/ASAR 0.52.2 inspection, packaged `SMOKE_OK`, and `git diff --check` passed. Skipped tests: static website route/build suites were skipped because no landing, gallery, mobile, or website build input changed; executable verification covered the complete prototype runtime and packaged application. Adversarial review: traced standalone versus combined Enter payloads, nonempty/empty/unsupported/ambiguous rendered values, autocomplete and history divergence, exact `/clear`, `/clear` with arguments, other slash commands, non-Codex sessions, bracketed multiline composer submission, idle/working boundaries, stale rendered/native completions, next-prompt re-arming, Recent equal-time tie behavior, normalized Braille frames, unchanged status classes, DOM mutation records, live CSS animation identity/time, genuine A–Z label changes, and exact exclusion of the user’s two `alignment/` edits. The review found and fixed resolved-empty prompt precedence so a composer submission cannot be hidden by a not-yet-repainted Codex editor. `docs/quality-gate-contract.md` is absent, so this manifest applies its required fields directly. Accepted warnings: the first sandboxed focused Electron launch aborted with `SIGABRT` before assertions and passed unchanged outside the sandbox; Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: rendered classification intentionally depends on the established Codex prompt glyph and chrome; if that TUI contract changes, Chromux safely falls back to the bounded keystroke shadow. Rollback note: revert the v0.52.2 shipping commit and delete tag/GitHub Release `chromux-v0.52.2`; v0.52.1 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: commit and push the scoped v0.52.2 change, publish `GBlockParty Chromux v0.52.2`, and verify `/releases/latest`.

## 2026-07-23 — Chromux v0.50.1 conservative Codex activity inference

- Captured the submitted terminal line before clearing the input shadow and exempted only exact whitespace-trimmed `/clear` from Codex turn starts or restarts.
- Replaced timestamp callback guards with monotonic turn generations and made rendered completion recovery require a busy post-submission render before an ordinary Codex composer return, while retaining immediate terminal handling for the explicit rate-limit chooser.
- Extended the real-Electron turn-signal fixture for `/clear`, unsubmitted typing, generation preservation and advancement, live output with a still-rendered composer, busy-to-composer completion, stale callbacks, ordinary prompts, and rate-limit recovery.
- Ship manifest — User goal: keep `/clear` and later unsubmitted typing idle without allowing a rendered composer to mark genuinely working Codex sessions idle. Changed files: `prototype/renderer/attention.js` owns exact local-command exemption, generation/latch state transitions, and conservative rendered fallback; `prototype/renderer/renderer.js` captures submitted text before shadow clearing, initializes shared turn state, and binds write callbacks to generations; `prototype/scripts/test-turn-signals-renderer.js` proves the requested lifecycle cases; `prototype/package.json` and `prototype/package-lock.json` set 0.50.1; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. Per-file purpose and user-goal mapping: every UI surface continues to project the shared `session.turn.state`; no tab, Threads, attention, diagnostics, or update-safety workaround was added. The pre-existing `alignment/devtool-integration-map-gigachadd-process.html` and `alignment/index.html` edits remain untouched and are excluded from the shipping boundary. Tests run: turn signals passed after the planned regression first failed on the missing generation; tab activity indicators, session rail, attention diagnostics/domain, update queue, composer, changed-JavaScript syntax, metadata consistency, source Electron smoke, package build, packaged plist 0.50.1 inspection, packaged Electron smoke, task-doc audit when available, and `git diff --check` passed. Skipped tests: unrelated resource-broker, simulator, browser-isolation, capture, preview, favorites, projects, provider-notifier, restore, theme, and website suites do not independently infer or project Codex turn activity; the focused shared-state and affected consumer suites plus source/packaged smokes exercise the changed boundary. Adversarial review: checked exact `/clear` matching versus other slash commands, empty and ordinary submissions, idle/working generations, same-millisecond callbacks, native completion precedence, composer-visible live output, no-composer arming, busy-to-composer recovery, explicit rate-limit termination, active-session completion consumption, version consistency, and dirty-worktree isolation. The review strengthened the live-composer fixture with output rendered below a saved composer cursor; no blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before successfully producing the correctly versioned app. Residual risk: the fallback intentionally remains working if Codex changes its TUI so neither recognizable composer chrome nor the explicit rate-limit chooser can be rendered; native completion notifications remain authoritative. Rollback note: revert the v0.50.1 shipping commit and remove tag/GitHub Release `chromux-v0.50.1`; v0.50.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: monitor the published update and daily-drive `/clear` plus long-running Codex output that leaves the composer rendered.

## 2026-07-23 — Chromux v0.50.0 Threads row double-click activation

- Added native double-click activation to every Threads session row while retaining immediate single-click terminal previews during the gesture.
- Routed ordinary, Working, and Needs Attention rows through the existing session activation path so completed double-clicks dismiss the preview, reveal the tab, and restore terminal or composer focus.
- Extended the real-Electron session-rail smoke API with realistic click, click, and `dblclick` event sequences and covered single-click preview retention, all three Threads sections, scheduled terminal focus, and inline attention-action isolation.
- Ship manifest — User goal: double-click a Threads row to focus that session without weakening the existing preview and attention interactions. Changed files: `prototype/renderer/renderer.js` adds the row `dblclick` activation and smoke-only gesture helpers; `prototype/scripts/test-session-rail-renderer.js` proves inactive single-click preview, ordinary/Working/Needs Attention double-click activation, preview dismissal, scheduled terminal focus, and inline-action isolation; `prototype/package.json` and `prototype/package-lock.json` set 0.50.0; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. The pre-existing `alignment/devtool-integration-map-gigachadd-process.html` and `alignment/index.html` edits remain untouched and excluded from the commit. User-goal mapping: the native row event delegates to the shared `activateSession()` path, which already owns preview dismissal, active-row state, tab revelation, and terminal/composer focus; the regression emits the browser’s two-click-plus-`dblclick` sequence against every rendered section. Tests run: the new session-rail assertion first failed because double-click left the active session unchanged, then `test:session-rail-renderer` passed before and after the 0.50.0 bump; tab-title, composer/focus, Streak attention click-target, tab-activity, and turn-signal renderer suites passed; changed-JavaScript syntax checks, source Electron smoke, metadata consistency, package build, packaged plist/ASAR version inspection, and packaged Electron smoke passed; `git diff --check` passed before this record. Skipped tests: browser preview queue/favorites/projects, capture delivery, update services, resource broker/simulator, restore/provider, theme styling, and website suites do not exercise the unchanged IPC, persistence, browser, provider, or CSS boundaries; the affected rail, tab, focus, attention, turn-state, source-app, and packaged-app paths were executed. Adversarial review: traced active and inactive rows, preview creation during both click events, final `dblclick` ordering, active-row confirmation, title-preserved row identity, ordinary/Working/Needs Attention construction through the shared append helper, action-button event ancestry, completed-attention consumption, requestAnimationFrame focus, composer-open focus, tab revelation, and exact dirty-worktree isolation; no blocking finding remains. Accepted warnings: the first sandboxed source Electron smoke aborted with `SIGABRT` before assertions and passed unchanged outside the sandbox; Electron Packager probed for an optional `.icon` format before successfully producing the correctly versioned app. `docs/quality-gate-contract.md` is absent, so this manifest applies its required fields directly. Residual risk: operating systems may use different double-click timing thresholds, but Chromux relies on the native `dblclick` event and does not introduce a custom timer. Rollback note: revert the v0.50.0 commit and remove tag/GitHub Release `chromux-v0.50.0`; v0.49.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: monitor the published update and daily-drive double-click activation with terminal and expanded composer focus.

## 2026-07-23 — Chromux v0.49.0 rendered Codex prompt transfer

- Added a Codex-only, cursor-anchored xterm buffer snapshot that removes prompt chrome while preserving the current textual editor value across autocomplete expansion, history recall, cursor editing, Unicode, intentional newlines, and visual wrapping.
- Reconciled trustworthy rendered values into the session-local input model and routed empty-draft insertion plus Append, Replace, Copy, and Dismiss through one captured resolution; ambiguous rendered states retain shadow fallback text without clearing live Codex input.
- Extended the real-Electron composer regression with rendered prompts, borders, placeholders, menus, stale submitted rows, ambiguity, overflow, exited sessions, exact clipboard transfer, and unchanged non-Codex behavior.
- Ship manifest — User goal: use the current Codex prompt editor value, rather than replayed literal keystrokes, for automatic COMPOSE transfer and every conflict action. Changed files: `prototype/renderer/renderer.js` owns cursor-anchored rendered extraction, wrap/newline reconstruction, chrome filtering, confidence/fallback resolution, full-value shadow reconciliation, stale-row invalidation, and shared conflict outcomes; `prototype/scripts/test-composer-renderer.js` proves rendered autocomplete/history transformations, Unicode, cursor-era replacement, visual wrapping, intentional lines, decorations, borders, placeholders, menu/output exclusion, stale submission/clear behavior, ambiguity, overflow, Append/Replace/Copy/Dismiss, exited sessions, and non-Codex fallback; `prototype/package.json` and `prototype/package-lock.json` set 0.49.0; `RELEASES.md`, `tasks/todo.md`, and this entry define the release. The pre-existing `alignment/devtool-integration-map-gigachadd-process.html` and `alignment/index.html` edits remain untouched and excluded from the commit. User-goal mapping: Codex sessions resolve one bounded `{ text, source, confidence, canClear }` snapshot before xterm is hidden or resized, trustworthy rendered text replaces the complete shadow model, every composer path consumes the same captured text, and unsupported or ambiguous screens preserve the prior shadow fallback without guessing or clearing ambiguous live input; Claude, Grok, shell, IPC, clipboard, and persistence schemas are unchanged. Tests run: the new rendered-transfer test first failed because `renderPromptFixture` did not exist; all 25 `test-*-renderer.js` suites passed, including the requested composer, shortcuts, turn signals, activity indicators, themes, and terminal scrolling suites; changed-JavaScript syntax checks, metadata consistency, source Electron smoke, `git diff --check`, package build, packaged plist/ASAR 0.49.0 inspection, and packaged Electron smoke passed. Initial sandboxed launches of attention diagnostics, browser collapse, and the final composer rerun aborted Electron with `SIGABRT` before assertions; each passed outside the sandbox. Skipped tests: resource-broker integration, simulator policy, browser isolation, provider notifier, restore identity, GitHub update-check, window configuration, prompt-history domain, and static website suites do not exercise rendered xterm prompt extraction or the unchanged IPC/persistence/browser boundaries; the complete renderer matrix and source/packaged app smokes cover the mutated runtime. Adversarial review: traced cursor/base-row addressing, wrapped-row metadata, multiline indentation, prompt glyphs inside content, frame and placeholder removal, chrome only outside the input region, autocomplete rows below a saved cursor, stale submitted rows, immediate reopen after clearing, UTF-8 bounds, ambiguous/no-buffer/exited states, empty values, conflict overflow, exact clipboard bytes, session isolation, non-Codex scope, and unrelated worktree isolation. The review found and fixed immediate reopen recovering a briefly stale pre-clear xterm row by invalidating nonempty rendered snapshots until fresh user input. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app with the existing icon path. Residual risk: a future Codex TUI that removes both the `›`/`❯` prompt marker and recognizable shortcut/context chrome will intentionally fall back to the keystroke model; ambiguous prompt-like output remains uncleared so users do not lose live text. Rollback note: revert the v0.49.0 shipping commit and remove tag/GitHub Release `chromux-v0.49.0`; v0.48.1 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: publish the scoped commit and tag, create the matching GitHub Release, verify `/releases/latest`, then daily-drive accepted Codex skill completion into COMPOSE.

## 2026-07-22 — Chromux v0.48.1 continuous Threads spinner animation

- Stop non-transitioning terminal `user-input` events after pending-input and preview-suppression tracking so ordinary typing cannot reconstruct Threads or restart a working animation.
- Preserve the existing invalidation path when submitted input changes turn state, including completed/idle-to-working status and group updates.
- Extend the real-Electron activity regression to retain the exact working Threads status DOM node across draft characters and terminal controls, while proving submitted input still replaces completed status with Working.
- Ship manifest — User goal: keep working Threads spinners rotating continuously while typing in the terminal without changing turn inference or PTY delivery. Changed files: `prototype/renderer/renderer.js` exits the UI pipeline only for non-transitioning `user-input`; `prototype/scripts/test-tab-activity-indicators-renderer.js` proves DOM identity, working status, control/draft stability, and submitted transition rendering; prototype package metadata/lock, `RELEASES.md`, `tasks/todo.md`, and this entry establish v0.48.1. User-goal mapping: the renderer guard directly prevents sidebar reconstruction while leaving terminal tracking and transition behavior in place, and the regression exercises both the no-render and render branches. Tests run: the new assertion failed before implementation on the first ordinary character; `test:tab-activity-indicators-renderer`, `test:session-rail-renderer`, `test:turn-signals-renderer`, `test:composer-renderer`, `test:update-queue-renderer`, changed-JavaScript syntax checks, JSON metadata parsing, and `git diff --check` passed. Skipped tests: browser preview/favorites/projects, capture delivery, resource broker, theme geometry, and packaging suites do not exercise the event invalidation branch or changed metadata; no lint or typecheck script exists. Adversarial review: traced absent sessions, preview-suppression tracking order, completed/idle submission transitions, already-working submissions, control sequences, diagnostic event recording, coalesced invalidation, PTY writes, composer isolation, update blocking, and unrelated worktree isolation; no blocking finding remains. Accepted warning: the first rapid launch of each turn-signal, composer, and update-queue suite aborted inside Electron before renderer output and passed unchanged on immediate isolated rerun, matching the repository's documented macOS launch flake. Residual risk: other event types can still legitimately rebuild Threads; the fix is intentionally limited to terminal input with no observable turn-state change. Rollback note: revert the v0.48.1 commit and remove tag/release `chromux-v0.48.1`; v0.48.0 remains the prior release. Next command: monitor the published update and daily-drive terminal typing during long-running turns.

## 2026-07-22 — Chromux v0.46.0 composer input transfer and expansion

- Transfer each session's bounded editable terminal line into an empty composer on closed-to-open transition, with Unicode-safe typing/paste, cursor movement, deletion, clearing, cancellation, submission, exited-session, and independent-session handling.
- Add an accessible conflict prompt with Append, Replace, Copy, and Dismiss outcomes; oversized Append remains disabled without clearing either source, and Copy crosses only a main-process-enforced 64 KiB clipboard bridge.
- Add per-session `EXPAND` / `COLLAPSE` behavior that replaces the xterm body, keeps history/actions available across tab switches, resets on Close/Escape, and restores the exact pre-expansion viewport after xterm refits.
- Ship manifest — User goal: move pending terminal input into the multiline composer and let the composer occupy the full terminal pane. Changed files: `prototype/renderer/renderer.js` owns editable-line tracking, transfer/conflict decisions, expansion, focus, and viewport restoration; `prototype/renderer/styles.css` owns the accessible conflict surface and expanded layout; `prototype/main.js` and `prototype/preload.js` expose only bounded clipboard text writes; `prototype/scripts/test-composer-renderer.js` exercises the complete behavior in real Electron; package metadata/lock, `RELEASES.md`, `tasks/todo.md`, and this entry establish v0.46.0. User-goal mapping: the input model and transition logic implement transfer without retransmission, the four conflict actions preserve user data, and expanded layout directly replaces the terminal body while preserving xterm state. Tests run: the new test first failed on missing transfer; changed JavaScript syntax checks, `npm run test:composer-renderer`, `test:shortcuts-renderer`, `test:terminal-scroll-bottom-renderer`, `test:themes-renderer`, `test:preview-queue-renderer`, `test:shell-adoption-renderer`, `npm run smoke`, `npm run package`, and `git diff --check` passed. Skipped tests: capture, favorites, projects, update, resource-broker, and website suites do not exercise terminal input, composer layout, preload clipboard scope, or packaging metadata; no lint or typecheck script exists. Adversarial review: checked bracketed/Unicode paste, 64 KiB boundaries, code-point deletion, modified/word/Home/End movement, line clearing, cancellation/submission, conflict overflow, clipboard validation, repeated opens, dead sessions, tab switching, hidden-xterm fits, history geometry, and exact dirty-worktree isolation; fixed modified cursor movement, oversized Append data loss, and hidden-xterm viewport drift. Accepted warnings: one rapid Electron launch aborted before renderer output and passed unchanged on standalone rerun; smoke reported a temporarily unavailable resource broker after stale orphan daemons were stopped but still reached `SMOKE_OK`; Electron Packager skipped the optional `build/icon.icon` format and wrote the app successfully, matching prior releases. Residual risk: arbitrary shell line editors can bind escape sequences differently, so the tracker intentionally models common xterm/readline controls rather than claiming full shell-state introspection. Rollback note: revert the v0.46.0 commit and remove tag/release `chromux-v0.46.0`; v0.45.0 remains the prior release. Next command: monitor the published update and daily-drive pending-line transfer with custom shell keybindings.

## 2026-07-20 — Chromux v0.33.0 host resource broker

- Added the long-lived local resource broker, MCP bridge, atomic FIFO leases, TTL/disconnect/restart recovery, simulator wrapper, and conservative capacity policy.
- Added the Resources view, global Codex guidance installer, unique paired-browser partitions, and documented cooperative enforcement boundaries.
- Verified two-client contention and handoff, daemon crash reconciliation, mocked capacity pressure, MCP discovery, Electron renderer regressions, and two-target browser storage/navigation/screenshot isolation. The real Simulator smoke acquired and released its lease; Auto correctly blocked boot under current host pressure.
- Release reconciliation: Developer Mode/attention diagnostics landed separately as v0.32.0 at `2dafabd`, so the broker advanced to the next minor, v0.33.0, with an isolated shipping boundary.
- Ship manifest — User goal: coordinate all compliant local Codex and Chromux sessions around host-wide foreground-input, Simulator, and browser resources, then publish the feature. Changed files: `prototype/resource-broker/` owns the daemon, client, MCP server, FIFO lease core, socket paths, simulator wrapper, and capacity policy; `prototype/main.js` and `preload.js` connect Electron to the broker; `prototype/renderer/` adds the Resources UI and unique browser partitions; `prototype/scripts/{test-resource-*,test-simulator-policy.js,test-browser-isolation-smoke.js,smoke-simulator-broker.js,install-resource-broker.js}` provide executable verification and installation; `prototype/resources/codex-global-instructions.md` supplies cooperative global guidance; `prototype/docs/` and `prototype/README.md` document setup, privacy, storage, and troubleshooting; package metadata, `RELEASES.md`, `tasks/todo.md`, and this entry establish v0.33.0. User-goal mapping: atomic leases and recovery prevent compliant resource collisions, validated simulator execution and admission protect device capacity, the UI makes ownership and queues actionable, and isolated browser partitions prevent cross-session state. Tests run: the complete prototype test matrix passed, including broker unit/integration/restart/MCP tests, simulator policy mocks, two-target Electron browser cookie/storage/input/navigation/screenshot isolation, every existing renderer suite, app smoke, changed-JavaScript syntax checks, packaging, packaged-ASAR inspection, and `git diff --check`. The real Simulator smoke acquired and released a lease; current host pressure correctly blocked a new boot. Skipped tests: install/launch could not execute because Auto denied boot under current memory/load pressure and no disposable built app fixture was in scope; two separate Codex built-in Browser processes cannot be orchestrated from this single session, so the executable Electron two-target isolation smoke covers the controllable profile boundary. Adversarial review: fixed singleton daemon races, overlong macOS Unix-socket paths, an MCP shutdown hang, restart lease resurrection, reusable browser partition IDs, unbounded request input/history, LaunchAgent relaunch behavior, and lease-bypass validation; unrelated root README, research, alignment, interrogation, and integration-doc changes remain excluded. Accepted warning: Electron Packager probes for `build/icon.icon` and skips that optional format before successfully producing the app, matching prior releases. Residual risk: Computer Use and direct unwrapped `simctl` remain cooperative upstream boundaries; real boot/install/launch handoff still needs a later low-pressure smoke. Rollback note: revert the v0.33.0 commit and remove tag/release `chromux-v0.33.0`; the prior v0.32.0 app remains current. Next command: monitor broker adoption and rerun `npm run smoke:simulator-broker` when host pressure permits a real boot.

## 2026-07-20 — Chromux v0.31.0 Grok Build dangerous-action gate

- Marked every context-menu action that would launch Grok Build—including duplicating an existing Grok session—with a warning triangle.
- Added a context advisory containing the same security warning and evidence links as the new-session flow, and disabled both launch controls until the user explicitly acknowledges the risk for that session.
- Expanded the Grok renderer regression to verify acknowledgement resets, warning icons, advisory copy, disabled/enabled action states, confirmed launch, and the existing-Grok duplication edge case; the focused Grok, theme, agent-command, and shell-adoption suites passed.
- Bumped the app to v0.31.0 and updated release/privacy documentation. Pre-existing unrelated research, alignment, interrogation, integration-doc, and root README worktree changes were preserved and excluded from this feature.
- Ship manifest — User goal: surface the existing Grok Build data-security advisory from tab context menus and require explicit dangerous-action enablement before launch. Changed files: `prototype/renderer/index.html`, `renderer.js`, and `styles.css` add the warning icon, advisory dialog, acknowledgement controls, and guarded launch handlers; `prototype/scripts/test-grok-warning-renderer.js` enforces both new-session and context-menu gates; `prototype/docs/privacy-and-local-data.md` documents the per-launch acknowledgement; prototype package metadata and lock set v0.31.0; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. User-goal mapping: runtime UI changes directly mark and block Grok launches, the executable regression proves the gate and reset behavior, and documentation explains the boundary. Tests run: `npm run test:grok-warning-renderer`, `npm run test:themes-renderer`, `npm run test:agent-command-quoting`, `npm run test:shell-adoption-renderer`, `npm run smoke`, `npm run package`, changed-JavaScript syntax checks, and `git diff --check` passed. Skipped tests: capture, preview, favorites, projects, update, website, and unrelated signal suites do not exercise agent selection, context-menu duplication, security-resource links, or packaging metadata. Adversarial review: enumerated every `duplicateSession` caller, verified both cross-agent Grok and same-agent Grok duplication reach the advisory, confirmed the disabled controls have defensive handler checks, confirmed acknowledgement resets on selection changes and modal reopen, and re-ran the real theme/context-menu suite. Accepted warning: Electron Packager probes for `build/icon.icon` and skips that format before successfully writing the macOS app, matching prior successful packages. Residual risk: detected/auto-restored Grok sessions retain their established workflow; the new dangerous-action gate applies to the new-session and tab-context-menu launch surfaces requested here. Rollback note: revert the v0.31.0 commit and remove tag/release `chromux-v0.31.0`. Next command: commit and push the scoped v0.31.0 change, publish the GitHub Release, and verify `/releases/latest`.

## 2026-07-17 — Chromux v0.29.0 tab activity indicators

- Added an enabled-by-default Settings switch backed by `chromux.tabActivityIndicators`, with immediate global updates and explicit `true`/`false` local-storage persistence.
- Reused each tab's leading lifecycle indicator for a working spinner and completed checkmark while preserving red exit precedence, green lifecycle dots for unknown/input/permission/authentication/rate-limit/failure states, active/background visibility, title marquee, badges, close controls, and attention behavior.
- Added reduced-motion styling plus accessible tab status labels/tooltips while keeping the indicator glyphs decorative.
- Ship manifest — User goal: show working and completed agent-turn activity directly in every tab and allow users to disable the enhancement globally. Changed files: `prototype/renderer/renderer.js` owns preference loading/persistence, indicator projection, accessible status, and state-driven tab invalidation; `prototype/renderer/index.html` and `prototype/renderer/styles.css` add the Settings switch, spinner/checkmark presentation, and reduced-motion behavior; `prototype/scripts/test-tab-activity-indicators-renderer.js` proves defaults, persistence, active/background transitions, exit precedence, and unchanged input/permission attention handling; `prototype/package.json`, `prototype/package-lock.json`, and the visible footer set `0.29.0`; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. User-goal mapping: every runtime change maps to the requested setting, indicator precedence, accessibility, or render trigger, and the new renderer suite encodes the accepted behavior. Tests run: the new test first failed against the missing API, then passed; all 22 distinct `prototype/package.json` test scripts passed, including tab titles, turn signals, themes, capture, preview, favorites, projects, shortcuts, update, shell adoption, and smoke paths; `npm run smoke`, changed-JavaScript syntax checks, and `git diff --check` passed. Skipped tests: packaging was not rerun because dependencies, native modules, packaging configuration, main/preload APIs, and build assets are unchanged; no lint or typecheck scripts exist. Adversarial review: traced valid/duplicate turn signals, inferred Codex input, Codex output fallback, active/background focus, preference toggling, unknown and attention-only states, repeated exit delivery, local-storage failure/malformed values, accessible status updates, decorative glyph exposure, reduced motion, title overflow/marquee interaction, and unrelated dirty-worktree contamination; no blocking finding remains. Accepted warnings: several rapid macOS Electron launches exited with `SIGABRT` before producing E2E output and one project-output timing assertion initially raced; each affected command passed unchanged on its exact standalone rerun. Residual risk: the spinner/checkmark and Settings layout are exercised through computed renderer state and the full theme suite but were not manually captured in every theme/mode combination. Rollback note: revert the v0.29.0 shipping commit and remove tag/release `chromux-v0.29.0`. Ownership boundary: pre-existing `README.md`, `docs/gblockparty-iaas-integration.md`, and two `interrogation/devtool-integration-map-r*-gigachadd-process.html` artifacts remain uncommitted and untouched. Next command: monitor the published update and daily-drive multi-tab turn transitions.

## 2026-07-16 — Chromux v0.28.4 focused terminal scrollbar protection

- Scoped Chromux textarea form presentation directly to `#cap-notes` and added a focused/unfocused `.xterm .xterm-helper-textarea` reset for transparent paint, zero border/padding/margin/outline/shadow, no native appearance, and no resize affordance.
- Replaced the synthetic helper-only assertion with a real xterm + FitAddon fixture that creates scrollback, focuses xterm's generated textarea, accepts terminal input, preserves its dimensions and positive scrollbar gutter, and repeats the checks in all four themes under Light and Dark modes.
- Captured and visually inspected all eight real focused, scrollable terminal appearances under `/tmp/chromux-focused-terminal-0.28.4`; every scrollbar thumb/track remained unobstructed and each capture passed focused-helper, scrollback, and positive-gutter preconditions.
- Ship manifest — User goal: stop the focused terminal input helper from overlapping xterm's scrollbar without disrupting terminal input, IME, selection, or context-menu behavior. Changed files: `prototype/renderer/styles.css` narrows form styling and adds the presentation-only xterm reset; `prototype/scripts/test-themes-renderer.js` supplies the real focused terminal regression; `prototype/package.json`, `prototype/package-lock.json`, and `prototype/renderer/index.html` set visible/package version 0.28.4; `RELEASES.md` records the patch; `tasks/todo.md`, `tasks/lessons.md`, and this entry record completion and the corrected testing rule. Per-file purpose and user-goal mapping: the CSS directly removes painted textarea chrome without touching xterm-managed position, dimensions, opacity, z-index, white-space, overflow, or pointer behavior; the renderer test enforces the helper presentation, actual input delivery, scrollback/gutter stability, geometry stability, and capture-notes styling across all eight appearances; metadata and task docs satisfy release/workflow contracts. Tests run: the upgraded renderer test first failed against the old CSS with a white focused helper, then `npm run test:themes-renderer`, `npm run smoke`, `node --check scripts/test-themes-renderer.js`, and `git diff --check` passed; the eight-capture native Electron run also enforced real focus, scrollback, transparent presentation, and positive gutters of 1–4 px. Skipped tests: unrelated session lifecycle, browser navigation, capture delivery, updates, projects, website, and packaging suites were not run because runtime behavior outside the isolated renderer CSS is unchanged; no lint/typecheck scripts exist in `prototype/package.json`. Adversarial review: checked the entire textarea inventory (only capture notes plus xterm's generated helper), cascade specificity in focus and all theme modes, preservation of xterm's geometry/input-management declarations, real `onData` delivery, gutter/dimension stability, and the exact shipping boundary; no blocking finding remains. `docs/quality-gate-contract.md` is absent, so this manifest applies its required fields directly. Residual risk: the regression uses xterm's public `input()` simulation while the visual matrix confirms native focus; platform-specific IME candidate-window placement is preserved by leaving xterm's position and composition styles untouched but is not automated. Rollback note: revert the v0.28.4 shipping commit and remove tag/release `chromux-v0.28.4`. Ownership boundary: pre-existing `README.md`, `docs/gblockparty-iaas-integration.md`, and two `interrogation/devtool-integration-map-r*-gigachadd-process.html` artifacts remain uncommitted and untouched. Next command: monitor the published update and daily-drive terminal focus/IME behavior.

## 2026-07-16 — Chromux v0.28.3 Streak Dark tab contrast and queue alignment

- Restored the Streak active-tab green surface at dark-mode specificity so its dark on-green label remains readable instead of being painted over a dark inactive-tab background.
- Added a two-pixel Streak attention-header inset so the heading and empty queue card share the same left edge.
- Published commit `92f270c`, annotated tag `chromux-v0.28.3`, and the non-draft, non-prerelease GitHub Release `GBlockParty Chromux v0.28.3`; verified it is returned by `/releases/latest`.
- Ship manifest — User goal: make terminal-tab text visible in dark mode and align the attention queue with its empty-state box. Changed files: `prototype/renderer/styles.css` restores the Streak Dark active-tab fill and aligns the queue header; `prototype/scripts/test-themes-renderer.js` adds executable WCAG contrast and rendered left-edge assertions; `prototype/package.json`, `prototype/package-lock.json`, and `prototype/renderer/index.html` set the visible/package version to 0.28.3; `RELEASES.md` records the patch release; `tasks/todo.md` and this entry record completion. Per-file purpose and user-goal mapping: the two CSS declarations directly fix the reported visual states, the renderer test prevents both regressions, metadata/release notes satisfy the repository release contract, and task docs preserve the shipping record. Tests run: `npm run test:themes-renderer` passed against v0.28.3 with no warnings after the initial test-fixture timing issue was fixed; `git diff --check` passed before the release commit; GitHub CLI checks confirmed the pushed commit/tag and latest published release. Skipped tests: unrelated session lifecycle, browser navigation, capture delivery, update, project, website, packaging, lint, and typecheck checks were not run because this patch changes only theme-scoped CSS, its Electron renderer regression test, and version/release metadata; no lint or typecheck scripts exist in `prototype/package.json`. Adversarial review: traced CSS cascade specificity across Streak Light/Dark active and inactive tabs, verified the failure mode where a later dark inactive rule replaced only the active background, checked that the fix preserves the intentional dark on-green token, measured the queue heading/card left edges in the renderer, reviewed the exact release diff, and confirmed no unrelated worktree file entered commit `92f270c`; no blocking finding remains. Residual risk: hover/pressed animation frames are declaration-tested but were not visually captured in this session; the resting active state and alignment are exercised in Electron. Rollback note: revert `92f270c` and remove tag/release `chromux-v0.28.3`; the task-history wrap-up can be reverted separately. Ownership boundary: pre-existing `README.md`, `docs/gblockparty-iaas-integration.md`, and two `interrogation/devtool-integration-map-r*-gigachadd-process.html` files remain uncommitted and untouched. Next command: none; `tasks/todo.md` has no active executable items.

## 2026-07-16 — Chromux v0.28.2 live terminal theme repaint

- Added one guarded terminal-theme synchronizer that assigns a fresh xterm palette and repaints the full visible viewport after either theme-family or Light/Dark changes.
- Preserved terminal contents, typed input, focus, session/turn state, scrollback, and PTY/TUI processes; incomplete, mocked, zero-row, and disposed terminal sessions are skipped safely.
- Ship manifest — User goal: fix stale visible terminal input colors after theme switching. Changed files: `prototype/renderer/renderer.js` centralizes palette assignment and full-viewport refresh for both switching paths; `prototype/scripts/test-themes-renderer.js` records palette objects and refresh ranges across all eight appearances and verifies state preservation plus incomplete/disposed guards; `prototype/package.json` and `prototype/package-lock.json` set v0.28.2; `RELEASES.md`, `tasks/todo.md`, and this entry record the patch. User-goal mapping: the runtime helper explicitly repaints rows `0..rows-1`, including the current input row and cursor, without any terminal reset, write, PTY input, clear, dispose, or session mutation. Tests run: the focused theme renderer test passed after first failing against the missing live-terminal test hook; all 14 other distinct Electron renderer suites passed; `npm run smoke`, changed JavaScript syntax checks, and `git diff --check` passed. Skipped tests: packaging was not rerun because dependencies, native modules, packaging configuration, main/preload behavior, and build assets are unchanged; website tests do not exercise Electron terminal rendering. Adversarial review: checked fresh palette identity, both switching call sites, all four theme families and both directions, multi-session row bounds, zero/incomplete mocks, disposed exceptions, preservation of input/focus/turn state, and absence of PTY writes, terminal reset, scrollback clearing, or restart behavior; no blocking finding remains. Manual visual verification: the macOS GUI-control bridge timed out before returning app state, so an active real-terminal Light↔Dark visual inspection could not be captured in this environment; the executable Electron test exercises the actual switching controls and asserts the public xterm refresh contract. Residual risk: a platform-specific xterm renderer defect could still ignore a successful public `refresh()` call, though the call and full viewport bounds are now enforced. Rollback note: revert the v0.28.2 commit and remove tag/release `chromux-v0.28.2`. Next command: manually smoke an active prompt with pre-typed text in both directions, then continue normal release monitoring.

## 2026-07-15 — Chromux v0.28.1 Streak tactile button interactions

- Added a one-pixel half-press on hover and a two-pixel full press while active to Streak's primary, toolbar, navigation, queue, session-tab, and theme-card controls.
- Kept disabled controls stationary, shortened the active downstroke, and disabled motion transitions under `prefers-reduced-motion` while preserving clear hover and pressed states.
- Ship manifest — User goal: give Streak theme buttons a half-pressed hover animation and a press animation. Changed files: `prototype/renderer/styles.css` implements the theme-scoped interaction states; `prototype/scripts/test-themes-renderer.js` enforces displacement, tactile-edge depth, selector coverage, and existing contrast; `prototype/package.json` and `prototype/package-lock.json` set v0.28.1; `RELEASES.md`, `tasks/todo.md`, and this entry record the patch release. User-goal mapping: hover moves controls halfway through their tactile travel and reduces the bottom edge from four to three pixels, while active moves them fully down and reduces the edge to two pixels. Tests run: `npm run test:themes-renderer`, `npm run smoke`, changed JavaScript syntax checks, `npm run capture:themes -- /tmp/chromux-streak-button-0.28.1`, `npm run package`, and `git diff --check` passed. Visual verification: inspected deterministic Streak Light and Streak Dark Settings captures at 1920×1280; both retained their intended resting depth, alignment, and contrast. Skipped tests: session lifecycle, browser navigation, capture delivery, update, favorites, projects, and website suites do not exercise this isolated theme CSS path. Adversarial review: checked hover/active cascade order, disabled controls, reduced motion, primary fills, theme-card hover override, queue controls, session tabs, Light/Dark parity, and transient contrast during theme changes; an initial background/color transition on session tabs briefly exposed the prior theme palette and was removed, leaving only physical transform and edge-depth animation. Accepted warning: Electron Packager still probes for `build/icon.icon` and skips that format before successfully writing `dist/Chromux-darwin-arm64`, matching the repository's existing non-fatal packaging behavior. Residual risk: the executable renderer test validates exact hover/active declarations and coverage, but this environment did not expose live browser pointer automation for a stateful hover screenshot. Rollback note: revert the v0.28.1 commit and remove tag/release `chromux-v0.28.1`. Next command: commit and push `main`, publish `chromux-v0.28.1`, then verify GitHub Releases `/releases/latest`.

## 2026-07-15 — Chromux v0.28.0 per-theme light and dark modes

- Added a compact, accessible Light/Dark selector independent of the four visual themes, with immediate cockpit and terminal updates plus local persistence.
- Added distinct light and dark material palettes for Blueprint, Retro-OS, Streak, and Liquid Glass; new profiles now default to Liquid Glass Light while legacy Blueprint selections retain their original dark appearance.
- Expanded the deterministic capture and executable interaction/contrast coverage from four appearances to all eight theme/mode combinations.
- Ship manifest — User goal: split every Chromux theme into light and dark modes and replace Blueprint with Liquid Glass as the default. Changed files: `prototype/renderer/index.html` adds the mode control and new initial label; `prototype/renderer/renderer.js` validates, migrates, applies, persists, and exposes theme modes while supplying eight terminal palettes; `prototype/renderer/styles.css` adds the shared selector and four paired visual systems; `prototype/scripts/test-themes-renderer.js` verifies defaults, all eight combinations, persistence, invalid input, migration, selected state, native color scheme, layout, and WCAG contrast; `prototype/scripts/capture-themes.js` captures all eight combinations; `prototype/README.md` and `prototype/docs/privacy-and-local-data.md` document selection, capture output, defaults, and local storage; `prototype/package.json` and `prototype/package-lock.json` set v0.28.0; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. User-goal mapping: the mode selector and paired CSS/terminal palettes implement the requested split, and the validated missing-preference fallback makes Liquid Glass Light the actual clean-profile default. Tests run: changed JavaScript syntax checks passed; `npm run test:themes-renderer` passed all eight interaction and contrast cases; `npm run capture:themes -- /tmp/chromux-theme-modes` captured all eight app frames and the contact sheet was visually inspected; `npm run smoke` passed; `npm run package` produced `dist/Chromux-darwin-arm64`; `git diff --check` passed. Skipped tests: browser navigation, capture delivery, session restoration, update, favorites, projects, and website suites do not exercise the isolated appearance state/UI/CSS path; main-process, preload, dependencies, website code, and capture payload behavior are unchanged. Adversarial review: checked clean-profile and malformed/unknown preference fallback, legacy Blueprint migration, exactly-one pressed state, event selector scope, mode/theme persistence, active-session terminal updates, native `color-scheme`, CSS specificity over primary controls, contrast in all eight combinations, reduced-motion behavior, narrow Settings layout, deterministic screenshot naming, and unrelated worktree contamination; the body/control selector collision and Liquid Glass Dark primary-fill override found during testing were fixed. Accepted warning: Electron Packager still probes for `build/icon.icon` and skips that format before successfully writing `dist/Chromux-darwin-arm64`, matching the repository's existing non-fatal packaging behavior. Residual risk: screenshots exercise the empty cockpit and Settings sheet rather than every content-heavy/session state, although shared component tokens and existing layout rules constrain those surfaces. Rollback note: revert the v0.28.0 commit and remove tag/release `chromux-v0.28.0`; existing mode preferences become inert under the previous renderer. Next command: commit the scoped files, push `main`, publish the matching GitHub Release, and verify `/releases/latest`.

## 2026-07-15 — Chromux v0.27.1 confirmed update attention actions

- Replaced the queued update's inert blocker-focus action with direct managed-update execution and retained `DETAILS` when no managed install source exists.
- Added explicit warning confirmations before executing or dismissing queued updates, including cancel-safe behavior and clear session/restart or non-installation consequences.
- Enabled macOS first-mouse acceptance so an inactive Chromux window executes the user's first click instead of requiring a second click.
- Ship manifest — User goal: make queued update attention actions work on the first click, execute the update instead of focusing a blocker, and warn before execute or dismiss. Changed files: `prototype/main.js` enables inactive-window click-through; `prototype/renderer/attention.js` projects `EXECUTE` or `DETAILS`; `prototype/renderer/renderer.js` routes confirmed execute/dismiss behavior; `prototype/scripts/test-update-queue-renderer.js` covers labels, warnings, cancellation, confirmation, managed/manual sources, and update phases; `prototype/scripts/test-window-config.js` enforces first-mouse configuration; `prototype/package.json` and `prototype/package-lock.json` set v0.27.1 and register the config test; `RELEASES.md` records the patch; `tasks/todo.md`, `tasks/lessons.md`, and this entry record completion and the user's correction. User-goal mapping: the window option fixes the double-click symptom, the attention projection/action replaces `FOCUS` with `EXECUTE`, and the shared warning modal protects both choices. Tests run: changed JavaScript syntax checks, `npm run test:update-queue-renderer`, `npm run test:turn-signals-renderer`, `npm run test:capture-records-renderer`, `npm run test:window-config`, `npm run smoke`, `npm run package`, and `git diff --check` passed. Skipped tests: website and unrelated browser/favorites/project suites do not exercise the isolated main-window click option or global update-attention state machine; real inactive-window click-through is not automatable in the headless renderer harness, so the Electron option has a focused configuration contract test. Adversarial review: traced ready, waiting, failed, running, managed-source, missing-source, cancel, confirm, blocker, and zero-session branches; checked that running updates remain non-dismissible, missing-source rows cannot claim executable behavior, cancellation preserves phase, confirmation is required before mutation, and unrelated worktree files remain excluded. Correction enforcement: `prototype/scripts/test-update-queue-renderer.js` encodes the corrected execute/dismiss contract and `tasks/lessons.md` records when to apply it. Accepted warning: Electron Packager still probes for `build/icon.icon` and skips that format before successfully writing `dist/Chromux-darwin-arm64`, matching the repository's documented non-fatal packaging behavior. Residual risk: the config test proves Electron receives `acceptFirstMouse: true`, but the final click-through behavior still depends on macOS/Electron integration and should be noticed immediately if a packaged inactive window fails to dispatch its first click. Rollback note: revert the v0.27.1 commit and remove tag/release `chromux-v0.27.1`. Next command: commit the scoped files, push `main`, publish the matching GitHub Release, and verify `/releases/latest`.

## 2026-07-15 — Chromux v0.26.4 Streak layout polish

- Added a 12px left gutter between the Streak stage and attention rail, aligned the Settings header button height with the neighboring gauges, and excluded xterm's hidden helper textarea from Chromux's generic form-control styling.
- Extended the Electron theme smoke test with computed-layout assertions for the gutter, header heights, and xterm helper reset.
- Ship manifest — User goal: correct three Streak-theme spacing and overlap defects. Changed files: `prototype/renderer/styles.css` contains the scoped layout and selector fixes; `prototype/scripts/test-themes-renderer.js` prevents regression; `prototype/package.json`, `prototype/package-lock.json`, and `prototype/renderer/index.html` set app metadata to `0.26.4`; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. User-goal mapping: each CSS change maps one-to-one to the reported sidebar gap, Settings height, and terminal scrollbar overlap. Tests run: theme, browser-collapse, shortcut, turn-signal, preview-queue, and app smoke suites passed; `npm run package` produced `dist/Chromux-darwin-arm64`; `git diff --check` passed. Skipped tests: website route tests are unrelated to the Electron renderer, and no dependency, main-process, or preload code changed. Adversarial review: checked selector order against xterm's vendor stylesheet, verified the helper textarea keeps zero padding/border and `resize: none`, confirmed the Streak-only gutter does not alter other themes, and confirmed the header button matches its rendered gauge height; no finding remains. Accepted warning: Electron Packager still probes for `build/icon.icon` and skips that format before completing the app build, matching the repository's existing non-fatal packaging behavior. Residual risk: native scrollbar appearance can vary slightly across macOS versions, but the offending input box model is now restored to xterm's own zero-size contract. Rollback note: revert the v0.26.4 commit and remove tag/release `chromux-v0.26.4`. Next command: publish and verify the matching GitHub Release.

## 2026-07-15 — Chromux v0.26.2 idle-workspace update install

- Added one shared update-install preflight for the top-level update control and Settings: an available managed update now transitions directly from `idle` to `running` only when the session map and projected attention queue are both empty.
- Preserved staged/manual update behavior, blocker focus, lifecycle confirmation, restore snapshots, retries, failures, and managed-source checks for every non-eligible state.
- Ship manifest — User goal: remove unnecessary update staging and empty restart protection from an idle workspace. Changed files: `prototype/renderer/renderer.js` implements the preflight and shared button path; `prototype/scripts/test-update-queue-renderer.js` covers direct install plus protected fallbacks; `prototype/package.json` and `prototype/package-lock.json` set `0.26.2`; `RELEASES.md`, `tasks/todo.md`, and this entry record the patch. User-goal mapping: runtime logic implements the exact four-part eligibility policy, tests distinguish direct `idle → running` from queued/failed/manual/open-session flows, and metadata makes the fix releasable. Tests run: `npm run test:update-queue-renderer` and `npm run smoke` passed outside the command sandbox; changed JavaScript passed `node --check`; `npm run package` produced `dist/Chromux-darwin-arm64`; `git diff --check` passed. Skipped tests: unrelated renderer suites and website tests are outside this isolated update-install state-machine change. Adversarial review: checked phase ordering, attention projection before queue insertion, zero-session semantics, unavailable managed source, blocker focus, failed retry, duplicate running acknowledgement, test-only trace isolation, and preservation of unrelated worktree changes; no blocker remains. Accepted warning: Electron Packager still probes for `build/icon.icon` and skips that format before successfully building, the same existing non-fatal warning documented in prior releases. Residual risk: actual managed installation necessarily quits the app, so automation stubs the final installer invocation; the renderer smoke verifies every decision and protection branch leading to it. Rollback note: revert the v0.26.2 commit and remove tag/release `chromux-v0.26.2`. Next command: publish the matching GitHub Release and verify `/releases/latest`.

## 2026-07-14 — Chromux v0.26.0 selectable appearance prototypes

- Added four production-clickable appearance directions—Blueprint, Retro-OS, Streak, and Liquid Glass—over the shared Chromux cockpit, with distinct materials, typography, geometry, controls, panels, empty states, overlays, and terminal palettes.
- Added an accessible Settings theme grid with immediate application, a single explicit selected state, safe defaulting, and local persistence across launches; existing sessions update their xterm theme without restart.
- Added focused Electron selection/persistence coverage and a deterministic `capture:themes` visual-review command; the visual pass caught and corrected low contrast in the initial Liquid Glass settings sheet.
- Ship manifest — User goal: develop four clickable Chromux prototypes and allow switching between them in Settings. Changed files: `prototype/renderer/index.html` adds the appearance selector; `prototype/renderer/renderer.js` owns validated persistence, selection state, live terminal palette updates, and the test facade; `prototype/renderer/styles.css` implements the four complete visual systems; `prototype/scripts/test-themes-renderer.js` verifies all ids, defaulting, selection, persistence, and invalid input; `prototype/scripts/capture-themes.js` captures every direction for visual QA; `prototype/README.md` documents theme selection and captures; `prototype/docs/privacy-and-local-data.md` records the local appearance preference; root/prototype manifests and locks, `RELEASES.md`, `tasks/todo.md`, and this entry establish v0.26.0 and record completion. User-goal mapping: each runtime and UI file directly enables one shared clickable app to become any of the four requested prototypes from Settings, while tests/docs/version files make the behavior supportable and shippable. Tests run: all 20 distinct prototype test scripts passed, including the new theme renderer test, session/browser/capture/update/shortcut suites, and smoke paths; root `npm test` rebuilt and verified all 36 desktop design routes at four viewports plus seven mobile routes; changed JavaScript passed `node --check`; `git diff --check` passed. Visual verification: captured and inspected all four 1920×1280 app frames with the Settings selector open; revised Liquid Glass was recaptured after increasing sheet and control contrast. Skipped tests: app packaging was not rerun because dependencies, native modules, packaging configuration, preload/main-process code, and build assets are unchanged; the renderer and screenshot harness execute the mutated runtime path directly. Adversarial review: checked unknown/stale stored values, local-storage failure fallback, exactly-one pressed state, selector keyboard semantics, theme switching with active terminals, external-font/network dependence, low-contrast glass, screenshot isolation from the user profile, and unrelated dirty-worktree contamination; invalid values fall back to Blueprint, theme assets are code-native, smoke profiles are isolated, the glass contrast finding was fixed, and unrelated `README.md` plus `docs/gblockparty-iaas-integration.md` remain excluded. Residual risk: a real content-heavy workspace may reveal theme-specific density or contrast issues that the empty-state/settings captures and executable renderer suite do not expose. Rollback note: revert the v0.26.0 commit and remove tag/release `chromux-v0.26.0`; persisted unknown theme data safely falls back to Blueprint. Next command: commit and push the scoped v0.26.0 files, publish the matching GitHub Release, and verify `/releases/latest`.

## 2026-07-13 — Chromux v0.25.1 Grok Build data-security warning

- Added a prominent warning to the new-session modal whenever Grok Build is selected, advising that the CLI may transmit codebase contents—including files, Git history, and secrets—to xAI-controlled infrastructure and recommending professional cybersecurity/data-security review for sensitive repositories.
- Added allowlisted external links to the version-specific wire-level analysis, its open reproduction harness and evidence, independent reporting, and xAI's current privacy policy; documented Chromux's inability to verify or restrict transfers made by the separately installed Grok CLI.
- Added focused Electron renderer regression coverage, synchronized root and prototype metadata at `0.25.1`, and recorded release `chromux-v0.25.1`.
- Ship manifest — User goal: warn Chromux users about reported Grok Build codebase transfers and provide credible, inspectable evidence before use. Changed files: `prototype/renderer/index.html` and `styles.css` render the warning and resource controls; `prototype/renderer/renderer.js`, `preload.js`, and `main.js` toggle the warning and open only four allowlisted security resources; `prototype/scripts/test-grok-warning-renderer.js` verifies agent-specific visibility, risk/professional-review copy, and all evidence links; `prototype/docs/privacy-and-local-data.md` records evidence scope and provider boundary; root/prototype manifests and locks, `RELEASES.md`, `tasks/todo.md`, `tasks/lessons.md`, and this entry record the patch release and correction. User-goal mapping: every runtime, documentation, and test change directly implements or enforces the requested Grok warning and linked evidence. Tests run: `npm run test:grok-warning-renderer` passed in Electron; `npm run test:agent-command-quoting` and `npm run test:shell-adoption-renderer` passed; `node --check` passed for changed runtime/test JavaScript; `git diff --check` passed. Skipped tests: website route/viewer tests and unrelated Electron feature suites are not relevant to the new-session warning, allowlisted link IPC, or unchanged Grok launch command; packaging is unchanged beyond synchronized SemVer metadata. Adversarial review: checked evidence scope against the original analysis, avoided claiming that training use was proven, made the version-specific limitation explicit in docs, ensured the warning appears only for Grok and reappears when a previously selected Grok option is reopened, constrained external navigation to a main-process key-to-URL allowlist, suppressed external-open rejection noise, and verified the user's citation correction through an executable test plus `tasks/lessons.md`. Residual risk: the independent report is secondary and provider behavior may change after release; the warning therefore uses “may,” links current provider policy, and recommends professional review rather than asserting universal ongoing behavior. Rollback note: revert the v0.25.1 commit and remove tag/release `chromux-v0.25.1` if publication fails. Next command: commit and push `main`, publish `chromux-v0.25.1`, then verify GitHub Releases `/releases/latest`.

## 2026-07-13 — Chromux v0.25.0 responsive desktop design viewer

- Added one allowlisted scale-to-fit viewer for all thirty-six fixed 1440×900 desktop concepts. The viewer centers a borderless iframe, caps scale at 100%, responds to window and visual-viewport resizing, and keeps the host document overflow-free.
- Changed the deterministic website build to preserve every clean `/designs/<slug>` route and concept title while copying unchanged source prototypes under generated `/designs/raw/`; the local gallery now uses the same validated viewer, and mobile routing remains unchanged.
- Updated the shared desktop specification, synchronized root/prototype metadata at `0.25.0`, and added route plus real-Chromium regression coverage for all concepts at 1440×900, 1280×800, 1100×800, and 768×1024, including Capture modal focus/close/Escape behavior and six visual captures for concepts 14 and 33.
- Ship manifest — User goal: present every desktop concept responsively without clipping while preserving source compositions and public URLs. Changed files: `design-prototypes/viewer.html` owns validation, scaling, centering, error, and iframe behavior; `scripts/build-design-viewers.js` copies raw sources and generates titled wrappers/gallery routes; `scripts/build-website.sh` invokes that build; `design-prototypes/index.html`, `README.md`, and `SPEC.md` route/document the fixed-canvas contract; `scripts/test-website-routes.js` and `scripts/test-design-viewer-browser.js` prove artifact, allowlist, title, route, viewport, overflow, modal, and screenshot behavior; root/prototype package manifests and locks, `RELEASES.md`, `tasks/todo.md`, and this history entry record v0.25.0 and completion. User-goal mapping: every source and documentation change directly implements the accepted viewer/build/test/release plan; Electron application behavior is unchanged. Tests run: `npm test` passed the complete website route/build suite and all 144 design/viewport browser cases; the Chromium harness also verified generic-viewer valid and invalid parameters plus modal focus and both close paths; `node --check` passed for all three changed JavaScript scripts; `git diff --check` passed; six captured images for concepts 14 and 33 at 1440×900, 1280×800, and 1100×800 were visually inspected after entrance animations settled. Skipped tests: Electron renderer, smoke, and packaging suites are not relevant because no Electron runtime, dependency, or packaging behavior changed beyond synchronized SemVer metadata. Adversarial review: checked allowlist drift, missing/invalid/arbitrary iframe inputs, byte drift in raw copies, stale titles, clean-route loss, iframe border/layout overflow, height-vs-width scaling, resize timing, animation-delayed blank screenshots, focus trapping across the frame, mobile-route regression, and cleanup failures; exact allowlist and raw-byte assertions, runtime invalid-input coverage, resize polling, settled captures, and graceful browser cleanup resolve the findings. Residual risk: browser pinch-zoom offset behavior is not separately automated, though visual-viewport resize is wired and standard desktop/tablet viewports are exhaustively covered; existing prototype Google Font imports retain their prior local-fallback behavior. Rollback note: revert the v0.25.0 commit, redeploy v0.24.2, and remove tag/release `chromux-v0.25.0` if publication fails. Next command: commit and push `main`, publish `chromux-v0.25.0`, then verify the GitHub latest release and deployed production routes.

## 2026-07-13 — Chromux v0.24.2 direct-file design gallery links

- Restored all thirty-six source-gallery cards to relative sibling `.html` links so `design-prototypes/index.html` works when opened directly from disk.
- Kept the published gallery contract unchanged by translating the source links to clean `/designs/*` routes during the deterministic website build.
- Added regression coverage for both link contexts, aligned root and prototype metadata at `0.24.2`, and recorded the matching patch release.
- Validation: `npm test` passed, verifying thirty-six local design links, thirty-six generated clean design routes, and seven generated clean mobile routes; an independent direct-file resolution check confirmed all thirty-six card targets exist; `git diff --check` passed. Electron runtime suites and packaging were skipped because the prototype runtime and dependencies are unchanged. Residual risk is limited to future gallery cards bypassing the two-context route test. Rollback: revert the v0.24.2 commit, redeploy v0.24.1, and remove the `chromux-v0.24.2` tag/release if publication fails.

## 2026-07-12 — Mobile gallery release audit closure

- Recorded the durable `docs/audits/mobile-gallery-release-2026-07-12.md` verdict: ship-ready as static prototypes, with the validation scope, resolved/rejected findings, and explicit non-functional SSH/terminal/browser limitation.
- Removed the stale root `main.js`; `prototype/main.js` remains the sole Electron entrypoint selected by `prototype/package.json`.
- Prepared patch release v0.24.1 to verify the `/mobile/` gallery and all seven clean routes in the generated site and on the canonical Vercel production domain. Production URL, deployed commit SHA, deployment result, content/header smoke evidence, and latest-release verification are recorded in the matching GitHub Release.
- Ship manifest — User goal: close and ship the mobile-gallery release audit, publish patch release v0.24.1, and redeploy the static website to Vercel. Changed files: `docs/audits/mobile-gallery-release-2026-07-12.md`; `RELEASES.md`; root and `prototype/` `package.json` and `package-lock.json`; and `tasks/history.md`. Per-file purpose: the audit records the release verdict, scope, dispositions, and static-prototype limitation; release notes and package metadata establish v0.24.1 consistently; history records the session and shipping evidence. User-goal mapping: every included file either makes the audit durable, satisfies the repository SemVer/release contract, or records the exact shipping boundary. Tests run: `git diff --check`; JSON parsing for root/prototype manifests, lockfiles, and `vercel.json`; `npm test` (built the site and verified 36 clean design routes plus 7 clean mobile routes); `npm run build`; entrypoint existence inspection confirming `prototype/main.js` exists and root `main.js` does not. Skipped tests: Electron renderer/runtime suites and visual browser checks are not relevant because no Electron or rendered website source changed; `scripts/audit-task-docs.mjs` is absent, so the optional task-doc audit cannot apply; production route/header smoke tests remain pending until deployment. Adversarial review: reviewed every changed file and the generated route artifact for version drift, unsupported functional claims, accidental credential/runtime coupling, missing mobile routes, packaging-entrypoint ambiguity, release/tag mismatch, and premature production-evidence claims; no blocking finding remains, and production evidence is explicitly deferred to the GitHub Release. Residual risk: Vercel routing, response headers, and production content can still differ from the locally generated artifact and must be checked after deployment; the static prototypes intentionally provide no real SSH, terminal, browser, authentication, capture, or delivery behavior. Rollback note: revert the v0.24.1 commit, redeploy `chromux-v0.24.0`, and remove the v0.24.1 tag/release if publication fails. Next command: push `main`, publish `chromux-v0.24.1`, then follow the repository deploy contract; if no `deploy.md` or `tasks/deploy.md` exists, deployment must be reported as skipped under `$ship-end`.

## 2026-07-12 — Chromux v0.24.0 design gallery batch 4

- Added twenty new desktop design-refresh prototypes (17 Mission Patch, 18 Cartographer, 19 Darkroom, 20 Bauhaus Console, 21 Library Stacks, 22 Analog Synth, 23 Air-Traffic Control, 24 Executive Glass, 25 Comic Control Room, 26 Field Notebook, 27 Broadcast Studio, 28 Museum Archive, 29 Kinetic Typography, 30 Cybernetic Organism, 31 Medieval Scriptorium, 32 Financial Terminal, 33 Japanese Station System, 34 Thermal Industrial, 35 Soundstage Blueprint, 36 Chromatic Shadow) under `design-prototypes/`, each a self-contained static mockup following the shared `SPEC.md` contract and fabricated app state.
- Wired the new batch into the gallery `index.html` (Batch 4 cards with hand-built swatches), the `README.md` table, and clean `/designs/*` routes; extended `scripts/test-website-routes.js` from 16 to 36 expected design routes.
- Validation: `npm test` passed (36 design + 7 mobile clean routes); all twenty prototypes grep-verified for required regions (`titlebar`, `rail`, `session-tabs`, `stage`, `statusbar`), the `chromux 0.17.0 — <name> concept` status line, capture-modal YAML payload, and no external script/stylesheet references; every inline script passed `node --check` with no duplicate ids.

## 2026-07-12 — Chromux v0.23.0 mobile prototype gallery

- Added seven self-contained mobile Chromux interaction prototypes under `mobile-prototypes/` (A Mission Control, B Agent Inbox, C Browser Field Kit, D Timeline / Black Box, E Deck of Agents, F Command Lens, G Remote Workbench tablet-first), framing the phone as a remote agent command center.
- Authored `mobile-prototypes/SPEC.md` as the shared contract: device frames, layered-context screen ids (`screen-home`/`screen-session`/`screen-terminal`/`screen-browser`/`screen-evidence`/`sheet-send`), one exact fabricated fleet state (3 need you · 5 working · 2 completed · 1 host offline, `checkout-flow · claude` drill-in), intervention-safety three-mode distinction, and evidence/send-payload content, so the seven directions are directly comparable.
- Published the gallery at `/mobile/` (gallery index, README, `scripts/build-website.sh` copy step, landing-page nav/footer links) and extended `scripts/test-website-routes.js` to verify 16 design + 7 mobile clean routes.
- Validation: `npm test` passed (16 design + 7 mobile routes); all seven prototypes verified for required ids (exactly once each), default-visible home screens, Esc-closing send sheets, inline-JS `node --check` syntax, no duplicate ids, no external references beyond Google Fonts `@import` with macOS fallbacks; every default screen plus remediated screens rendered and inspected via Playwright with zero page errors; `git diff --check` passed.
- Ship manifest — User goal: build the seven mobile Chromux prototypes from the product brief as comparable static mockups published on the site. Implementation was delegated to four bounded subagents (A+B, C+D, E+F, G) against SPEC.md; integration, gallery, site wiring, versioning, and release were owned centrally. An independent adversarial audit reviewed the integrated result end-to-end; findings and dispositions: 06 omitted fleet totals and the offline host (accepted — added a minimal fleet-totals line and a Connection · 1 offline section), 04 title missing "/ Black Box" (accepted — fixed), 3px horizontal scroll at ≤430px in 01/02 (accepted — clipped at the html level in the collapse breakpoint), 03 preview-tile session-name omissions (rejected — on-brief for a browser-first gallery; totals and hosts are present). Changed files: `mobile-prototypes/` (new), `scripts/build-website.sh`, `scripts/test-website-routes.js`, `landing/index.html`, root and prototype package metadata/locks (0.23.0), `RELEASES.md`, task files. Residual risk: prototypes are static mockups and encode no product behavior; the prototype app itself is unchanged apart from aligned version metadata. Rollback: revert the v0.23.0 commit and delete tag/release `chromux-v0.23.0`.

## 2026-07-12 — Chromux v0.21.0 global favorites

- Added global persisted favorites for paired-browser documents and URLs, available from the browser toolbar, review queue, and every session's favorites picker.
- Added bounded atomic `~/.chromux/favorites.json` persistence with URL normalization, protocol validation, deduplication, and safe malformed-file recovery.
- Added renderer regression coverage, local-data documentation, and the Chromux v0.21.0 release metadata.
- Validation: `npm run test:favorites-renderer`, `npm run test:preview-queue-renderer`, `npm run test:browser-collapse-renderer`, `npm run test:shortcuts-renderer`, and `npm run test:capture-records-renderer` passed; `node --check` passed for all mutated JavaScript; `git diff --check` passed. Electron occasionally aborted before renderer startup when several smoke commands launched back-to-back, but every affected test passed when rerun individually and no assertion-level failure remained.
- Ship manifest — User goal: implement Phase B global persisted pins/favorites for documents and URLs. Changed files: root and prototype package metadata/locks; `prototype/main.js`; `prototype/preload.js`; `prototype/renderer/renderer.js`; `prototype/renderer/styles.css`; `prototype/scripts/test-favorites-renderer.js`; prototype README/privacy/troubleshooting docs; `RELEASES.md`; and task history/todo. Per-file purpose and user-goal mapping: main/preload provide the bounded private persistence bridge; renderer/styles provide global favorite state and controls; the new test proves load, normalization, deduplication, both pin surfaces, cross-session visibility, active-session routing, collapse restoration, persistence, and protocol filtering; docs explain storage/privacy/cleanup; package and release files satisfy v0.21.0 shipping; task files record completion. Adversarial review checked oversized arrays/files, malformed JSON, invalid timestamps, duplicate and fragment URLs, credential-bearing/unsupported URLs, arbitrary renderer filesystem exposure, atomic-write cleanup, active-session routing, and popover overlap; input/file caps, strict timestamps, protocol filtering, and mutually exclusive popovers resolved the findings. Residual risk: simultaneous rapid pin operations can resolve out of order because persistence is asynchronous; normal deliberate UI use is covered, and a serialized write queue can be added if real usage exposes this edge. Rollback: revert the v0.21.0 commit and delete tag/release `chromux-v0.21.0`; removing `~/.chromux/favorites.json` clears persisted data. Next command: `$exec` for Phase C saved projects.

## 2026-07-12 — Chromux v0.20.1 controlled-preview first-success form

- Added a structured GitHub issue form for first-success reports across the Chromux preview, capture, and delivery journey, including recovery and documentation-friction prompts.
- Added explicit redaction guidance and a required privacy confirmation so reporters do not submit credentials, private source code, sensitive paths, complete payloads, or private project data.
- Bumped root and prototype package metadata to `0.20.1`; release tag is `chromux-v0.20.1`.
- Validation: parsed the issue form with `js-yaml`, asserted 12 form blocks and 11 unique field IDs with all required journey fields present, ran `npm run build`, verified all four package metadata files resolve to `0.20.1`, and ran `git diff --check`; all passed without warnings.
- Ship manifest: User goal was the next `$exec` step, a first-success report form for controlled OSS preview. Changed files are `.github/ISSUE_TEMPLATE/first-success-report.yml`, `package.json`, `package-lock.json`, `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and `tasks/history.md`. Per-file purpose: the issue form collects actionable, privacy-safe journey evidence; package files keep website/app release metadata aligned; release notes describe the feedback feature; task files record completion and a file-level Phase B plan. User-goal mapping: every shipped change either implements the report surface, satisfies the required SemVer/release contract, or records execution state. Adversarial review checked missing first-success dimensions, secret/private-data solicitation, non-actionable free-form prompts, duplicate field IDs, required-field balance, malformed YAML, and unrelated worktree inclusion; no blocker findings remained. Executable verification is the YAML parser/schema assertion and deterministic website build. Skipped tests: Electron renderer tests and packaging are not relevant because no Electron runtime source, dependency, or packaging behavior changed; package versions only expose release metadata. Residual risk: repository label configuration is external to the form and GitHub may omit the `first-success` label if it has not been created; issue creation itself remains usable. Rollback is `git revert` of the v0.20.1 commit and deletion of tag/release `chromux-v0.20.1` if published. Next command: `$exec` for Phase B pins and favorites.

## 2026-07-12 — Chromux v0.19.0 Liquid Glass design prototype

- Added `design-prototypes/16-liquid-glass.html`, a 16th self-contained design concept: bright silver-blue optical-glass cockpit with rounded edge-lit glass panes, a smoked-glass terminal slab, edge-concentrated attention capsules, traveling-highlight interactions, and a thicker floating capture sheet — per the shared `SPEC.md` contract.
- Wired the concept into the gallery (`index.html` Batch 3 card with a glass-reflection swatch) and `design-prototypes/README.md`; the website build script picks the file up via its existing glob.
- Pipeline: Sonnet 5 subagents built the prototype and gallery wiring; a Fable 5 review (code + headless renders at 1440×900 and 1280×860, modal open/closed) produced findings; Opus 4.8 subagents remediated (rounded/edge-lit stage panes, browser-pane backdrop blur, divider presence at rest, dead CSS removal, gallery swatch reflection); final Fable 5 review fixed URL-bar overflow at the 1280 spec minimum (`min-width: 96px`) and kept the terminal pane at 44% so the full spec URL renders at 1440.
- Bumped Chromux metadata to `0.19.0`; planned tag is `chromux-v0.19.0`.
- Validation: `./scripts/build-website.sh` and headless Chromium renders of the prototype (main, capture modal, 1280-width toolbar) and gallery Batch 3 passed; exact spec strings, region ids, and modal toggle verified.

## 2026-07-11 — Chromux v0.18.0 static website and design gallery

- Compiled the existing product landing page and all 15 design-refresh prototypes into a production-only static artifact: `/` serves the landing page and `/designs/` serves the gallery.
- Added a deterministic build script, Vercel output/security configuration, and landing-page links to the gallery; repository internals and Electron source are excluded from deployment.
- Bumped Chromux metadata to `0.18.0`; planned tag is `chromux-v0.18.0`.
- Validation: `./scripts/build-website.sh`, JSON parsing of `vercel.json`, `git diff --check`, HTTP 200 checks for `/`, `/designs/`, and representative first/last prototype routes, and headless Chromium visual renders at 1440×1000 passed. The Paper Terminal entrance animation was also checked after its 5-second reveal delay.
- Ship manifest — User goal: compile the supplied design prototypes into a shippable website, commit and push it to GitHub, and deploy it to Vercel. Changed files: `.gitignore`; `package.json`; `package-lock.json`; `RELEASES.md`; `landing/index.html`; `prototype/package.json`; `prototype/package-lock.json`; `scripts/build-website.sh`; `vercel.json`; `tasks/todo.md`; `tasks/history.md`; and `design-prototypes/README.md`, `design-prototypes/SPEC.md`, `design-prototypes/index.html`, plus `design-prototypes/01-paper-terminal.html` through `design-prototypes/15-offset.html`. Per-file purpose: the design directory supplies the gallery, concepts, and source documentation; the landing page links the new public route; root package metadata and lockfile expose a reproducible zero-dependency website build instead of triggering Electron installation; the build script emits only website assets; Vercel configuration defines the artifact, clean URLs, and response hardening; ignore rules exclude generated deploy state/output; version and release files record the user-facing minor release; task files record completion and evidence. User-goal mapping: every included file either supplies a requested public page, makes it reachable/buildable/deployable, or fulfills the repository shipping contract. Tests run: deterministic build and artifact listing; Vercel JSON parse; whitespace validation; local HTTP route checks; headless Chromium gallery and prototype rendering; static scans confirmed all 15 pages have Chromux titles, CAPTURE controls, and modal scripts; exact linked `vercel build --prod` passed after package correction with no warnings. Skipped tests: the Electron suite is not relevant because no Electron runtime code changed; Vercel production smoke testing remains pending until the deployment exists. Adversarial review: inspected the exact artifact boundary for accidental repository exposure, broken relative gallery links, missing first/last routes, malformed deploy configuration, missing modal controls, animation-delayed blank renders, and generated/local files entering Git; fixed the initial ignore-file overwrite, removed a trailing-slash redirect that could conflict with Vercel normalization, and replaced stale root Electron package metadata after the first Vercel build unnecessarily rebuilt native dependencies and warned about a floating Node engine. Residual risk: four concepts use Google Fonts as progressive enhancement and will fall back to local fonts if Google is unavailable; final production routing and headers must still be smoke-tested against the deployed URL. Unrelated untracked root `main.js` is excluded as a stale Electron-file variant and left untouched; ignored generated skill/archive/working files remain uncommitted. Rollback: revert the v0.18.0 commit, redeploy the prior Git commit, and delete tag/release `chromux-v0.18.0` if necessary. Next command: `vercel deploy --prod` followed by production route checks.

## 2026-07-11 — Chromux v0.17.0 Grok agent + approval-gated browser

- Added Grok Build (`grok`) as a first-class agent alongside Claude Code and Codex: session picker, DETECT resume/fresh, shell-tab adoption, restore snapshots, and turn-signal hooks under `~/.grok/hooks/`.
- Made the paired browser approval-gated: new sessions start shut; detected localhost / loopback / local `.html` previews always QUEUE; open only on queue OPEN, ⌘/Ctrl-click, or URL bar Enter.
- Wrote `prototype/docs/privacy-and-local-data.md` and updated README / landing / troubleshooting for the terminal-first multi-agent workflow.
- Bumped prototype metadata to `0.17.0`; planned tag is `chromux-v0.17.0` (includes unreleased 0.16.0 Grok work).
- Ship goal: commit/push and pin GitHub `/releases/latest` so in-app update checks surface the new version.


## 2026-07-09 — Chromux v0.14.0 dynamic session tab titles

- Added chunk-boundary-safe observation of terminal OSC 0/1/2 title sequences while preserving passthrough of title bytes to xterm.
- Updated session tabs to render `session.term.title || session.name`, retain cwd and launch-name tooltip context, sanitize title text, and add overflow-aware active marquee plus inactive hover handoff with reduced-motion fallback.
- Added parser coverage for BEL/ST title OSC, split chunks, sanitization, ignored non-title OSC, and passthrough behavior, plus renderer smoke coverage for tab labels, fallback, truncation, active marquee, and hover handoff.
- Bumped prototype metadata to `0.14.0`; planned tag is `chromux-v0.14.0`.
- Validation: `npm run test:osc-parser`, `npm run test:turn-signals-renderer`, and `npm run test:tab-titles-renderer` passed from `prototype/`; `node --check prototype/scripts/test-tab-titles-renderer.js`, `node --check prototype/renderer/signals.js`, `node --check prototype/scripts/test-osc-parser.js`, and `node --check prototype/renderer/renderer.js` passed.
- Ship manifest: user goal was dynamic top session tab titles from Claude/Codex/shell terminal title OSC sequences. Changed files in the shipping boundary are `RELEASES.md`, `prototype/package.json`, `prototype/package-lock.json`, `prototype/renderer/signals.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-osc-parser.js`, `prototype/scripts/test-tab-titles-renderer.js`, `tasks/todo.md`, and `tasks/history.md`. Per-file purpose: release/package files record the minor app version and test script; `signals.js` observes title OSC sequences without stripping bytes; `renderer.js` stores title state, updates tab labels/tooltips, and exposes renderer test hooks; `styles.css` adds stable overflow, marquee, hover-scroll, and reduced-motion behavior; parser and renderer tests cover title extraction and UI behavior; task docs record completed work and this manifest. User-goal mapping: every runtime and test change traces to observing terminal title updates and reflecting them in session tabs while preserving existing OSC 777 turn-signal behavior. Adversarial review: inspected split-buffer handling, non-title OSC skipping, passthrough behavior, empty/control-heavy title sanitization, active/inactive overflow state, hover handoff, reduced-motion CSS, and test-surface scope; no blocker findings remained. Unrelated pre-existing worktree changes in `prototype/README.md`, `prototype/docs/capture-payload.md`, `prototype/docs/troubleshooting.md`, `prototype/docs/privacy-and-local-data.md`, `docs/testing/attention-queue-uat-2026-07-07.md`, `landing/`, root `main.js`, root `package.json`, and the pre-existing privacy-doc todo edit are excluded from the ship boundary and left untouched. Skipped tests: full Electron smoke/package was not rerun because this is renderer/parser/tab UI logic covered by targeted parser and Electron renderer smoke tests, with no dependency or packaging behavior change beyond SemVer metadata. Residual risk: visual animation timing may feel different on real tab widths or reduced-motion environments not manually inspected; the renderer smoke test verifies class selection and overflow measurement but not subjective animation feel. Rollback is `git revert` of the v0.14.0 commit and deletion of tag/release `chromux-v0.14.0` if already published. Next command: `$exec` for `.github/ISSUE_TEMPLATE/first-success-report.yml`.

## 2026-07-08 — Chromux v0.13.1 Codex resume retry footer

- Added retry handling for detected/restored Codex resume launches that exit inside the startup window: Chromux now shows a workspace footer warning with the exact `codex resume <id>` command.
- Added RETRY RESUME to send the saved command back into the same terminal, preserving the original failure output and session context.
- Kept the existing unresolved restore warning for sessions where no saved conversation can be found.
- Bumped prototype metadata to `0.13.1`; planned tag is `chromux-v0.13.1`.
- Validation: `npm run test:detect-filter-renderer`, `npm run test:resume-retry-renderer`, `npm run test:agent-command-quoting`, and `npm run test:turn-signals-renderer` passed from `prototype/`; `node --check prototype/renderer/renderer.js`, `node --check prototype/scripts/test-resume-retry-renderer.js`, and `git diff --check` passed.
- Ship manifest: user goal was to retry failed Codex resume loads after quick startup exits without losing the failed terminal context. Changed files in the shipping boundary are `RELEASES.md`, `prototype/package.json`, `prototype/package-lock.json`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-resume-retry-renderer.js`, and `tasks/history.md`. Per-file purpose: release/version files record the patch; renderer state and lifecycle code track resume launch metadata, quick-exit detection, warning rendering, and retry PTY input; styles add compact retry/dismiss footer actions; the new renderer smoke test covers quick exit, retry, dismiss, non-resume exit, and late exit behavior; history records this manifest. User-goal mapping: every runtime/test change traces to detecting failed `codex resume <id>` startup loads and retrying the exact saved command in the original session. Adversarial review: inspected the changed restore/detect/auto-restore launch paths, PTY exit hook, warning priority, retry input path, and test facade for false positives, retrying the wrong session, suppressing unresolved-restore warnings, and breaking command quoting; no blocker findings remained. Unrelated untracked files `docs/testing/attention-queue-uat-2026-07-07.md`, `landing/`, root `main.js`, and root `package.json` are excluded from the ship boundary and left untouched. No repo-local `docs/quality-gate-contract.md` exists, so the available `.agents/skillpacks/docs/quality-gate-contract.md` convention was applied. Skipped tests: full packaging/smoke was not run because this is renderer lifecycle/UI logic covered by targeted Electron renderer smoke tests, and no dependency or packaging behavior changed beyond SemVer metadata. Residual risk: real Codex failures that keep the shell alive longer than the 15 second quick-exit window will not trigger this footer; users can still rerun the command manually from the displayed launch history. Rollback is `git revert` of the v0.13.1 commit and deletion of tag/release `chromux-v0.13.1` if already published. Next command: `$exec` for `prototype/docs/privacy-and-local-data.md`.

## 2026-07-08 — Chromux v0.12.10 webview shortcut delivery

- Fixed app-scoped shortcut delivery from paired browser webviews by sharing the main-process `before-input-event` handler across host and guest webContents.
- Preserved renderer-side modal/editable guards by reporting focused editable state from guest pages and consulting it before session switching, queue focus, or browser toggling.
- Added `test:webview-shortcuts-smoke` coverage that sends real Command key events into a focused webview and checks non-editable delivery plus input, textarea, and contenteditable suppression.
- Bumped prototype metadata to `0.12.10`; planned tag is `chromux-v0.12.10`.
- Validation: `npm run test:shortcuts-renderer`, `npm run test:browser-collapse-renderer`, and `npm run test:webview-shortcuts-smoke` passed from `prototype/`; `node --check main.js`, `node --check renderer/renderer.js`, `node --check webview-preload.js`, and `node --check scripts/test-webview-shortcuts-smoke.js` passed from `prototype/`.
- Ship manifest: user goal was to make Command+1..9, Command+J, Command+Shift+B, and guarded quit continue working with focus in a paired browser webview while preserving modal/editable suppression. Changed files are `prototype/main.js`, `prototype/webview-preload.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-webview-shortcuts-smoke.js`, `prototype/package.json`, `prototype/package-lock.json`, `prototype/README.md`, `RELEASES.md`, and `tasks/history.md`. Adversarial review focused on preserving IPC channel names, avoiding `globalShortcut`, preventing guest editable shortcuts from reaching renderer actions, and exercising real guest `sendInputEvent` delivery. No `docs/quality-gate-contract.md` exists in this repo. Residual risk is limited to Electron key-event shape differences outside the smoke harness; rollback is `git revert` of the v0.12.10 commit and deletion of tag/release `chromux-v0.12.10` if already published. Next command: `$exec` for `prototype/docs/privacy-and-local-data.md`.

## 2026-07-08 — Chromux v0.12.9 settings-only update override

- Added a Settings-only INSTALL ANYWAY action for UPDATE WAITING when a managed install source is available, allowing explicit user override of live-session blockers.
- Preserved attention rail behavior: UPDATE WAITING still focuses the first blocker, and DISMISS still clears only the reminder/queue state.
- Kept the existing update-install lifecycle path for overrides, including the live-session confirmation, restore snapshot, managed install handoff, and restart flow.
- Bumped prototype metadata to `0.12.9`; planned tag is `chromux-v0.12.9`.

## 2026-07-08 — Chromux v0.12.8 preview parser hardening

- Hardened terminal preview routing so localhost URLs inside `rg` output, diffs, JS/test fixtures, markdown tables, and release-note prose do not open or queue fake previews.
- Preserved valid dev-server/prose preview routing for lines like `Local: http://localhost:5173/` and later distinct agent output, including queue source/reason metadata.
- Added `docs/explicit-preview-signal.md` to define the future OSC preview signal shape, with MCP planned as an adapter over the same internal routing action rather than a separate preview system.
- Bumped prototype metadata to `0.12.8`; planned tag is `chromux-v0.12.8`.
- UAT manifest: `docs/testing/chromux-0.12.8-preview-shortcuts-uat-2026-07-08.md` records seven PASS runs covering baseline empty queue, false-positive filtering, real preview output, typed echo suppression, queue explanations and legacy restore, browser/digit shortcuts, and attention ordering. Computer Use app-state reads timed out, so UAT evidence was collected from isolated Electron smoke-mode renderer DOM runs.
- Validation: `npm run test:preview-queue-renderer`, `npm run test:shortcuts-renderer`, `npm run test:browser-collapse-renderer`, `npm run test:update-queue-renderer`, `npm run test:turn-signals-renderer`, `npm run test:detect-filter-renderer`, `npm run test:capture-records-renderer`, `npm run test:osc-parser`, `npm run test:agent-command-quoting`, and `npm run test:github-update-check` passed from `prototype/`; `node --check prototype/main.js`, `node --check prototype/renderer/renderer.js`, `node --check prototype/scripts/test-preview-queue-renderer.js`, and `git diff --check` passed.

## 2026-07-07 — Chromux v0.12.7 preview queue explanations and shortcut fixes

- Shipped a patch release that suppresses preview routing from immediate user-typed localhost and local `.html` command echoes, including submitted input assembled across terminal chunks, while preserving later agent-printed previews.
- Added queue item metadata (`source`, `reason`, `detectedText`, timestamp) so review queue rows and attention details explain why a preview exists; legacy queue records without reason metadata are labeled as restored from a previous session.
- Added Command-Shift-B browser toggle wiring and docs, plus Command-1..9 digit normalization for Electron `input.code` reports.
- Bumped prototype metadata to `0.12.7`; planned tag is `chromux-v0.12.7`.
- Validation: `npm run test:preview-queue-renderer`, `npm run test:update-queue-renderer`, `npm run test:turn-signals-renderer`, `npm run test:detect-filter-renderer`, `npm run test:browser-collapse-renderer`, `npm run test:shortcuts-renderer`, `npm run test:capture-records-renderer`, `npm run test:osc-parser`, `npm run test:agent-command-quoting`, and `npm run test:github-update-check` passed from `prototype/`; `node --check prototype/main.js` and `node --check prototype/scripts/test-preview-queue-renderer.js` passed.
- Ship manifest: user goal was to wrap the session after fixing unexplained and user-typed preview queue items. Changed files in the shipping boundary are `RELEASES.md`, `prototype/README.md`, `prototype/docs/troubleshooting.md`, `prototype/main.js`, `prototype/package.json`, `prototype/package-lock.json`, `prototype/preload.js`, `prototype/shortcut-input.js`, `prototype/renderer/attention.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-collapse-renderer.js`, `prototype/scripts/test-preview-queue-renderer.js`, `prototype/scripts/test-shortcuts-renderer.js`, and `tasks/history.md`. Per-file purpose: app metadata/release notes record the patch release; README/troubleshooting document the browser toggle; main/preload/shortcut-input wire shell shortcuts and restore queue metadata normalization; renderer/attention/styles implement typed-echo suppression and reason rendering; tests cover shortcut, queue, restore, and attention behavior; history records this manifest. User-goal mapping: preview queue detector, metadata, UI, restore compatibility, tests, and release notes directly satisfy the accepted plan; shortcut changes were pre-existing worktree fixes included because the package version and release notes already promoted them and the app requires `prototype/shortcut-input.js`. Adversarial review: checked the diff for typed suppression lifetime, later-agent-output eligibility, async file-exists routing, legacy restore compatibility, duplicate queue behavior, attention detail formatting, and shortcut IPC/preload coverage; no blocker findings remained. Skipped tests: full packaging was not rerun because these changes are renderer/main shortcut and queue logic covered by Electron smoke tests, and no dependency or packaging config changed beyond SemVer metadata. Residual risk: real interactive terminal echo formats can differ from the smoke harness; a user would notice if a shell rewrites the submitted command so the immediate echo no longer contains the submitted text. Rollback is `git revert` of the v0.12.7 shipping commit and deletion of tag/release `chromux-v0.12.7` if already published. Next command: `$exec` for `prototype/docs/privacy-and-local-data.md`.

## 2026-07-07 — Chromux v0.12.1 update release completion

- Prepared `0.12.1` for publication so Settings update checks can converge on the running app version and GitHub Releases latest tag.
- Preserved the cache recomputation fix for stale latest-release metadata, the managed install flow, queue dismissal coverage, and release-process docs requiring actual tag and GitHub Release publication.
- Validation: `npm --prefix prototype run test:github-update-check`, `npm --prefix prototype run test:update-queue-renderer`, `npm --prefix prototype run smoke`, and `npm --prefix prototype run package` passed. Packaging still prints Electron Packager's existing `.icon` probe warning; accepted because the build completes and writes `prototype/dist/Chromux-darwin-arm64`.

## 2026-07-07 — Chromux GitHub release backfill for update checks

- Root cause: the updater was correctly reading `https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest`, but GitHub Releases were stale at `chromux-v0.9.0`, so installed `0.9.0` builds reported themselves current.
- Backfilled published GitHub Releases for `chromux-v0.10.0` at `12c7e9b2689fa112d81ac8a2ea2d5975e497e179`, `chromux-v0.10.1` at `64248a0561e627f51a9acb3c851533ecd09168f3`, and `chromux-v0.11.0` at `93b95fc6708e1399ca7f341ca1c76e11808f5970`; marked `v0.11.0` latest.
- Updated `AGENTS.md` and `CLAUDE.md` so future ships require the actual Git tag and GitHub Release, and explicitly call out that update checks depend on GitHub Releases `/releases/latest`.
- Validation: before backfill, `gh api repos/GeorgeQLe/gblockparty-chromux/releases/latest --jq '.tag_name'` returned `chromux-v0.9.0`; after backfill it returned `chromux-v0.11.0`, `gh api repos/GeorgeQLe/gblockparty-chromux/releases --jq '.[].tag_name'` listed `chromux-v0.11.0`, `chromux-v0.10.1`, `chromux-v0.10.0`, and `chromux-v0.9.0`, and `npm run test:github-update-check` passed from `prototype/`.

## 2026-07-07 — Chromux v0.11.0 paired-browser collapse

- Shipped per-session paired-browser collapse/restore behavior: collapsed sessions expand the terminal, keep a narrow restore rail visible, disable divider resizing, preserve browser URL/queue/webview/capture state, and restore to the previous split width.
- Made the browser header controls a single-row horizontal toolbar so Queue, Pick Element, Capture, and Collapse remain reachable when the browser pane is narrow.
- Added `test:browser-collapse-renderer` coverage for collapse/restore, per-session tab switching, terminal refit, disabled divider behavior, state preservation, and narrow-toolbar reachability.
- Bumped prototype metadata to `0.11.0` and added `GBlockParty Chromux v0.11.0` release notes with planned tag `chromux-v0.11.0`.
- Validation: `npm run test:browser-collapse-renderer` and `npm run test:shortcuts-renderer` passed from `prototype/`. No lint/typecheck/build scripts exist in `prototype/package.json`; full packaging was skipped because this change is renderer-layout scoped and Electron smoke tests exercise the mutated runtime path.
- Ship manifest: user goal was paired browser collapse plus scrollable narrow toolbar. Changed files: `prototype/renderer/renderer.js` for session browser UI state/layout/test API, `prototype/renderer/styles.css` for toolbar/rail layout, `prototype/scripts/test-browser-collapse-renderer.js` for renderer smoke coverage, `prototype/package.json`/`package-lock.json` for version and script metadata, `RELEASES.md` for v0.11.0 release notes, and `tasks/todo.md`/`tasks/history.md` for task bookkeeping. Adversarial review checked state preservation, divider disablement, split restore, toolbar reachability, and shortcut/queue regression; residual risk is untested real interactive drag/collapse behavior outside the smoke harness. Rollback is `git revert` of the v0.11.0 commit. Next command: `$exec` for `prototype/docs/privacy-and-local-data.md`.

## 2026-07-06 — Chromux troubleshooting guide

- Added `prototype/docs/troubleshooting.md` covering preview detection, file previews, queue behavior, screenshots, console logs, CLI auth and delivery, wrong-session routing, storage cleanup, and manual retry commands.
- Linked the troubleshooting guide from `prototype/README.md`.
- Marked the troubleshooting documentation task complete in `tasks/todo.md` and reflected the docs addition in the v0.10.1 release notes.
- Validation: documentation-only change; checked the task surfaces and release metadata. No executable validation was relevant because no source, scripts, packaging config, schemas, or runtime assets changed.

## 2026-07-06 — Chromux v0.10.1 restore, quoting, docs-audit, and audit-clean wrap-up

- Shipped v0.10.1 fixes for restore-snapshot preservation on idle quit, guarded Command+J behavior in editable focus, failed hook-install fallback, and shell-safe Claude/Codex launch command quoting.
- Added `test:agent-command-quoting` and expanded shortcut regression coverage for the guarded Command+J IPC path.
- Finalized the refreshed devtool docs audit artifact and alignment/interrogation pages, leaving `tasks/todo.md` unchanged; remaining active docs work is `prototype/docs/troubleshooting.md` and `prototype/docs/privacy-and-local-data.md`.
- Fixed the package metadata boundary: updated `prototype/package-lock.json`, moved the packaging icon option to the base icon path, and upgraded Electron to 43.0.0 plus `@electron/rebuild` 4.1.0 after npm audit surfaced high-severity advisories.
- Validation: `npm --prefix prototype run test:agent-command-quoting`, `test:shortcuts-renderer`, `test:update-queue-renderer`, `test:capture-records-renderer`, `test:turn-signals-renderer`, `test:detect-filter-renderer`, `test:github-update-check`, `test:osc-parser`, `smoke`, `package`, and `npm --prefix prototype audit` all passed. The package build still prints Electron Packager's `.icon` format probe warning, accepted because `prototype/build/icon.icns` is copied into the bundle as `Contents/Resources/electron.icns` with a matching SHA-256 hash.
- Ship manifest: user goal was session wrap-up; changed files map to app fixes/tests, release metadata, docs-audit artifacts, dependency security cleanup, and history. Adversarial review focused on stale lockfile metadata, npm audit findings, package warnings, and Electron 43 compatibility; residual risk is limited to untested real interactive GUI daily-driver use after the major Electron bump. Rollback is `git revert` of the v0.10.1 commit. Next command: `$devtool-docs-audit` or `$exec` for `prototype/docs/troubleshooting.md`.

## 2026-07-06 — Chromux guarded shortcuts and v0.10.0 wrap-up

- Implemented Electron shell-level guarded shortcuts: Command+1..9 session switching, Command+J queue reveal/focus, and Command+Q confirmation before quit.
- Added preload shortcut listener APIs and renderer queue-focus behavior that focuses the first queued preview OPEN button without opening or dequeuing it.
- Added `test:shortcuts-renderer` coverage and retained a compatibility alias for the renamed attention/turn-signal smoke test.
- Preserved v0.10.0 release metadata and updated release notes for guarded shortcuts.
- Verified shortcut, update queue, attention/turn signals, detect filter, GitHub update check, capture records, and OSC parser tests.

## 2026-07-12 — Chromux v0.22.0 saved projects

- Added bounded, atomic `~/.chromux/projects.json` persistence for saved project directories and validated `package.json` start scripts.
- Added Saved Projects controls to the new-session flow; Start launches a normal shell session and preserves approval-gated preview routing.
- Selected `package.json` scripts as the v1 configuration source and deferred devctl/`apps.json` until a stable schema is available.
- Bumped prototype metadata to `0.22.0` and documented storage, privacy, cleanup, and troubleshooting behavior.
- Validation: `test:projects-renderer`, `test:preview-queue-renderer`, `test:browser-collapse-renderer`, `test:shortcuts-renderer`, `test:favorites-renderer`, and `test:capture-records-renderer` passed; syntax checks for mutated JavaScript and `git diff --check` passed. Electron smoke processes occasionally reported a transient macOS `SIGABRT` when launched back-to-back; each affected test passed when rerun independently, with no application assertion failure or warning remaining.
- Ship manifest — User goal: saved projects with validated starts and approval-gated preview routing. Changed files: `prototype/main.js` owns bounded validation and persistence; `prototype/preload.js` exposes narrow IPC; `prototype/renderer/index.html`, `renderer/renderer.js`, and `renderer/styles.css` provide the saved-project workflow; `prototype/scripts/test-projects-renderer.js` proves validation, shell quoting, launch, queueing, and no auto-navigation; package metadata, README/privacy/troubleshooting, release notes, and task docs record v0.22.0. User-goal mapping: every runtime file maps to persistence, valid Start enablement, or queue-only preview handling. Adversarial review: malformed/oversized files, missing directories, unsupported package runners, nonexistent scripts, duplicate records, control characters, unusual shell-significant script names, stale configurations, and silent browser navigation were inspected; main-process revalidation and POSIX quoting cover the command boundary. Skipped tests: full packaging was skipped because dependencies and packaging configuration did not change and Electron smoke tests execute the mutated main/preload/renderer paths. Residual risk: package scripts themselves are trusted project code and can perform arbitrary actions once the user explicitly presses Start; validation guarantees selection and quoting, not script safety. Rollback: revert the v0.22.0 commit and remove tag/release `chromux-v0.22.0`. Next command: `$brainstorm` for a candidate next phase.

## 2026-07-20 — Chromux v0.31.1 themed traffic-light alignment

- Centered the native macOS window controls against each theme's rendered titlebar while preserving the original 14px horizontal position and startup fallback.
- Added a narrow preload message and an active-renderer-only main-process handler that accepts finite, bounded integer coordinates before calling Electron's macOS window-button API.
- Added renderer geometry coverage for Blueprint (`y = 14`), Retro-OS (`y = 22`), Streak (`y = 19`), and Liquid Glass (`y = 22`), plus IPC/configuration coverage.
- Bumped prototype metadata to `0.31.1`; tag and GitHub Release: `chromux-v0.31.1` / `GBlockParty Chromux v0.31.1`.
- Ship manifest — User goal: align native macOS controls with every themed brand row without changing theme appearance or spacing. Changed files: `prototype/main.js` validates and applies coordinates; `prototype/preload.js` exposes the narrow sender; `prototype/renderer/renderer.js` measures and reports themed geometry; the two focused test scripts cover the runtime geometry, bridge, validation, active renderer gate, startup fallback, and Electron API call; package metadata and `RELEASES.md` define v0.31.1; task files record completion. Tests run: `test:window-config`, `test:themes-renderer`, syntax checks for all mutated JavaScript, `git diff --check`, and eight real Electron theme captures. The first back-to-back theme test launch hit the repository's known pre-render macOS Electron `SIGABRT`; its isolated rerun passed with `THEMES_RENDERER_OK`. Skipped tests: packaging was not rerun because dependencies, packaging options, and packaged assets did not change; the actual Electron runtime path was exercised by renderer smoke tests and captures. Adversarial review: rejected missing, fractional, non-finite, negative, and over-bound coordinates; confirmed inactive/foreign senders and non-macOS calls are ignored; confirmed only theme-family switching recalculates and the initial 14/14 fallback remains. Residual risk: macOS may render native controls with small OS-version-specific optical differences despite matching geometric centers. Rollback: revert the v0.31.1 commit and delete tag/release `chromux-v0.31.1`. Next command: `$brainstorm` for candidate next work.

## 2026-07-20 — Chromux v0.32.0 attention diagnostics

- Added persisted, restart-gated Developer Mode with CLI precedence, interactive-source default on, packaged default off, restore snapshots, and a narrow relaunch API.
- Added a read-only attention diagnostic projector and an always-expanded renderer strip for independent session inspection, expected/tracked/attention/tab comparisons, mismatch highlighting, and the latest 20 sanitized session events.
- Added domain, startup-resolution, renderer, stable-mode-absence, restart confirmation/cancellation, fallback, and deliberate DOM mismatch coverage.

## 2026-07-20 — Chromux v0.33.1 session-tab scrollbar clearance

- Reserved a permanent 9px scrollbar lane under session tabs and increased the containing strip by the same amount: 45px for base, Blueprint, and Retro-OS; 57px for Streak; and 53px for Liquid Glass.
- Preserved tab box dimensions, horizontal tab spacing, title animation, and scroll behavior. Retro-OS keeps its 35px tab box and 3px horizontal margins while moving its former vertical inset above the reserved scrollbar lane.
- Ship manifest — User goal: stop the horizontal scrollbar from covering tab bottoms or changing visible clearance as overflow appears and disappears. Changed files: `prototype/renderer/styles.css` owns the reserved lane and theme heights; `prototype/scripts/test-tab-titles-renderer.js` forces overflow and verifies geometry across all four theme families; `prototype/package.json` and `prototype/package-lock.json` set v0.33.1; `RELEASES.md` records the patch; `tasks/todo.md` and this history entry record completion. Per-file purpose and user-goal mapping: the CSS directly fixes the overlap, the renderer test guards the exact before/during/after behavior, and metadata/task files satisfy the repository's shipping contract. Tests run: `npm run test:tab-titles-renderer` and `npm run test:themes-renderer` passed from `prototype/`; `node --check prototype/scripts/test-tab-titles-renderer.js`, version-metadata assertions, and `git diff --check` passed. The first targeted test intentionally exposed only 4px of Retro-OS clearance; its vertical margins were corrected and both suites then passed. Skipped tests: full packaging and unrelated renderer suites were omitted because dependencies, packaging configuration, JavaScript runtime behavior, and non-tab UI were unchanged; the Electron geometry tests execute the affected rendered layout. Adversarial review: inspected every scoped diff for tab-size drift, scrollbar overlap, theme-specific padding/margins, forced-overflow reliability, stable stage position, metadata consistency, and accidental inclusion of unrelated dirty-worktree files. No blocker remained. Residual risk: OS scrollbar rendering can vary, but the app's stylesheet fixes WebKit scrollbar height at 9px and the Electron test proves at least 9px clearance; a platform overriding that CSS would be the remaining failure mode. Unrelated pre-existing README, alignment, research, docs, and interrogation changes remain outside the commit boundary and untouched. Rollback: revert the v0.33.1 shipping commit and delete Git tag/GitHub Release `chromux-v0.33.1`. Next command: install the `product-design` pack, then run `$brainstorm` to discover the next phase.

## 2026-07-20 — Chromux v0.33.2 Streak attention click targets

- Removed geometric hover movement from Streak attention cards and excluded `.qi-btn` queue actions from shared hover/active translation and border-width changes.
- Retained tactile action feedback with fixed border depth, border-color changes, and inset shadows that preserve the hit-test rectangle.
- Added native Electron pointer-input coverage for boundary `VIEW` and `DISMISS` clicks plus hover rectangle stability; the test failed against v0.33.1 with attention-card Y drift before passing with the fix.
- Ship manifest — User goal: make Streak attention actions respond on the first click even near a button boundary. Changed files: `prototype/renderer/styles.css` stabilizes card and action geometry; `prototype/scripts/test-streak-attention-click-targets-renderer.js` proves native boundary hover/click behavior; `prototype/scripts/test-themes-renderer.js` rejects translated or resized Streak queue controls while requiring non-geometric feedback; `prototype/package.json` registers the test and sets v0.33.2; `prototype/package-lock.json` keeps package metadata aligned; `RELEASES.md` records the patch; `tasks/todo.md` and this history entry record completion. User-goal mapping: CSS removes the confirmed hit-test instability, both tests enforce stable geometry and first-click behavior, and release/task metadata fulfills the shipping contract. Tests run: `test:streak-attention-click-targets-renderer`, `test:themes-renderer`, `test:turn-signals-renderer`, `test:preview-queue-renderer`, and `test:update-queue-renderer` passed from `prototype/`; the new test's syntax check, version-metadata assertions, and `git diff --check` passed. The turn-signal and preview suites each initially encountered the repository's known pre-render macOS Electron `SIGABRT`, and one update-suite launch hung without renderer output; clean isolated reruns passed with no application assertion failures or warnings. Skipped tests: full packaging was omitted because dependencies, packaging configuration, production JavaScript behavior, and assets did not change; the Electron renderer suites execute the affected CSS and queue interactions. Adversarial review: inspected the exact shipping diff for residual `transform` or border-width changes on `.qi-btn`, attention-card geometry movement, inactive/disabled and reduced-motion behavior, dark-theme inheritance, native boundary-coordinate reliability, action propagation, version consistency, and accidental inclusion of unrelated dirty-tree files; no blocker remained. Residual risk: OS-level pointer rounding differs slightly across display scale factors, but the native test clicks one device-independent pixel inside the rendered boundary and verifies both first-click outcomes. Rollback: revert the v0.33.2 shipping commit and delete Git tag/GitHub Release `chromux-v0.33.2`. Next command: install the `product-design` pack, then run `$brainstorm` to discover the next phase.

## 2026-07-20 — Chromux v0.33.3 per-tab restart identity

- Added validated provider conversation IDs to authenticated Claude, Codex, and Grok hook envelopes and attached them only to the matching live tab.
- Upgraded restore snapshots to schema v3, reserved exact identities ahead of legacy matching, and assigned distinct newest-first provider candidates without reusing a conversation.
- Added a startup disclosure for legacy best-effort matches while preserving unresolved fresh-open warnings and all existing restart paths.
- Ship manifest — User goal: preserve each tab's exact agent conversation across restart, including same-agent tabs in the same directory. Changed files: `prototype/main.js` extracts, validates, snapshots, enumerates, reserves, and resolves provider IDs; `prototype/renderer/renderer.js` stores live identity, snapshots it, initializes resumed tabs, and renders inferred-match warnings; `prototype/scripts/test-restore-session-identity.js` covers exact precedence, duplicate rejection, distinct legacy matching, exhaustion, mixed providers, malformed IDs, and schema compatibility; notifier, signal, and retry tests cover authenticated extraction, tab-local storage, snapshot inclusion, bounds, and warning disclosure; package metadata, README/privacy docs, release notes, and task records ship v0.33.3. User-goal mapping: exact IDs now drive restart commands, inference occurs only when exact identity is unavailable or duplicated, and users see every inference. Tests run: restore identity, agent-command quoting, Codex notifier/provider classifier, turn signals, resume retry, update queue, Developer Mode, shell adoption, app smoke, packaged smoke, JavaScript syntax checks, version assertions, and `git diff --check`. The first update-queue run encountered a pre-render Electron `SIGABRT`; a clean rerun passed with no application assertion failure. Packaging passed and the packaged app reported v0.33.3; Electron Packager's accepted secondary `.icon`-format probe warning remains even though the bundled `electron.icns` is byte-identical to `build/icon.icns`. Skipped tests: browser/resource/theme suites are outside the restore and signaling paths; the named restart, renderer, notifier, command, and packaged suites execute the changed behavior. The task-doc audit was unavailable because this repository has no `scripts/audit-task-docs.mjs`. Adversarial review: inspected exact-ID ordering, legacy-before-exact theft, duplicate and cross-provider reservation, candidate exhaustion, malformed/oversized identity fields, the shared v1/v2 read path, authenticated tab routing, snapshot round trips, command quoting, warning coexistence, unrelated dirty-tree exclusion, and restart-path preservation. Residual risk: provider-local storage layouts may evolve; exact IDs remain authoritative and avoid enumeration, while legacy inference will warn or leave a tab unresolved if candidates are unavailable. Rollback: revert the v0.33.3 commit and delete tag/GitHub Release `chromux-v0.33.3`. Next command: install the `product-design` pack, then run `$brainstorm` to discover the next phase.

## 2026-07-20 — Chromux v0.35.0 session-tab search

- Added a compact session search control between the right-most tab and add-session button, matching dynamic titles, launch names, agents, and working directories.
- Added keyboard traversal, Enter activation, Escape/outside-click dismissal, active-result state, and no-results/empty-session messaging.
- Grouped search and add into one right-sticky action surface with a protected trailing scroll extent, keeping the final tab close button reachable at maximum horizontal scroll.
- Extended the Electron renderer test to cover search filtering/activation, button ordering, sticky editor-edge geometry, all-theme scrollbar clearance, and final close-button visibility.
- Ship manifest — User goal: make crowded session tabs searchable while keeping search/add fixed at the right edge without covering the final tab's close button. Changed files: `prototype/renderer/index.html` defines the controls and application-level search overlay; `prototype/renderer/renderer.js` implements filtering, positioning, activation, keyboard behavior, and dismissal; `prototype/renderer/styles.css` owns the sticky group and themed search presentation; `prototype/scripts/test-tab-titles-renderer.js` covers functionality and overflow geometry; package metadata and `RELEASES.md` define v0.35.0; task files record completion. Validation: targeted renderer coverage, JavaScript syntax checks, diff checks, Electron screenshot geometry, app smoke, packaging, and packaged-version verification. Visual review used a ten-session Liquid Glass fixture at real editor width and caught a focus-induced horizontal shift while the fixed panel was nested in the clipped workspace; moving the overlay to application scope removed the shift and aligned the controls/panel to the editor inset. Rollback: revert the v0.35.0 commit and delete tag/release `chromux-v0.35.0`.

## 2026-07-20 — Chromux v0.36.0 attention seen-state and grouped session rail

- Added session-lifetime `turn.attentionSeenAt` independently of explicit dismissal, so unseen background completions remain in Attention until opened while active-session completions are already seen. Opening sessions leaves permission, input, authentication, rate-limit, and tool-failure state untouched.
- Added persisted icon-only Attention, Threads, and Git rail modes with an always-current Attention badge, two-row contextual header, exact-cwd groups, validated/cached Git-root groups, a final non-repository group, live-session filtering, dynamic titles, and accessible Action required/Working/Completed/Live status icons.
- Ship manifest — User goal: replace the single-purpose rail without displacing horizontal tabs and make completion attention reflect whether the completed session has been seen. Changed files: `prototype/renderer/attention.js` owns timestamp projection; `prototype/renderer/renderer.js` owns activation seen-state, persistence, grouping, caching, rendering, and test seams; `prototype/renderer/index.html` and `styles.css` define the accessible two-row rail across themes; `prototype/main.js` and `preload.js` provide the narrow timeout-bounded Git-root interface; `prototype/scripts/test-session-rail-renderer.js` and the updated turn-signal test prove the behavior; package metadata, README/troubleshooting, `RELEASES.md`, and task files document v0.36.0. User-goal mapping: every runtime change maps directly to seen completion semantics, rail navigation, grouped live sessions, status display, or repository resolution. Tests run: session rail, turn signals, attention diagnostics, tab activity, tab titles, shortcuts, update queue, themes, Streak attention click targets, source Electron smoke, packaging, packaged smoke/version and icon verification, JavaScript syntax, version assertions, and `git diff --check`. Skipped tests: browser preview, capture, resource-broker, and restore suites are outside the changed attention/rail/IPC paths; packaging and both source/packaged Electron launches exercise the complete mutated runtime boundary. Adversarial review: checked every session activation route converges on `activateSession`, completion timestamps remain monotonic past seen state, actionable states are neither acknowledged nor mutated on focus, explicit dismissal stays separate, exited sessions are filtered, non-Git ordering is final, asynchronous Git resolution cannot switch modes, cwd values are absolute/bounded/real directories, Git uses fixed argv without shell interpolation and a 2.5-second timeout, repository results are renderer-cached by exact cwd, and all eight theme/mode layouts keep controls inside the narrow rail. The packager's known secondary `.icon` probe warning is accepted because the packaged `electron.icns` SHA-256 matches `build/icon.icns`. Residual risk: a Git lookup that times out is cached as non-repository until the app restarts; this favors bounded UI responsiveness over repeated process launches. Rollback: revert the v0.36.0 commit and delete tag/GitHub Release `chromux-v0.36.0`. Next command: `$brainstorm` to discover a candidate next phase.

## 2026-07-20 — Chromux v0.36.1 centered session scrollbar

- Centered the existing 9px horizontal session scrollbar in a permanently reserved 15px lane with approximately 3px of clearance above and below across Blueprint, Retro OS, Streak, and Liquid Glass.
- Preserved theme-specific tab heights and top insets, sticky search/add actions, horizontal scrolling, stable overflow geometry, and all vertical scrollbar styling.
- Ship manifest — User goal: vertically center only the horizontal session-tab scrollbar without making the terminal move when overflow changes. Changed files: `prototype/renderer/styles.css` owns the shared 3px/9px/3px lane and normalized theme padding/margins; `prototype/scripts/test-tab-titles-renderer.js` measures both gaps across every theme before, during, and after overflow; `prototype/package.json` and `prototype/package-lock.json` set v0.36.1; `RELEASES.md`, `tasks/todo.md`, and this history entry record the patch. Per-file purpose and user-goal mapping: stylesheet changes are limited to tab-strip geometry, the Electron test proves centering and stability, and metadata/task files satisfy the release contract. Tests run: `npm run test:tab-titles-renderer` and `npm run test:themes-renderer` passed from `prototype/`; JavaScript syntax, version consistency, and `git diff --check` passed. The new geometry assertion first failed against v0.36.0 with a 0px Blueprint upper gap, then passed after implementation. Skipped tests: packaging and unrelated renderer suites were omitted because dependencies, packaging configuration, runtime JavaScript, assets, vertical scrollbars, and non-tab UI did not change; the targeted Electron suites render the affected CSS in the real application. Adversarial review: inspected the exact diff for accidental scrollbar width/color/thumb changes, vertical-scrollbar changes, tab-height drift, sticky-action regressions, Retro OS margin interference, theme-mode inheritance, unstable overflow dimensions, and unrelated worktree files; no blocker remained. Residual risk: Electron or OS changes to WebKit scrollbar sizing could diverge from the stylesheet's fixed 9px lane, but the runtime geometry test will detect that drift. Rollback: revert the v0.36.1 commit and delete tag/GitHub Release `chromux-v0.36.1`. Next command: `$brainstorm` to discover a candidate next phase.

## 2026-07-21 — Chromux v0.38.0 terminal skip-to-bottom control

- Added a floating `↓ SKIP TO BOTTOM` button to every terminal pane once its real xterm viewport is at least one current page behind `baseY`; visibility remains independent for every session and updates after scrolling, parsed output, and resize.
- Added an approximately 220ms ease-out animation through xterm's public scrolling methods, a reduced-motion immediate path, moving destination tracking while PTY output continues, focus restoration limited to the still-active session, and animation cancellation on wheel, pointer, or disposal.
- Suppressed the control in alternate-screen and zero-scrollback buffers and styled it bottom-center with shared theme tokens for Blueprint, Retro OS, Streak, and Liquid Glass.
- Ship manifest — User goal: make long terminal scrollback easy to return to without new output stealing the user's scrolled-back position. Changed files: `prototype/renderer/renderer.js` owns session-local viewport state, animation, cancellation, focus safety, lifecycle wiring, and test hooks; `prototype/renderer/styles.css` owns the accessible floating surface and placement; `prototype/scripts/test-terminal-scroll-bottom-renderer.js` exercises real xterm normal/alternate buffers and every interaction boundary; `prototype/package.json` registers that suite and sets v0.38.0; `prototype/package-lock.json` aligns package metadata; `RELEASES.md`, `tasks/todo.md`, and this history entry document the release. User-goal mapping: runtime and CSS files implement the control, the Electron suite proves the requested threshold and lifecycle behavior, and release/task metadata satisfies the shipping contract. Tests run: `test:terminal-scroll-bottom-renderer`, `test:browser-collapse-renderer`, `test:shortcuts-renderer`, `test:themes-renderer`, `test:tab-titles-renderer`, and `test:turn-signals-renderer`; JavaScript syntax, package-version consistency, and `git diff --check` are part of the final gate. Four Electron screenshots visually verified bottom-center placement and readability across all theme families with narrow and full terminal layouts. The first dedicated test and sandboxed visual-capture launches encountered the repository's known pre-render macOS Electron `SIGABRT`; isolated/out-of-sandbox reruns passed without application assertion failures. Skipped tests: resource broker, favorites, capture, project, restore, and packaging suites are outside the renderer-only terminal viewport boundary; no dependency, packaging option, preload, IPC, persistence, or bundled asset changed. Adversarial review: checked threshold equality, resize drift, output while scrolled back and during animation, current-`baseY` destination changes, reduced motion, alternate buffer transitions, no-scrollback, session independence, hidden-session focus stealing, wheel/pointer cancellation, disposal, accessibility, stacking, and all eight theme appearances; the offstage focus case was found, fixed, and regression-tested. Residual risk: xterm may change scroll-event timing or buffer semantics in a future dependency upgrade, but the dedicated suite uses the installed real xterm API and buffer implementation. Rollback: revert the v0.38.0 shipping commit and delete tag/GitHub Release `chromux-v0.38.0`. Next command: `$brainstorm` to discover a candidate next phase.
## 2026-07-21 — Chromux v0.39.0 Threads terminal preview

- Added one anchored, read-only live xterm mirror for inactive Threads rows using bounded `@xterm/addon-serialize` output, with ANSI color, wrapping, normal/alternate-buffer, live-refresh, source-viewport, and no-PTY-input guarantees. Clicking or keyboard-activating the popover opens the session; outside click, Escape, mode changes, hidden anchors, closure, and other activation routes dispose it.
- Added active-row-to-terminal confirmation cues with repeat-safe and reduced-motion behavior, current/expanded ARIA state, focus entry/return, viewport clamping, rerender-aware anchor rebinding, and opaque Blueprint, Retro-OS, Streak, and Liquid Glass materials in Light and Dark modes.
- Corrected the preview after visual review: all material layers are opaque; header, terminal, and footer share a measured 12px horizontal inset; scaling uses the inset host box; Comfortable is now the readable default; and Settings offers persisted Compact, Comfortable, and Large sizes for vision accessibility without changing source geometry.
- Ship manifest — User goal: add a Threads-only live terminal preview without changing active-session behavior, plus a clear confirmation cue for the active row and accessible, readable presentation. Changed files: `prototype/package.json` and `prototype/package-lock.json` add the compatible serializer and set 0.39.0; `prototype/renderer/index.html` loads the addon, exposes preview-size Settings, and updates the visible version; `prototype/renderer/renderer.js` implements lifecycle, serialization, accessibility, positioning/scaling, size preference, cue behavior, and test seams; `prototype/renderer/styles.css` defines opaque themed materials, aligned padding, size variants, and motion treatments; `prototype/scripts/test-session-rail-renderer.js` supplies real-xterm functional, lifecycle, accessibility, geometry, opacity, padding, size, and eight-appearance coverage; `prototype/README.md` documents the interaction and accessibility preference; `RELEASES.md` records v0.39.0; `tasks/todo.md`, `tasks/lessons.md`, and this entry record completion and both user corrections. User-goal mapping: every runtime/style/test change maps to preview fidelity/isolation, activation/dismissal, cue feedback, or readability; metadata/docs satisfy the release contract. Tests run: `test:session-rail-renderer`, `test:themes-renderer`, `test:tab-titles-renderer`, `test:terminal-scroll-bottom-renderer`, `test:shortcuts-renderer`, source Electron `smoke`, JavaScript syntax checks, dependency compatibility (`npm ls`), package build, packaged asar dependency/version inspection, plist version inspection, `git diff --check`, and three Electron window captures used for visual opacity/padding/readability review. One terminal-scroll run initially observed zero fixture scrollback; an isolated rerun and the final regression pass succeeded with no application assertion failure. Packaging emitted Electron Packager's accepted secondary `.icon` probe warning; `electron.icns` remained selected and packaged version/addon inspection passed. Skipped tests: browser navigation, resource broker, update, capture, notifier, and website suites were not run because their runtime paths are outside the Threads renderer/addon/Settings scope; the affected renderer, theme, terminal, shortcut, smoke, and package surfaces were executed. Adversarial review: checked source viewport and PTY isolation with real scrollback, 300-row bounding, ANSI and alternate-screen fidelity, one-preview replacement, stale anchor/listener rebinding after rail rerenders, all dismissal and activation routes, repeated/reduced cues, focus/ARIA, clamping, explicit opacity, four-edge padding, persisted size behavior, addon peer compatibility, packaged inclusion, and exclusion of unrelated alignment edits. Findings fixed before ship were alpha-backed material layers, mismatched 7px/12px padding with outer-box scaling, stale anchor observer/outside-click references after rerender, a missing visually-hidden utility reference, and a stale live accessible title. Residual risk: extremely wide source terminals must still scale to fit and can remain small even at Large; users can open the full terminal immediately, and no transcript/reflow mode is introduced because it would misrepresent terminal geometry. Rollback: revert the v0.39.0 shipping commit and delete tag/release `chromux-v0.39.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive the three preview sizes with unusually wide and TUI-heavy sessions.

## 2026-07-21 — Chromux v0.39.1 per-tab terminal viewport preservation

- Stored each session's normal-buffer viewport line in runtime terminal state and guarded it from fit-triggered scroll/resize events.
- Wrapped the shared fit path so activation, browser layout changes, divider resizing, and resize observation restore the saved line with xterm's public scrolling API while bottom-following sessions continue following output.
- Strengthened the real-xterm regression harness with a deliberately viewport-moving fit and coverage for two distinct tab positions, repeated switching, inactive output, bottom following, browser collapse/restore, alternate-screen isolation, skip-to-bottom motion modes, cancellation, and disposal.
- Ship manifest — User goal: preserve the exact visible terminal content independently per tab across switching and fitting. Changed files: `prototype/renderer/renderer.js` adds session-local viewport tracking and guarded fit restoration; `prototype/scripts/test-terminal-scroll-bottom-renderer.js` proves the behavior against real xterm with a fit that would expose the prior bug; `prototype/package.json`, `prototype/package-lock.json`, and `prototype/renderer/index.html` set and display v0.39.1; `RELEASES.md`, `tasks/todo.md`, and this entry record the patch release. Per-file purpose and user-goal mapping: runtime state and the shared fit wrapper implement preservation across every existing fit caller, the renderer test maps directly to the acceptance cases, and metadata/task files satisfy the release contract. Tests run: `test:terminal-scroll-bottom-renderer`, `test:session-rail-renderer`, `test:browser-collapse-renderer`, `test:themes-renderer`, `test:tab-titles-renderer`, `test:shortcuts-renderer`, `test:turn-signals-renderer`, source Electron `smoke`, JavaScript syntax checks, version consistency, package build, packaged asar/plist version inspection, and `git diff --check`. The dedicated test first failed with the deliberately moving fit before implementation, then passed; a concurrent session-rail run missed its serializer fixture, and its required isolated rerun passed. Packaging emitted the accepted secondary `.icon` probe warning while selecting `electron.icns`; packaged version checks passed. Skipped tests: resource broker, simulator, update, capture, favorites, projects, restore, notifier, and website suites are outside the renderer-only terminal fit/state boundary; the changed renderer, adjacent rail/layout/theme/navigation paths, source app, and packaged app were executed. Adversarial review: inspected synchronous fit-triggered `onScroll`/`onResize` ordering, initial fit before listeners, saved-line clamping after scrollback eviction or row changes, bottom-following output, inactive scrolled-back output, alternate-buffer exclusion, skip animation updates, focus safety, disposal, every `session.term.fit()` caller, version consistency, and exclusion of unrelated alignment edits. No blocking finding remained. Residual risk: the saved integer line follows xterm's normal-buffer indexing, so future xterm reflow semantics could change how content maps across a width change; the installed real-xterm harness detects viewport jumps and repeated-switch drift. Rollback: revert the v0.39.1 shipping commit and delete tag/GitHub Release `chromux-v0.39.1`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive tab switching with long-running, high-output sessions and TUIs.

## 2026-07-21 — Chromux v0.40.0 paired-browser side rail

- Moved the paired-browser toggle out of the horizontally scrolling toolbar and into a permanent 40px far-right rail that remains structural chrome in both open and shut states.
- Changed the shut-state label to `BROWSER` with an inline, assistive-technology-hidden left-opening panel icon; retained `COLLAPSE`, open/shut titles and accessible names, per-session state, saved split width, divider handling, terminal refits, reopening paths, and Command+Shift+B.
- Ship manifest — User goal: replace the toolbar toggle with a permanent BROWSER / COLLAPSE side rail without regressing paired-browser behavior. Changed files: `prototype/renderer/renderer.js` owns the sibling content/rail DOM, icon/label rendering, accessible naming, and test geometry seams; `prototype/renderer/styles.css` owns fixed 40px rail geometry and prevents theme press effects from shifting structural chrome; `prototype/scripts/test-browser-collapse-renderer.js` proves placement, width, icon semantics, toolbar exclusion, Capture reachability, state preservation, reopening, and shortcut behavior; `prototype/README.md` and `prototype/docs/troubleshooting.md` update public control copy; `prototype/package.json`, `prototype/package-lock.json`, and `prototype/renderer/index.html` set/display 0.40.0; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. User-goal mapping: runtime/style changes implement the rail, the focused test covers every requested invariant, and docs/metadata satisfy the shipping contract. Tests run: all 21 package scripts containing `renderer`, source Electron `smoke`, JavaScript syntax checks, version consistency, package build, packaged plist version verification, and `git diff --check`; every executable check passed. Packaging emitted the accepted secondary `.icon` probe warning while producing the app with version 0.40.0. Skipped tests: website, resource-broker daemon/integration, simulator policy, notifier, restore identity, main-process update check, and browser-isolation suites are outside the renderer-only pane layout boundary; all renderer suites, the source app, and packaging exercised the changed boundary. Adversarial review: inspected DOM sibling/order guarantees, 40px box sizing in both states, open-state width consumption, toolbar overflow/end-control reachability, SVG direction and ARIA isolation, focus retention through label replacement, theme hover/active geometry, queue/favorites panel positioning, URL/queue/webview preservation, split restoration, divider disablement, refit behavior, all reopening routes, internal `RESTORE` queue-source values, version consistency, and exact exclusion of unrelated alignment edits; no blocker remained. Residual risk: very narrow manually resized browser panes leave less horizontal room because the permanent rail intentionally consumes 40px, but toolbar overflow remains scrollable through Capture and the regression test covers a narrow 285px pane. Rollback: revert the v0.40.0 shipping commit and delete tag/GitHub Release `chromux-v0.40.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive the side rail at minimum practical browser widths across all themes.
## 2026-07-21 — Chromux v0.41.0 reliable Codex idle state

- Added explicit `idle` turn lifecycle semantics so background completion attention persists until view or dismissal, active completion is consumed immediately, and submitted input resumes Working.
- Replaced raw PTY-tail completion inference with post-write inspection of the rendered xterm cursor and nearby recognized Codex chrome, retaining native notifier authority and low-confidence recovery diagnostics.
- Added quiet Idle tab and Threads indicators, update-safe Idle handling, rail-aware Attention diagnostics, and regression coverage for lifecycle, native/fallback completion, rendered ANSI/chunk boundaries, alternate footer placement, false glyphs, rail modes, DOM mismatches, and exited precedence.
- Ship manifest — User goal: make Codex completion and idle state reliable without losing unseen background attention, and remove false diagnostics outside Attention mode. Changed files: `prototype/renderer/attention.js` owns idle transitions, safety, indicator projection, and rendered-composer validation; `prototype/renderer/renderer.js` consumes completion on view/dismiss/active completion, reads xterm after write parsing, guards stale callbacks, records recovery diagnostics, and makes diagnostics rail-aware; `prototype/renderer/styles.css` presents quiet Idle dots; six focused scripts cover diagnostics, turn signals, tabs, Threads, update safety, and domain projection; `prototype/README.md` documents consumption; package metadata and `RELEASES.md` define v0.41.0; task files record delivery. User-goal mapping: state/domain changes implement `working → completed → idle → working`, xterm inspection recovers missed Codex notifications without silence timers, diagnostics respect mounted rail DOM, and release metadata satisfies the shipping contract. Tests run: attention diagnostics, turn signals/attention signals, Codex notifier, tab activity, session rail, update queue, Developer Mode, Streak attention clicks, themes, restore identity, shell adoption, detect filter, tab titles, resume retry, capture, preview queue, favorites, projects, shortcuts, hotkey debug, browser collapse, Grok warning, terminal scroll, source Electron smoke, changed-JavaScript syntax checks, version assertions, package build, packaged plist version inspection, and `git diff --check`; all passed. Skipped tests: resource-broker, simulator, browser-isolation, main-process update-check, window configuration, and website suites are outside the renderer turn-state/rail boundary; the affected renderer, native notifier, source app, and packaged app paths were executed. Adversarial review: checked native signal authority, active/background consumption, actionable-state preservation, unknown/silence non-inference, ANSI and split writes, composer footer above/below cursor, ordinary glyph rejection, stale write callbacks after new input, update safety, exit precedence, Attention/Threads/Git mounting, deliberate DOM drift, accessibility, version consistency, and exclusion of the user's two alignment edits. The stale callback race was found, guarded by the turn input timestamp, and regression-tested. Accepted warning: Electron Packager probes for an optional `.icon` file before successfully producing the app with the existing macOS icon path. Residual risk: future Codex releases may change composer chrome text; native `agent-turn-complete` remains authoritative, and unrecognized layouts stay Working rather than guessing from silence. Rollback: revert the v0.41.0 commit and delete tag/GitHub Release `chromux-v0.41.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive background Codex turns and inspect low-confidence recovery events in Developer Mode.

## 2026-07-22 — Chromux v0.42.0 multiline composer and prompt history

- Added a lightweight, per-session multiline composer for Claude, Codex, Grok, and shell terminals with header/keyboard opening, local submission, xterm paste/input routing, draft preservation, shell multiline confirmation, exited-session safeguards, autosizing, and raw-terminal focus restoration.
- Added canonical-working-directory prompt history with scratch-preserving Option-arrow recall, searchable reuse, deletion, confirmed clearing, exact-text deduplication, 100-entry project retention, global oldest-first 5 MiB eviction, atomic replacement, and `0600` permissions.
- Upgraded restore snapshots to schema v4 with optional bounded drafts, kept legacy snapshots readable and restored composers closed, and documented storage/privacy plus the ordered structured-interaction and Monaco roadmap.
- Ship manifest — User goal: ship Chromux 0.42.0 with a multiline composer and local per-project history while preserving xterm internals and all terminal behavior. Changed files: `prototype/prompt-history.js` owns validation, canonicalization, retention, eviction, and atomic storage; `prototype/main.js` and `prototype/preload.js` expose narrow history operations and schema-v4 drafts; `prototype/shortcut-input.js`, `prototype/renderer/renderer.js`, and `prototype/renderer/styles.css` own shortcut routing, editor/history behavior, xterm submission, focus, layout, and themes; focused persistence/composer/restore/shortcut tests prove the contracts; README/privacy/roadmap/release/task files and version metadata define the release. User-goal mapping: each runtime change maps to editor behavior, safe PTY routing, project history, or managed draft restoration; documentation and release metadata cover the storage and post-v1 boundaries. Tests run: prompt-history, composer renderer, restore identity, shortcuts, terminal scroll, shell adoption, turn signals, session rail, themes, update queue, browser collapse, tab titles, changed-JavaScript syntax checks, version consistency, `git diff --check`, package build, packaged asar inspection, and packaged plist version verification. A concurrent and then rapid isolated Threads preview run exposed its existing timing sensitivity before a clean isolated rerun passed; one rapid Electron composer launch exited with the repository's known pre-render `SIGABRT`, and its isolated rerun passed. Packaging emitted the accepted optional `.icon` probe warning and produced version 0.42.0. Skipped tests: resource-broker, simulator-policy, capture-delivery, favorites/projects, browser-isolation, notifier, website, and external-provider live CLI tests are outside the changed composer/history/restore boundary; Electron tests exercise the mutated main/preload/renderer and installed real xterm paths. Adversarial review: checked UTF-8 64 KiB limits, malformed/future/oversized records, canonical cwd isolation, per-project/global bounds, oldest-first eviction, atomic temp cleanup, permissions, deduplication, stale cross-session history, empty/duplicate submission, bracketed paste and final Enter count, shell cancellation silence, focus-context races, exited PTYs, viewport preservation, helper-textarea ownership, preview read-only behavior, diagnostics/log content exclusion, schema compatibility, all eight appearances, version consistency, and exact exclusion of the user's two unrelated alignment edits. Findings fixed before ship included immediate focus-context reporting, forced cross-session history refresh, byte-safe Unicode truncation coverage, and a deterministic history-deletion test seam. Residual risk: xterm intentionally translates pasted LF characters to terminal carriage returns before PTY emission; the installed real-xterm test locks that supported behavior and verifies only one final submit Enter. Rollback: revert the v0.42.0 shipping commit and delete tag/GitHub Release `chromux-v0.42.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive multiline prompts in long-running Claude, Codex, Grok, and shell sessions.

## 2026-07-22 — Chromux v0.41.1 terminal bottom-edge geometry

- Moved the existing 6px vertical and 8px/2px horizontal terminal inset from `.term-host` to its direct `.xterm` child so FitAddon subtracts it before selecting rows.
- Extended the real-Electron terminal fixture with a real FitAddon path that sweeps 61 one-pixel host heights around row boundaries and rechecks geometry after bottom scrolling, repeated tab activation, browser collapse/restore, and explicit refits.
- Ship manifest — User goal: keep Codex's bottom status line fully visible at every terminal height without changing viewport preservation, skip-to-bottom, tab switching, or browser resizing. Changed files: `prototype/renderer/styles.css` changes only inset ownership; `prototype/renderer/renderer.js` exposes real FitAddon geometry through the smoke-only test API; `prototype/scripts/test-terminal-scroll-bottom-renderer.js` proves containment and the intended bottom inset through the requested lifecycle; `prototype/package.json`, `prototype/package-lock.json`, and `prototype/renderer/index.html` set/display 0.41.1; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. Per-file purpose and user-goal mapping: the CSS makes FitAddon's existing padding subtraction accurate, the renderer fixture observes installed xterm geometry rather than mocking it, and metadata/task files satisfy the release contract. Tests run: `test:terminal-scroll-bottom-renderer`, `test:browser-collapse-renderer`, `test:tab-titles-renderer`, `test:themes-renderer`, `test:session-rail-renderer`, source Electron `smoke`, changed-JavaScript syntax checks, version consistency, package build, packaged plist version inspection, and `git diff --check`; all passed. The new geometry assertion first failed against the old CSS with an xterm screen extending 6px below a 112px host, then passed across the full sweep after the fix. Skipped tests: resource-broker, simulator, update, capture, favorites, projects, notifier, restore, and website suites are outside the CSS-only terminal sizing boundary; adjacent terminal, browser-layout, tab, theme, preview, source-app, and packaged-app paths were executed. Adversarial review: inspected xterm FitAddon's installed dimension algorithm, every `.term-host`/`.xterm` style, every terminal fit caller, border-box sizing, inactive-tab fits, bottom-following state, skip-control positioning, preview-terminal selector isolation, theme inheritance, metadata consistency, and exact exclusion of the user's two alignment edits; no blocker remained. Accepted warning: Electron Packager probes for an optional `.icon` file before successfully producing the app. Residual risk: a future xterm FitAddon could change its padding contract, but the real installed-addon sweep will detect loss of the 6px boundary. Rollback: revert the v0.41.1 commit and delete tag/GitHub Release `chromux-v0.41.1`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive terminal panes at unusual window heights while switching between long Codex sessions.

## 2026-07-22 — Chromux v0.43.0 unified Threads attention

- Removed the standalone Attention navigation mode, made Threads the persisted default, migrated saved Attention and invalid preferences, and moved the individual outstanding-item badge onto Threads.
- Added a pinned Chromux Update system row and an always-expanded Needs Attention section that orders session entries by their highest-priority reason, aggregates every reason/action into one thread, excludes attentive sessions from directory groups, and returns them immediately after the final reason clears.
- Preserved read-only thread previews, preview activation, active-session confirmation, direct inline focus/open/acknowledge/install/retry/Settings actions, update safety, attention acknowledgements, and Git Changes as the only alternate rail mode.
- Ship manifest — User goal: eliminate the dedicated attention queue by unifying outstanding work into Threads without changing the underlying attention-state, acknowledgement, preview, or update-safety semantics. Changed files: `prototype/renderer/index.html`, `renderer.js`, and `styles.css` define the two-mode navigation, migrated persistence, pinned/aggregated rail DOM, actions, ARIA, preview anchoring, and theme presentation; focused renderer tests cover rail migration/defaulting, badge placement, ordering, aggregation, deduplication, return-to-group behavior, diagnostics, signals, captures, previews, updates, click targets, and eight appearances; `prototype/README.md` and `docs/troubleshooting.md` document unified Threads; package metadata and `RELEASES.md` define v0.43.0; task files record delivery. User-goal mapping: the renderer removes only the standalone view, the unchanged attention projector retains domain priority/state semantics, aggregation guarantees one visible row per live session, and update notices remain globally pinned. Tests run: session rail, attention diagnostics/domain, turn signals, tab activity, update queue, capture records, preview queue, Streak native click targets, all eight theme appearances, source Electron smoke, changed-JavaScript syntax checks, package build, packaged asar/package/visible-version inspection, packaged plist version inspection, and `git diff --check`; all executable checks passed. Skipped tests: resource broker, simulator policy, browser isolation, provider notifier, restore identity, prompt history/composer, website, and external CLI suites are outside the renderer rail/attention boundary; the complete affected renderer, source app, and packaged artifact paths were executed. Adversarial review: checked two-mode persistence and invalid-value migration, pinned update precedence across ready/failed/running/waiting, per-session entry ordering by first projected item, secondary-item rendering, badge item counts, active-session suppression, actionable-state persistence, dismissible-state limits, exact-cwd deduplication and return, inline propagation isolation, row/preview/current-session interactions, Git preview dismissal, re-render anchor rebinding, ARIA labels/focusability, theme overflow, visible selector/copy migration, version consistency, and exact exclusion of the user's two alignment edits. A test expectation that treated global item order as flat DOM order was corrected to assert entry order after aggregation, and preview-anchor synchronization was retained when directory groups are empty. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app with the existing icon path. Residual risk: the narrow rail can show only a truncated highest-priority reason label, but its full detail and every action are rendered directly below in the expanded card. Rollback: revert the v0.43.0 shipping commit and delete tag/GitHub Release `chromux-v0.43.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive simultaneous permission, preview, delivery, and completion reasons in long-running sessions.

## 2026-07-22 — Chromux v0.43.1 centered paired-browser rail control

- Made the 40px paired-browser rail a column flex container and gave its direct toggle child a higher-specificity growing flex rule, restoring the full-height hit area and vertically centered `BROWSER` / `COLLAPSE` content without changing shared toolbar buttons.
- Extended the real Electron browser-collapse fixture with rail/toggle bounds and visible-child center measurements for both states.
- Ship manifest — User goal: center the paired-browser rail control vertically in open and shut states while preserving all existing behavior and excluding unrelated alignment edits. Changed files: `prototype/renderer/styles.css` owns the scoped flex correction; `prototype/renderer/renderer.js` exposes smoke-only rail, toggle, and content-center geometry; `prototype/scripts/test-browser-collapse-renderer.js` asserts full-height and centered geometry for `BROWSER` and `COLLAPSE`; `prototype/package.json`, `prototype/package-lock.json`, and `RELEASES.md` define v0.43.1; `tasks/todo.md` and this history entry record delivery. Per-file purpose and user-goal mapping: the CSS fixes the source-order collision with `.head-btn`, the renderer/test pair prevents recurrence in either state, and metadata files satisfy the release contract. Tests run: the new assertion failed before the CSS change with a 22px toggle in a 610px rail and a 294px center offset, then `test:browser-collapse-renderer` passed after the fix; `test:themes-renderer`, `test:terminal-scroll-bottom-renderer`, `test:shortcuts-renderer`, source Electron `smoke`, changed-JavaScript syntax checks, version consistency, package build, packaged asar and plist version inspection, and `git diff --check` all passed. Visual verification: source-renderer screenshots at 285px and 620px browser widths confirmed full-height centered controls in both open and shut states. Skipped tests: resource broker, simulator, update, capture, favorites/projects, notifier, restore/composer, and website suites are outside this CSS and browser-rail geometry boundary; the affected renderer, themes, shortcuts, terminal refit, source app, and packaged artifact paths were executed. Adversarial review: inspected every browser-rail and `.head-btn` rule, source order, selector specificity, theme hover/active transforms, direct-child structure, open-icon inclusion, content-union measurement, 40px width, full-height hit area, normal/narrow layouts, state/URL/queue preservation, shortcuts, version consistency, and exact exclusion of the two pre-existing alignment edits; no blocker remained. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app with the existing icon path. Residual risk: future markup that adds non-visible children to the toggle must continue to expose positive-size visible bounds, which the geometry regression will detect. Rollback: revert the v0.43.1 shipping commit and delete tag/GitHub Release `chromux-v0.43.1`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive the paired-browser rail across all eight theme appearances.

## 2026-07-22 — Chromux v0.44.0 unified session status indicators

- Normalized one leading Codex Braille animation frame for presentation across tabs, Threads, previews, search, tooltips, ARIA, and diagnostics while retaining the sanitized raw terminal title and OSC bytes and falling back to the launch name for spinner-only titles.
- Added one shared session-status projection for tab, Threads, tooltip, ARIA, and diagnostic consumers, including red exited, amber action-required, cyan working, green completed, gray idle, and green live/unknown states; action and exit remain visible when activity indicators are disabled.
- Corrected the Threads working spinner to use `tabActivitySpin`, retained the shared reduced-motion stop rule, and expanded coverage for exactly one status element and Codex/Claude/Grok state agreement.
- Ship manifest — User goal: remove duplicate Codex/Chromux activity indicators and make every Chromux-owned session status agree across surfaces. Changed files: `prototype/renderer/attention.js` owns the shared projection; `prototype/renderer/renderer.js` owns presentation-only title normalization, shared consumers, and synchronized invalidation; `prototype/renderer/styles.css` owns action/exit visuals and the corrected animation; four focused test scripts cover domain, tab, Threads, title, accessibility, preference, provider, and motion contracts; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.44.0 delivery. Per-file purpose and user-goal mapping: raw title storage and terminal writes remain unchanged, every visible label flows through the normalized display helper, and every status consumer flows through the same projection. Tests run: new title and action-indicator assertions failed before implementation; attention diagnostics/domain, tab titles, tab activity, session rail, turn signals, OSC parser, themes, update queue/update safety, all 24 `test-*-renderer.js` suites, source Electron smoke, packaged Electron smoke, changed-JavaScript syntax checks, version consistency, package build, packaged asar/plist version checks, and `git diff --check` passed. Skipped tests: resource-broker integration, simulator policy, browser isolation, notifier, GitHub update-check, window configuration, and website suites are outside the renderer title/status projection boundary; the complete renderer suite plus source and packaged app exercised the mutated runtime. Adversarial review: checked raw-versus-presented title separation, Braille frame boundaries, spinner-only fallback, legitimate and non-leading symbols, lifecycle precedence, all actionable states, acknowledged-state presentation, preference-off behavior, one-indicator DOM cardinality, shared animation and reduced motion, active/background provider transitions, title/status invalidation, diagnostics mismatch detection, search/preview reuse, and exact exclusion of the user's two pre-existing alignment edits. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app. Residual risk: a future Codex title format without whitespace between its Braille frame and title text will intentionally remain unchanged to avoid stripping legitimate text. Rollback: revert the v0.44.0 shipping commit and delete tag/GitHub Release `chromux-v0.44.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: daily-drive background action-required and completion transitions across Codex, Claude, and Grok.

## 2026-07-22 — Chromux v0.44.1 focused tab visibility

- Added one activation-level reveal path that minimally scrolls a focused session tab into the visible strip in either direction while reserving the sticky Search/Add boundary and preserving scroll position for fully visible tabs.
- Extended the real Electron tab-title fixture with off-screen right and left activation, sticky-action clearance, and already-visible no-op coverage.
- Ship manifest — User goal: keep sessions focused through Threads, search, attention items, shortcuts, or programmatic navigation visible in the horizontally scrolling tab strip. Changed files: `prototype/renderer/renderer.js` owns the centralized visibility calculation called by `activateSession()`; `prototype/scripts/test-tab-titles-renderer.js` proves both reveal directions, sticky-control clearance, and no movement for an already-visible tab; `prototype/package.json` and `prototype/package-lock.json` set 0.44.1; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. Per-file purpose and user-goal mapping: every focus route converges on the changed activation function, the helper uses rendered strip/tab/action bounds for minimal immediate scrolling, and metadata/task files satisfy the release contract. Tests run: the new renderer assertion first failed against 0.44.0 because focusing the off-screen right tab left `scrollLeft` unchanged; after implementation, tab titles, session rail, shortcuts, attention diagnostics/domain, source Electron smoke, changed-JavaScript syntax checks, package build, packaged plist 0.44.1 verification, and `git diff --check` passed. Skipped tests: unrelated resource-broker, simulator, browser-isolation, capture, favorites, projects, composer/history, update, provider-notifier, website, and remaining renderer suites do not alter or independently bypass `activateSession()`; the focused tab fixture plus Threads, keyboard, diagnostics, source-app, and packaged-app boundaries exercise the changed path. Adversarial review: traced every `activateSession()` caller, checked left/right overflow, sticky-action overlap, flex gap clearance, unchanged visible-tab scroll, immediate non-animated behavior, missing-session/element guards, existing end-of-strip clearance, package-version consistency, and exact exclusion of the user's two pre-existing alignment edits; no blocking finding remains. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app. Residual risk: at an extremely narrow width where a tab physically cannot fit between the strip edge and sticky controls, no scrolling algorithm can make the whole tab visible; normal narrow overflow geometry is covered at 400px. Rollback: revert the v0.44.1 shipping commit and delete tag/GitHub Release `chromux-v0.44.1`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: publish the tag and GitHub Release, verify `/releases/latest`, then daily-drive cross-surface session navigation.

## 2026-07-22 — Chromux v0.44.2 reliable Threads clicks and attention spacing

- Replaced presentation-only Threads title rerenders with focused in-place synchronization for row labels, tooltips, ARIA/status metadata, and open terminal-preview headings, preserving the exact pointer target during working-title animation.
- Rendered Needs Attention as individually bordered cards inside 6px inset padding with a 6px vertical gap, removing the adjoining-card border rule.
- Ship manifest — User goal: restore reliable Threads clicks during active agent title animation and consistent 6px Needs Attention card spacing without changing preview, activation, dismissal, ordering, or status semantics. Changed files: `prototype/renderer/renderer.js` owns focused title/status synchronization and the smoke-only geometry seam; `prototype/renderer/styles.css` owns inset/gap/card boundaries; `prototype/scripts/test-session-rail-renderer.js` proves exact working-row identity, pointer continuity, preview/text/tooltip/ARIA/status synchronization, action isolation, and eight-appearance geometry/click behavior; `prototype/package.json` and lock set 0.44.2; `RELEASES.md`, `tasks/todo.md`, and this entry record the release. User-goal mapping: title-only events no longer replace clickable DOM, structural invalidation remains unchanged for lifecycle/attention/active/queue/working transitions, and the card collection follows the rail's 6px rhythm. Tests run: the new identity regression first failed because the row was replaced, then passed after implementation; all 24 renderer suites passed, including session rail, tab titles, tab activity/status, turn signals, themes, update, preview, capture, composer, and Streak click targets; attention diagnostics/domain, OSC parsing, source Electron smoke, changed-JavaScript syntax checks, version consistency, package build, packaged ASAR/plist 0.44.2 inspection, and `git diff --check` passed. Initial parallel sandbox launches aborted before assertions with `SIGABRT`; affected suites passed serially outside the sandbox. Skipped tests: resource-broker integration, simulator policy, browser isolation, provider notifier, restore identity, prompt-history domain, GitHub update-check, window configuration, and website suites are outside the title-presentation and rail-spacing boundary; the complete renderer matrix plus source and packaged app exercised the mutated runtime. Adversarial review: traced structural versus presentation invalidation, attentive and ordinary rows, active/inactive/no-preview click paths, preview anchoring and disposal, status/icon cardinality, inline action propagation, CSS theme overrides, exact 6px gaps/insets in all four Light/Dark theme pairs, version metadata, and exact exclusion of the two pre-existing alignment edits. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app. Residual risk: future title-driven structural behavior must explicitly restore full rail invalidation; current OSC titles are presentation-only by contract and the regression locks that boundary. Rollback: revert the v0.44.2 commit and delete tag/GitHub Release `chromux-v0.44.2`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`). Next command: push the scoped commit and tag, publish the GitHub Release, verify `/releases/latest`, then daily-drive rapid working-title changes with attention actions.

## 2026-07-22 — Chromux v0.45.0 restart-safe Needs Attention

- Upgraded workspace restore snapshots to schema v5 with up to 20 validated historical attention records per session, each carrying a known reason type, 4 KiB-bounded detail, occurrence time, and stable identifier while retaining schema v1-v4 readability.
- Snapshotted visible session-scoped turn and failed-delivery reasons without duplicating browser queues or global update status; restored records remain separate from live turn/capture state and are labeled `Before restart` in Threads.
- Consumed restored completion history on thread activation and kept permission, input, authentication, rate-limit, tool-failure, and delivery-failure history until explicit dismissal.
- Added focused main-process and Electron renderer coverage for schema bounds and rejection, legacy reads, stable IDs, historical/live coexistence, completion consumption, dismissal, and queue/update exclusions. Updated local-data documentation, package metadata, release notes, and task records for v0.45.0.
- Ship manifest — User goal: preserve Needs Attention across update and app-close restores without reviving stale live prompts. Changed files: `prototype/main.js` owns schema-v5 validation and persistence; `prototype/renderer/renderer.js` snapshots visible session reasons, restores historical projection, and owns consumption/dismissal; restore, signal, update, composer, session-rail, diagnostics, and capture tests cover the affected boundaries; README/privacy/release/task files and package metadata define v0.45.0. Tests run: restore identity, turn signals, update queue, composer, session rail, attention diagnostics, capture records, Developer Mode restart, source smoke, JavaScript syntax, metadata consistency, package build, packaged ASAR/plist version checks, packaged smoke, and `git diff --check` passed. Packaging emitted the accepted optional `.icon` probe warning and produced the arm64 app at 0.45.0. Adversarial review: checked active-session suppression, repeated snapshots, UTF-8 bounds, malformed/unknown records, historical/live same-thread coexistence, diagnostics agreement, completion consumption, explicit dismissal, delivery ownership, queue/update exclusions, legacy reads, update safety isolation, and exact exclusion of the two pre-existing alignment edits. Rollback: revert the v0.45.0 shipping commit and delete tag/GitHub Release `chromux-v0.45.0`. Deploy skipped: no separate deploy contract; GitHub Release publication is the required update channel.

## 2026-07-22 — Chromux v0.48.0 single Codex update preflight

- Added one application-level Codex release check that resolves the installed executable and version, follows Codex's Homebrew/GitHub/npm-readiness source policy, caches successful results for one hour, bounds failures and progress, and verifies `codex update` before reporting success.
- Held fresh, resumed, restored, Detect, and recognized shell-pane Codex launches in one deterministic queue while Claude, Grok, and shell restores continue immediately; one workspace prompt now offers release notes, update, retry, or launch-local Resume Anyway.
- Added the official process-scoped `check_for_update_on_startup=false` override to every Chromux-managed Codex command without changing the user's global Codex configuration, while retaining the existing per-session quick-resume warning after launch.
- Ship manifest — User goal: replace repeated per-PTY Codex startup update prompts with one safe preflight and resume gate. Changed files: `prototype/codex-update-service.js` owns executable/version resolution, stable source selection, caching, timeouts, bounded output, explicit install, and verification; `prototype/main.js` and `prototype/preload.js` expose narrow check/install/progress IPC and apply the main-process command override; `prototype/renderer/renderer.js` and `prototype/renderer/styles.css` own the queue, mixed-provider restore, shell-line hold/replay, global prompt, retries/bypass, responsive actions, and preservation of held rows in restart snapshots; the two new Codex update tests plus command-quoting and shell-adoption updates prove service and renderer behavior; package metadata, `RELEASES.md`, and task files define 0.48.0. User-goal mapping: every runtime change is limited to Codex update discovery, launch suppression, gating, deterministic release, or failure recovery; Claude and Grok launch behavior is unchanged. Tests run: JavaScript syntax checks; live stable-source preflight against the installed npm-compatible Codex 0.145.0; all 39 `prototype/scripts/test-*.js` files including renderer, restore, resume, command, notifier, update queue, resource broker, and browser isolation coverage; source Electron smoke; package build; packaged plist version inspection; packaged Electron smoke; version consistency; and `git diff --check`. Skipped tests: static website route/build suites were not run because no landing, gallery, mobile, or website build input changed; the complete prototype runtime and packaged-app boundaries were executed. Adversarial review: checked stable-only source behavior, Homebrew lag, npm publication lag, offline/timeout/malformed responses, stale cache, missing executable, installation-kind resolution, bounded IPC/output, no shell interpolation, post-update version verification, deterministic release during concurrent enqueue, one-prompt aggregation, retry/bypass semantics, mixed-provider restore, typed-shell clearing/replay, resume-warning separation, quit/update snapshot preservation for held sessions, narrow prompt wrapping, and exact exclusion of the user's two pre-existing alignment edits. Findings fixed before ship were an oversized npm registry metadata response (replaced with an exact-version readiness request), post-install dependence on a second network check, and loss of held Codex restore rows if Chromux closed before the gate resolved. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app with the existing icon path. Residual risk: `codex update` can still fail on a locally permission-restricted package-manager install; the queue remains held with bounded diagnostics, Retry Update, and Resume Anyway. Rollback: revert the v0.48.0 shipping commit and delete tag/GitHub Release `chromux-v0.48.0`. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: daily-drive a multi-session Codex restore through a real available update.

## 2026-07-23 — Chromux v0.50.2 native terminal-scroll synchronization

- Added lifecycle-owned `.xterm-viewport` scroll tracking so native scrollbar dragging and other DOM scroll paths refresh saved viewport state and skip-control visibility after xterm settles.
- Extended the real-Electron terminal suite to prove logical and physical bottom agreement, immediate control hiding, and exact one-page upward reveal.
- Ship manifest — User goal: eliminate the stale “↓ SKIP TO BOTTOM” control at the terminal's actual bottom without changing public APIs or persistence. Changed files: `prototype/renderer/renderer.js` owns coalesced native viewport tracking, cleanup, and smoke-only physical viewport controls/state; `prototype/scripts/test-terminal-scroll-bottom-renderer.js` owns the regression; `prototype/package.json`, `prototype/package-lock.json`, and `RELEASES.md` define v0.50.2; this entry records delivery. Per-file purpose and user-goal mapping: the tracker listens to the real viewport and reuses existing saved-state/visibility logic, the fixture drives the native scroll position directly, and metadata satisfies the release contract. Tests run: the terminal-scroll suite passed three consecutive final-design runs; themes, browser-collapse, composer, source smoke, changed-JavaScript syntax checks, version consistency, package build, packaged plist 0.50.2 inspection, and `git diff --check` passed. Skipped tests: resource broker, simulator, update, provider, persistence, capture, project/favorites, and website suites are outside the terminal viewport/control boundary; the affected real terminal, adjacent layout/theme/composer, source app, and packaged artifact paths were executed. Adversarial review: checked public-scroll compatibility, native bottom and exact-page mapping, alternate/no-scrollback suppression, animation visibility, timer coalescing, disposal cancellation, fit-state saving, test-only API containment, version consistency, and exact exclusion of the pre-existing `alignment/` edits. Initial parallel/rapid Electron launches intermittently aborted before fixture execution with `SIGABRT`; every affected suite passed on isolated rerun. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app. Residual risk: the DOM listener depends on xterm retaining its established `.xterm-viewport` element; a missing element degrades to the existing public-event behavior. Rollback: revert the v0.50.2 shipping commit and delete tag/GitHub Release `chromux-v0.50.2`. Deploy: GitHub Release publication is the required update channel; no separate manual deploy contract exists. Next command: publish and verify the v0.50.2 tag and GitHub Release.

## 2026-07-23 — Chromux v0.51.0 paired-browser tabs and project HTML explorer

- Added page-local paired-browser tabs and one session-local project HTML explorer while retaining session-level queue/collapse state and one isolated persistent Chromium partition shared by that session's page tabs.
- Routed plain and OSC 8 HTTP(S) links, queue items, favorites, and explorer selections through normalized new-or-focus behavior; typed web URLs navigate the active page, unsafe schemes stay inactive, and popups remain approval-gated.
- Added Git-root/launch-root HTML indexing and safe live-PTY/launch/project/unique resolution with dependency/VCS/symlink exclusions, ambiguity handling, encoded local URLs, explorer navigation/filter/autocomplete/refresh, and schema-v6 lazy tab restoration with legacy `currentUrl` migration.
- Ship manifest — User goal: give every terminal a tabbed paired browser, route terminal links internally, and provide a safe project HTML explorer without losing existing browser state or isolation. Changed files: `prototype/main.js` owns bounded indexing, canonical project containment, live-cwd resolution, URL encoding, and schema-v6 restore sanitation; `prototype/preload.js` exposes only the two bounded project-HTML operations; `prototype/renderer/renderer.js` owns page/explorer tab state, active-tab controls, link routing, lazy webviews, persistence, popup mapping, and picker cancellation; `prototype/renderer/styles.css` owns compact/narrow/theme-inherited tab and explorer presentation; the new browser-tabs/explorer suite plus restore/composer/webview fixture updates prove the contracts; README, troubleshooting, privacy, version metadata, release notes, task queue, and this entry document v0.51.0. User-goal mapping: page-tab changes preserve per-page history/console/capture/picker state, session state retains queue/collapse/partition isolation, main/preload changes constrain HTML discovery to the paired project, and restore changes preserve order/active/explorer state. Tests run: all 44 `prototype/scripts/test-*.js` suites passed in a controlled outside-sandbox sweep with exact cleanup of smoke-only broker daemons; after adversarial hardening, browser-tabs/explorer, restore identity, capture records, and browser isolation passed again; changed JavaScript syntax checks, version consistency, `git diff --check`, package build, packaged asar inspection, plist version 0.51.0, and packaged `SMOKE_OK` passed. Executable verification includes real Electron/xterm/webview, live PTY cwd, loopback/socket, resource broker, restore, capture, favorite, queue, shortcut, popup, theme, and cross-session isolation paths. Skipped tests: static website route/build tests were skipped because no landing/gallery/mobile/website build input changed; the two pre-existing `alignment/` edits remain outside the shipping boundary. Adversarial review: checked unsafe protocols/credentials, malformed encoding, literal spaces/hash, absolute/home/live/launch/project/unique paths, duplicate/missing/non-HTML/escaped references, canonical `/var` paths, Git-root stability after `cd`, VCS/dependency/cache/outside-symlink exclusion, index/file/title/ID bounds, exact URL deduplication, last/nearest tab closure, inactive webview/picker/capture/console isolation, popup ownership, blank/explorer typed navigation, legacy/new restore reads, narrow scrolling, all eight appearances, and exact exclusion of unrelated alignment changes. Findings fixed before ship included pre-`dom-ready` navigation, missing fake-toolbar guards, canonical macOS path handling, literal `#` encoding, unsafe `data:` smoke fixtures, project-root anchoring, duplicate restored IDs, hidden picker cancellation, and orphan smoke broker cleanup during the suite. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app. Residual risk: project indexing is a bounded synchronous filesystem walk in Electron's main process and can briefly pause on unusually slow trees up to the 10,000-file cap; excluded dependency/cache directories and on-demand refresh reduce the common case. Rollback: revert the v0.51.0 shipping commit and delete tag/GitHub Release `chromux-v0.51.0`. Deploy: no separate deploy contract exists; the GitHub Release is the required update channel. Next command: publish and verify the v0.51.0 tag and GitHub Release.

## 2026-07-23 — Chromux v0.52.0 recent-first Threads

- Added a compact persisted `RECENT` / `A–Z` Threads-header control, defaulted new and invalid preferences to Recent, hid it in Git Changes, and retained keyboard focus and accessible state.
- Added session-local deliberate activity timestamps for creation/focus, submitted terminal or composer input, and real turn-state changes; streaming PTY output and duplicate signals stay presentation-only.
- Sorted Working rows, directory groups, and contained rows by recent activity or display labels while preserving Chromux Update and Needs Attention urgency, then upgraded restore snapshots to schema v7 with validated timestamps and schema v1-v6 snapshot-time fallback.
- Ship manifest — User goal: make all non-attentive Threads recent-first by default with a persistent A–Z option and restart-safe activity, without destabilizing streaming rows or attentive priority. Changed files: `prototype/renderer/index.html` and `styles.css` add the compact header control; `prototype/renderer/renderer.js` owns validated preference state, deliberate activity mutation boundaries, deterministic sorting, title-stable DOM reordering, restore transfer, and smoke seams; `prototype/main.js` validates schema-v7 timestamps and migrates v1-v6; `prototype/preload.js` keeps raw restore-payload mutation inside the E2E-only bridge; rail/restore/composer tests prove behavior and compatibility; README/privacy docs, package metadata, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.52.0. User-goal mapping: Recent/A–Z rendering covers Working and exact-cwd groups, activity updates only at requested boundaries, attention/update projections are not reordered, and persisted timestamps survive restore. Tests run: all 44 `prototype/scripts/test-*.js` suites passed outside the macOS app-registration sandbox; final rail, restore, and theme suites passed after adversarial hardening; renderer/main/preload syntax checks, version consistency, `git diff --check`, source Electron `SMOKE_OK`, package build, bundle plist version 0.52.0, and packaged `SMOKE_OK` passed. Executable verification includes real Electron/xterm/webview, PTY input/output, native and inferred turn signals, restore IPC, themes, Git rail, update queue, browser isolation, and resource broker paths. Skipped tests: static website route/build tests were skipped because no landing/gallery/mobile/website inputs changed; the two pre-existing `alignment/` edits remain excluded from the shipping boundary. Adversarial review: checked malformed and legacy timestamps, equal-time deterministic ties, group maxima, focus/input/turn transitions, `/clear` and composer submission, PTY streaming, duplicate signals, title-driven A–Z changes without row replacement, active/background completion, Working deduplication, Needs Attention priority, Chromux Update pinning, Git visibility, local-storage validation, keyboard focus, narrow rail geometry, all eight appearances, test-only IPC containment, and exact exclusion of unrelated alignment changes. Findings fixed before ship included preserving restored activity during programmatic activation, updating rendered Codex completion recovery, reordering existing title-changed DOM nodes instead of replacing them, adding session tie-breakers to equal-time group order, and moving raw snapshot injection off the production bridge. Accepted warning: Electron Packager probes for an optional `.icon` format before successfully producing the app. Residual risk: legacy v1-v6 sessions intentionally share one snapshot timestamp, so their first Recent view uses alphabetical tie-breakers until deliberate activity occurs. Rollback: revert the v0.52.0 shipping commit and delete tag/GitHub Release `chromux-v0.52.0`. Deploy: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: publish and verify the v0.52.0 tag and GitHub Release.

## 2026-07-23 — Chromux v0.52.1 authoritative Codex clear boundary

- Changed exact whitespace-trimmed Codex `/clear` submissions from a no-op in turn tracking to an immediate idle transition that advances the turn generation and clears stale protocol, source, reason, completion, and busy-render metadata.
- Added a session-local completion barrier that rejects delayed rendered-composer recovery and native completion signals until the next ordinary submitted prompt starts a fresh working lifecycle.
- Extended real-Electron coverage across idle, focused-working, and background-working Codex sessions, including tabs, Threads Working membership, attention, diagnostics, update safety, delayed completion suppression, and ordinary post-clear completion.
- Ship manifest — User goal: prevent stale Codex Working state from surviving `/clear` and stop the cleared turn from reappearing. Changed files: `prototype/renderer/attention.js` owns the exact Codex clear transition, generation invalidation, metadata reset, and completion barrier; `prototype/renderer/renderer.js` initializes the barrier and exposes a diagnostics-only input seam; turn-signal, tab-activity, session-rail, diagnostics, and update-queue renderer tests prove every shared projection and recovery boundary; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.52.1. Per-file purpose and user-goal mapping: the reducer is the sole behavioral change, so every existing consumer sees Idle without surface-specific overrides; tests cover the requested Codex-only exact match, `/clear foo`, non-Codex `/clear`, delayed native/rendered completion, and post-clear re-arming. Tests run: the new turn-signal regression first failed at the unchanged generation; after implementation, focused turn-signal, tab-activity, session-rail, attention diagnostics/domain, update-queue, and composer suites passed; all 44 `prototype/scripts/test-*.js` files passed outside the macOS app-registration sandbox; changed-JavaScript syntax checks, metadata consistency, `git diff --check`, source Electron `SMOKE_OK`, package build, packaged plist/ASAR 0.52.1 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build tests were skipped because no landing, gallery, mobile, or website build input changed; executable verification covered the complete prototype runtime and packaged app. Adversarial review: traced idle/working/completed/unknown entry states, active and background projection, exact whitespace trimming, argument-bearing and non-Codex commands, monotonic generation changes, callbacks captured before and after clear, native v1/v2 rejection before a new prompt, timestamp rejection of pre-prompt v2 events after re-arming, retained session-level event deduplication/sequence history, update blockers, attention suppression, and exact exclusion of the two pre-existing `alignment/` edits. No blocking finding remains. Accepted warning: the first sandboxed Electron launch aborted with `SIGABRT` before assertions and passed unchanged outside the sandbox; Electron Packager also probed for an optional `.icon` format before producing the correctly versioned arm64 app. Residual risk: the barrier relies on Chromux observing the submitted `/clear` line; direct out-of-band Codex state changes remain governed by native notification and rendered-composer inference. Rollback note: revert the v0.52.1 shipping commit and delete tag/GitHub Release `chromux-v0.52.1`; v0.52.0 remains the prior release. Deploy skipped: no explicit manual deploy contract (`deploy.md` or `tasks/deploy.md`); the GitHub Release is the required update channel. Next command: push the scoped commit and tag, publish `GBlockParty Chromux v0.52.1`, and verify `/releases/latest`.

## 2026-07-24 — Chromux v0.58.2 Codex activity evidence

- Replaced submitted-input Working inference with a Codex-only pending state that advances the turn generation, blocks stale completion, remains update-unsafe, and projects **Awaiting agent activity** without a spinner or Working-section membership.
- Promoted Braille-prefixed OSC titles and meaningful terminal output to live activity evidence, then completed background work or idled focused work from stable titles; idle composer redraws resolve command-only submissions without command semantics.
- Removed `/clear` recognition, rendered/autocomplete inference, and their terminal session fields while retaining rendered-composer recovery, native notifier sequencing, in-place animated-title row/spinner continuity, and unchanged Claude/Grok behavior.
- Ship manifest — User goal: stop false Codex spinners by replacing `/clear` parsing with provider activity evidence. Changed files: `prototype/renderer/attention.js` owns pending/activity/title/output/composer lifecycle transitions and shared status/update projections; `prototype/renderer/renderer.js` removes command-intent capture, applies every OSC title as lifecycle evidence, avoids title-only stale-composer recovery, preserves title-frame DOM continuity, and initializes the new state; eight renderer test files prove direct, pasted, rendered, autocomplete, edited, ambiguous, command-only, ordinary-prompt, native-completion, title, output, Threads, diagnostics, shell-adoption, and update-safety paths; package metadata, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.58.2. User-goal mapping: every Codex submission now awaits observable activity, only evidence creates Working, stable/idle evidence resolves the turn, and no lifecycle branch inspects `/clear`. Tests run: the turn-signal test first failed against the old immediate Working inference; all focused lifecycle/title/tab/Threads/diagnostics/update/composer/shell suites passed; all 46 prototype test files passed through their package scripts, with isolated reruns for known Electron launch/theme timing flakes; changed JavaScript syntax checks, version consistency, `git diff --check`, source Electron `SMOKE_OK`, package build, packaged plist/ASAR inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build tests were skipped because no landing, gallery, mobile, or website inputs changed; the complete prototype runtime and packaged application boundary were executed. Adversarial review: checked pending entry from every prior turn state, generation and event-sequence retention, completion rejection before activity, repeated and stale completion, focused/background stable titles, multiple titles per chunk, title-only stale-composer callbacks, meaningful-output fallback, slash-command echo exclusion, composer redraw without activity, rate-limit chooser completion, activity-preference behavior, update blocking, diagnostics agreement, Working deduplication, animated-title DOM/animation continuity, saved-summary isolation, and Claude/Grok paths. Findings fixed before ship included skipping rendered recovery for title-only chunks, limiting structural Threads invalidation to actual lifecycle state changes, invalidating diagnostics after rendered recovery, and excluding slash-command echoes from fallback activity. Accepted warning: rapid sandboxed Electron launches intermittently aborted before assertions and the theme fixture once timed out; each affected suite passed unchanged in isolated or outside-sandbox execution. Residual risk: the activity fallback intentionally depends on Codex 0.145.0-era OSC title and composer formats; if both disappear, meaningful output still starts work but a silent command may remain pending and safely block updates until later evidence. Rollback: revert the v0.58.2 commit and delete tag/GitHub Release `chromux-v0.58.2`; v0.58.1 remains the prior release. Deploy: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: publish and verify the v0.58.2 tag and GitHub Release.

## 2026-07-24 — Chromux v0.58.3 resilient GitHub update checks

- Kept the GitHub Releases REST endpoint primary and added a no-follow request to GitHub's public latest-release route after default-endpoint request failures.
- Accepted only a relative canonical path or exact `https://github.com` URL for the canonical repository's stable `chromux-vX.Y.Z` tag, then synthesized the existing release/status fields without changing renderer or IPC contracts.
- Stopped persisting transient `network-error` results, ignored legacy cached network errors, and documented that the one-day cache applies to valid release results.
- Ship manifest — User goal: preserve reliable Chromux update checks when GitHub's REST quota or network path fails, ship as v0.58.3, and keep custom update endpoints unchanged. Changed files: `prototype/update-checker.js` owns structured request metadata, the strict no-follow fallback, synthesized releases, bounded dual-source errors, and cache retry semantics; `prototype/scripts/test-github-update-check.js` proves API success, 403/429/5xx/timeout/DNS recovery, strict redirect validation, custom endpoint isolation, comparisons, cache retry, legacy-cache migration, and structured errors; `prototype/scripts/test-update-queue-renderer.js` gives the queue fixture a deterministic valid cache so live fallback timing cannot overwrite injected E2E state; `prototype/docs/privacy-and-local-data.md` documents cache retention and the second GitHub request; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.58.3. User-goal mapping: the API remains the first request, only its exact default URL can trigger the GitHub redirect, redirect data maps into the unchanged status object, and transient failures remain visible but immediately retryable. Tests run: the expanded GitHub suite first failed because the old checker never invoked the fallback, then passed; focused GitHub, update-queue, Codex update-service, and Codex update-gate suites passed; all 46 prototype test files passed through 41 package scripts; changed JavaScript syntax, metadata consistency, `git diff --check`, source Electron `SMOKE_OK`, final package build, plist/ASAR 0.58.3 inspection, and final packaged `SMOKE_OK` passed. Skipped tests: static website route/build tests were skipped because no landing, gallery, mobile, or website inputs changed; the complete prototype runtime and packaged application boundary were executed. Adversarial review: checked relative and absolute canonical redirects, HTTP versus network failures, 301/302/303/307/308 handling, missing locations, non-redirect responses, foreign and scheme-relative hosts, credentials/ports/host spelling, wrong owners/repositories, latest/non-release paths, prerelease/malformed/query-bearing tags, bounded non-sensitive errors, API-success short-circuiting, custom endpoint isolation, stale runtime versions, and disk writes after failure/success. Findings fixed before ship were the queue fixture's startup-check race and canonical raw-location enforcement beyond normalized URL validation. Accepted warnings: the first sandboxed resource-broker run could not create its Unix socket and passed outside the sandbox; the queue fixture exposed the live-check race and passed after deterministic isolation; Electron Packager probed for an optional `.icon` format before producing the correctly versioned app. Residual risk: GitHub could change the public latest-release redirect shape; Chromux intentionally rejects any drift and returns a retryable bounded error instead of trusting a broader target. Rollback: revert the v0.58.3 commit and delete tag/GitHub Release `chromux-v0.58.3`; v0.58.2 remains the prior release. Deploy: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: publish and verify the v0.58.3 tag and GitHub Release, then confirm the public latest-release redirect resolves to it.
## 2026-07-24 — Chromux v0.59.0 localhost queue liveness and server launcher

- Added credential-free HTTP(S) loopback validation and bounded TCP-only probes across IPv4 and IPv6, with ephemeral queue `CHECKING…`, `READY`, and `SERVER OFFLINE` states, startup-race retries, manual rechecks, and restart reprobes.
- Added an anchored offline-row launcher that reuses main-process `package.json` validation, recommends `dev`, `start`, `serve`, then `preview`, resolves an allowlisted npm/pnpm/yarn/bun command, and creates a visible non-focused `<project> dev server` shell tab while retaining explicit `OPEN` approval.
- Returned main-frame loopback connection failures to the queue, ignored aborted/subframe failures, retained failed browser tabs for retry, and removed matching failure rows only after a successful navigation.
- Ship manifest — User goal: make queued localhost previews report server liveness and safely start a validated project server without stealing focus or browser approval. Changed files: `prototype/preview-probe.js` owns loopback URL validation and TCP probing; `prototype/main.js` and `prototype/preload.js` expose the narrow probe and validated script resolver; `prototype/renderer/renderer.js` owns runtime liveness, retry/poll lifecycles, launcher state, offstage session creation, and browser failure recovery; `prototype/renderer/styles.css` owns state, responsive-row, popover, and accessibility presentation; three focused test files cover probe, queue, launcher, and real-webview behavior; README, troubleshooting, privacy, package metadata, `RELEASES.md`, and task files document and version 0.59.0. User-goal mapping: probes never issue HTTP requests or resolve remote hosts, renderer code never constructs unchecked commands, shell tabs remain visible and non-focused, queue snapshots retain their prior shape, and browser navigation remains gated by `OPEN`. Tests run: all eight requested focused suites passed; all 47 `prototype/scripts/test-*.js` files passed; affected preview, project, real-webview, and theme suites passed after final hardening; JavaScript syntax, version consistency, `git diff --check`, source Electron `SMOKE_OK`, package build, packaged plist/ASAR 0.59.0 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website routes/build were skipped because no landing, gallery, mobile, or website inputs changed; the complete desktop prototype runtime and packaged app were exercised. Adversarial review: checked credential/host/protocol/port/default-port bounds, IPv4/IPv6 behavior, query/path isolation, timeout cleanup, startup races, deduplication, restore serialization, launcher dismissal, no-script/explicit-selection paths, package-manager and shell quoting, validation TOCTOU, focus preservation, 15-second polling, source-session closure, server exit, aborted/subframe failures, Electron error-page `did-finish-load`, existing-tab retries, successful-load cleanup, narrow-row wrapping, theme popover clipping, and accessible status names. Findings fixed before ship included bracketed IPv6 hostname normalization, guarding failure rows from error-page completion, cancelling polls after source-session close, wrapping offline actions at narrow widths, and overriding theme clipping only while the anchored popover is open. Accepted warnings: the sandbox initially denied local listeners, so socket/Electron tests ran in their approved outside-sandbox context; Electron Packager probed for an optional `.icon` format before producing the correctly versioned app; one concurrent theme launch returned no E2E result after smoke tests leaked detached broker daemons, and the isolated fixture passed after exact cleanup of only this run's daemons. Residual risk: launcher readiness is intentionally TCP-level and does not prove application-level HTTP health; a listening but unready server can show `READY`, while `OPEN` remains the user-controlled verification boundary. Rollback: revert the v0.59.0 shipping commit and delete tag/GitHub Release `chromux-v0.59.0`; v0.58.7 remains the prior release. Deploy: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: publish and verify the v0.59.0 tag and GitHub Release.

## 2026-07-27 — Chromux v0.64.0 routed full-browser Composer candidate

- Replaced the unpublished terminal-derived chat timeline with a full-width browser and docked **COMPOSE** drawer that targets any live session or a canonical **New session**.
- Routed existing-session prompts through the recipient’s terminal-input, prompt-history, activity, attention, and agent-specific shell-confirmation paths; kept the source browser focused; allowed working-agent steering; and preserved source drafts and attachments when the recipient is missing, exited, has pending input, or owns a draft.
- Added explicit persisted page-evidence attachments with refresh/remove controls and bounded payload, screenshot, URL, and title references, plus canonical fresh-partition session creation with inherited runtime, distro, cwd, URL, agent default, moved attachments, and an unsent review draft.
- Retained restore schema v9, persisted staged evidence and `fullBrowserComposerOpen`, treated the unpublished `chatOpen` field as a compatibility fallback, discarded `chatMessages`, and removed chat transcript/timer/rendering persistence and derivation.
- Ship manifest — User goal: replace full-browser chat with a routed session Composer and prepare v0.64.0 without publishing before the Windows gate. Changed files: `prototype/renderer/renderer.js` and `styles.css` own routing state, drawer geometry, recipient validation, attachment handling, new-session creation, and smoke seams; `prototype/main.js` owns schema-v9 sanitization and compatibility; the new focused Composer/capture scripts plus composer, restore, update-gate, and webview-shortcut regressions prove the requested behavior; README, capture/privacy/troubleshooting/roadmap docs, package metadata, `RELEASES.md`, `tasks/todo.md`, and this entry define the candidate. Tests run: the complete registered `npm test` matrix passed, including full-browser Composer, Composer, restore, browser layout/isolation, webview shortcuts, themes, resource broker, Windows platform, and storage/profile suites; changed JavaScript syntax, scoped `git diff --check`, version consistency, eight themed captures, macOS packaging, packaged plist/ASAR 0.64.0 inspection, and packaged `SMOKE_OK` passed. Skipped gate: real Windows 11 x64 / WSL2 UAT remains **NOT YET RUN**, and no Squirrel `.exe`, `.nupkg`, or `RELEASES` assets exist, so no commit, push, tag, GitHub Release, or `/releases/latest` verification was performed. Adversarial review: checked ephemeral target reset, stale/missing/exited targets, paired and background pending input, target-owned drafts, working-agent steering, ownership of history/activity/attention, shell multiline confirmation, capture-first attachment lifecycle, UTF-8 payload bounds, failure preservation, canonical four-session creation, fresh partitions, schema migration, full-width geometry, mounted-browser identity, all themes, and unchanged IPC. Findings fixed before handoff included retaining an unavailable selected target instead of silently retargeting and blocking unresolved paired-session terminal input while preserving the existing resolution UI. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: Windows packaging, WSL2 interaction, and update installation remain unverified until the mandatory real-machine gate passes. Rollback: revert the future scoped v0.64.0 shipping commit; v0.61.9 remains the latest published release. Deploy: no explicit manual deploy contract exists, and the GitHub Release update channel remains gated. Next command: on the Windows UAT machine, run `npm --prefix prototype run make:win`, complete `docs/testing/windows-uat-0.62.0.md`, then publish only after PASS.

## 2026-07-25 — Chromux v0.59.1 Codex pending spinner projection

- Projected Codex `pending` turns through the existing Working spinner class when activity indicators are enabled while retaining **Awaiting agent activity** tooltip/ARIA semantics and the internal pending state.
- Kept pending turns in their ordinary Threads directory groups until provider evidence confirms Working, and preserved the non-spinning pending presentation when indicators are disabled.
- Ship manifest — User goal: restore an immediate spinner after Codex submission without weakening pending-state `/clear`, stale-completion, update-safety, or provider-evidence safeguards. Changed files: `prototype/renderer/attention.js` contains the single presentation-only projection change; tab-activity, attention-diagnostics, and session-rail renderer tests prove immediate and continuous spinners, retained pending state, `/clear` Idle resolution and delayed-completion rejection, Working-section exclusion, disabled-indicator behavior, and unchanged Claude/Grok coverage; `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`, `tasks/todo.md`, and this entry define v0.59.1. Per-file purpose and user-goal mapping: no reducer transition, completion barrier, provider-evidence path, Working-group filter, update-safety rule, CSS animation, API, IPC, persistence, or schema changed. Tests run: the tab regression first failed against v0.59.0’s pending class; all five focused suites passed, then all 43 registered `test:*` scripts passed serially; changed JavaScript syntax, version consistency, `git diff --check`, source `SMOKE_OK`, package build, plist/ASAR 0.59.1 inspection, and packaged `SMOKE_OK` passed. Skipped tests: static website route/build suites were skipped because no landing, gallery, mobile, design, or website build input changed; executable verification covered the full desktop prototype and packaged application. Adversarial review: traced enabled/disabled projection precedence, action/dead/completed/idle precedence, pending-to-confirmed Working DOM identity and ARIA change, active/background `/clear` redraw, delayed completion rejection, update blocking, Working-section membership/deduplication, grouped and ungrouped tabs, Claude/Grok signals, version metadata, and exact exclusion of the user’s three integration-map/alignment edits. No blocking finding remains. Accepted warning: Electron Packager probed for an optional `.icon` format before producing the correctly versioned arm64 bundle. Residual risk: the visual spinner deliberately represents an outstanding submitted turn before provider activity, so it no longer means provider-confirmed work by itself; the tooltip and Working section preserve that distinction. Rollback: revert the v0.59.1 commit and delete tag/GitHub Release `chromux-v0.59.1`; v0.59.0 remains the prior release. Deploy: no explicit manual deploy contract exists; the GitHub Release is the required update channel. Next command: commit and push the scoped v0.59.1 change, publish `GBlockParty Chromux v0.59.1`, and verify `/releases/latest`.

## 2026-07-27 — Chromux v0.65.0 local MCP capture

- Added one-time-approved macOS MCP screenshots for the Chromux window and
  paired browsers, including direct image content, structured browser evidence,
  YAML, manifests, and safe local artifact resources.
- Added one exclusive 60-second Chromux-window WebM recording path with
  VP9/Opus and VP8/Opus preference, system-audio fallback, a persistent
  requester/audio/elapsed HUD, visible user stop, requester ownership,
  idempotent stop, streamed persistence, and timestamped contact sheets.
- Added the user-only capture-control socket, bounded stable caller identity,
  disconnect/deadline/window/app cleanup, private artifact modes, safe
  `resources/read`, macOS audio privacy metadata, documentation, and release
  metadata.
- Ship manifest — User goal: ship local-agent browser/window screenshots and
  Chromux-window recording as a separate v0.65.0 release after publishing the
  prerequisite v0.64.1 work. Changed files and per-file purpose:
  `prototype/capture/` owns socket addressing/transport, artifact persistence,
  resource validation, and capture coordination; `prototype/main.js`,
  `prototype/preload.js`, and `prototype/renderer/` own correlated approval,
  Electron capture, system-audio retry, MediaRecorder chunks, HUD/contact sheet,
  and lifecycle stops; `prototype/resource-broker/mcp-server.js` owns the four
  MCP tools, structured/image results, resource links, and binary/text reads;
  capture/MCP/Electron tests and `scripts/uat-macos-capture.js` prove the
  contracts; packaging metadata, README/docs, package metadata, `RELEASES.md`,
  `tasks/todo.md`, and this entry define and explain v0.65.0. User-goal mapping:
  target lists hide URLs, every capture is approved before macOS access,
  browser evidence reuses the bounded contract, recording is window-only and
  capped, audio failure stays visibly video-only, ownership and automatic stops
  persist artifacts, and resources never resolve arbitrary paths. Tests run:
  the complete final `npm test` matrix passed, including capture artifact,
  socket, coordinator, renderer, main-process, packaging, MCP, every existing
  Electron/browser/terminal/resource/update test, and Windows platform unit
  coverage; changed JavaScript syntax and scoped `git diff --check` passed;
  macOS packaging succeeded; packaged plist/ASAR inspection confirmed v0.65.0,
  the capture MCP surface, and `NSAudioCaptureUsageDescription`; final real
  packaged UAT produced non-empty PNG, WebM, and contact-sheet files at private
  modes during a two-second 1096×718 recording with system audio available.
  Skipped tests: static website route/build suites were skipped because no
  landing, gallery, mobile, or deployment input changed; the real first-time
  macOS permission prompt was not reset because this host already had capture
  permission, while actual packaged capture and audio were exercised. Adversarial
  review: checked denial without artifacts, approval timeout/cancellation races,
  immediate user stop during startup, concurrent clients/recordings, stable
  caller identity, owner-only and idempotent stop, disconnect/deadline/close/
  shutdown paths, audio denial/dead tracks, MIME fallback, chunk ordering,
  contact-sheet fallback, malformed/oversized socket data, target/recording ID
  validation, URL non-disclosure, traversal/encoded traversal/symlink/manifest/
  size restrictions, POSIX modes, unsupported platforms, no network listener,
  package privacy metadata, and exact exclusion of unrelated alignment,
  research, interrogation, and advisory-task edits. Findings fixed before ship
  included splitting approval from persistence/stream startup, removing denied
  artifacts, closing startup/stop races, preserving app-shutdown persistence,
  making caller registration immutable, correcting self-sized manifests, and
  retrying video-only after denied system audio. Accepted warning: Electron
  Packager probes for an optional `.icon` format before successfully producing
  the correctly versioned app. Residual risk: the first-time macOS permission
  dialog itself remains unobserved on this already-authorized host, and
  Windows/WSL real-machine UAT remains the separate promoted task. Rollback:
  revert the v0.65.0 commit and delete tag/GitHub Release `chromux-v0.65.0`;
  v0.64.1 remains the prior release. Deploy: no explicit manual deploy contract
  exists; the GitHub Release is the required update channel. Next command:
  commit and push the scoped v0.65.0 change, publish
  `GBlockParty Chromux v0.65.0`, and verify `/releases/latest`.

## 2026-07-27 — Codex Activity Indicator Lab

- Added a dedicated temporary-profile Electron activity lab with isolated
  interactive PTY and structured Codex JSONL lanes, explicit-run scenarios,
  cancellation/timeouts/cleanup, bounded traces, and sanitized report export.
- Added fake-Codex lifecycle/parser/isolation coverage and an Electron smoke
  proving normal startup bypass, explicit-run gating, and animation only for
  Working.
- Ran the five-scenario opt-in UAT on `codex-cli 0.145.0`; production fallback
  recognized Working promptly, but the resident interactive TUI produced
  69–86 seconds of false-working time after structured completion. Recorded
  evidence and a separately approvable production fix plan without changing
  normal Chromux activity behavior.

## 2026-07-28 — Chromux v0.69.0 conservative Codex activity fix

- Added an opt-in, explicitly turn-budgeted same-turn probe using a private
  Unix-socket Codex app-server, WebSocket framing through `app-server proxy`,
  ephemeral read-only threads, bounded sanitized lifecycle records, a
  no-`codex exec` process assertion, and deterministic cleanup.
- Gate 1 proved the handshake but not same-turn observation: the independent
  observer received no `turn/started` or `turn/completed` for either visible
  TUI attempt. The persistent sidecar pilot and Gate 2 live turns were
  rejected, as required by the approved decision rule.
- Shipped the conservative route: Pending/Awaiting agent activity remains
  update-unsafe but non-animated, while only provider-confirmed Working uses
  the spinner. Preserved title/output/notify, completion, failure,
  cancellation, process-exit, `/clear`, resume, restore, Threads, diagnostics,
  update queue, disabled indicators, and shell-adoption behavior.
- Stabilized the broad Threads preview regression with a bounded paint poll and
  preserved complete visible-layer accounting during in-place xterm repaint.
- Ship manifest — User goal: approve or reject exact visible-TUI observation
  within five live turns, implement the selected route, archive sanitized
  evidence, and release v0.69.0. Changed files and per-file purpose:
  `prototype/codex-app-server-lifecycle.js` owns qualified 0.145.x
  capability/transport handling and sanitized lifecycle parsing;
  `prototype/scripts/run-same-turn-probe.js` owns explicit turn accounting,
  ephemeral TUI scenarios, no-exec and cleanup assertions;
  `prototype/scripts/test-codex-app-server-lifecycle.js` covers versions,
  parsing, content exclusion, malformed/oversized data, IDs, disconnects, and
  timeouts; `prototype/renderer/attention.js` owns the conservative Pending
  presentation; `prototype/renderer/renderer.js` preserves complete visible
  preview-frame accounting; focused renderer tests prove Pending/Working,
  Threads, diagnostics, update safety, and preview behavior; README, plan,
  testing evidence, package metadata, `RELEASES.md`, and task files document
  v0.69.0. User-goal mapping: Gate 1 used no reference lane, never spawned
  `codex exec`, retained no prompt/output/item content, cleaned its private
  resources, rejected the unproven pilot, and left normal session launch free
  of app-server integration. Tests run: Activity Lab core/runner/Electron and
  lifecycle observer suites passed; idle/no-process control passed; focused tab
  activity, diagnostics, turn-signal, Threads, update queue, restore,
  shell-adoption, Codex metadata, and lifecycle suites passed; two consecutive
  Threads suites passed after paint stabilization; the final exact-state
  `npm test` matrix passed every registered Node/Electron/macOS/Windows suite
  without retry or warning. Skipped tests: the three Gate 2 live turns were not
  authorized after Gate 1 failure; website and real Windows/WSL UAT were out of
  scope because no website/platform packaging behavior changed. Adversarial
  review: checked version qualification, WebSocket masking/length bounds,
  malformed and oversized messages, unknown/wrong/stale IDs, duplicate event
  non-escalation, disconnect/timeout behavior, no prompt/response/item
  retention, explicit allowance refusal, no-exec accounting, cleanup, Pending animation semantics,
  pending-to-Working continuity, update safety, `/clear`, exit/cancellation,
  concurrent projection isolation, and preview atomicity. Findings fixed were
  the required WebSocket framing for Unix proxy transport, a missing-allowance
  `null` coercion to zero, fixed-delay preview sampling, and transient
  visible-layer paint accounting. Residual risk: the
  observer could not prove whether the two TUI launch attempts reached the
  model service, Codex remote app-server remains experimental, and the
  conservative fallback may miss some Working intervals by design. Rollback:
  revert the scoped v0.69.0 commit and delete tag/GitHub Release
  `chromux-v0.69.0`; v0.68.0 remains the prior release. Deploy: no explicit
  manual deploy contract exists; the GitHub Release is the required update
  channel. Next command: commit and push the scoped v0.69.0 boundary, publish
  `GBlockParty Chromux v0.69.0`, and verify `/releases/latest`.

## 2026-07-28 — Localhost first-success candidate held after one live turn

- Added the loopback-only dependency-free fixture, deterministic real-HTTP and
  Electron proof, exact one-turn UAT allowance, sanitized v1 report, docs, and
  v0.69.2 candidate metadata. Fixed hidden Electron E2E painting after the full
  matrix exposed background compositor suspension.
- Focused localhost, preview, projects, Composer, capture, browser, restore,
  shell-adoption, window, and session-rail suites passed. The final `npm test`
  matrix passed without retry or warning.
- Candidate `537a07f` stopped before submission because renderer CSP blocked
  its health fetch; it used zero turns and cleaned up. Candidate `952e420`
  verified health outside the renderer, queued and explicitly opened the real
  fixture, attached payload and screenshot evidence, and routed one prompt plus
  attachment references to the chosen Codex target.
- The single submitted turn remains a HOLD: the runner incorrectly treated
  decoy xterm protocol replies as Composer input and closed the sessions before
  retaining a response. No post-submission retry was made. The corrected runner
  now counts only matching Composer prompt payloads and preserves checkpoint
  metadata on failure, but it has not consumed another live turn.
- Ship manifest — User goal: durable localhost first-success proof and release.
  Changed files: fixture/server docs, HTTP/Electron/UAT scripts, test-only
  renderer seams, hidden-window paint option/contract, README/privacy/
  troubleshooting, package metadata, release notes, UAT report, and task
  records. User-goal mapping: deterministic checks prove queue/open/attachment/
  routing/decoy/timeout/cleanup; the live report records the one-turn HOLD.
  Tests run: focused matrix above plus clean full `npm test`; post-HOLD runner
  syntax and allowance tests passed. Skipped tests: no second live turn because
  the approved plan forbids retry after submission; Windows/WSL real-machine
  UAT is a separate gate. Adversarial review fixed CSP health checking, prompt
  versus terminal-protocol accounting, response-field sanitization, screenshot
  compositor stability, and failure checkpoint retention. Residual risk: the
  corrected live response/routing rubric is unproven. Rollback: revert
  `952e420` and `537a07f`; no v0.69.2 tag or GitHub Release exists. Deploy:
  blocked by the HOLD; GitHub latest remains v0.69.1.

## 2026-07-28 — Localhost first-success proof passed

- A separately authorized run on candidate `f497832` passed with exactly one
  submitted Codex turn and zero retries. The real fixture returned HTTP 200,
  entered QUEUE without automatic navigation, opened only through explicit
  approval, and exposed its stable release, blocker, and action markers.
- Page attachment persisted a 991-byte payload and 70,501-byte screenshot.
  The selected Codex target received one prompt payload with attachment
  references; the open decoy received none.
- The bounded response cited the visible approval-transcript blocker and
  supplied a concrete action. All managed sessions, the fixture listener,
  temporary profile, and temporary captures were removed.
- The passing sanitized report replaced the earlier HOLD transcript at
  `docs/testing/localhost-first-success-uat-0.69.2.md`. Runtime behavior did not
  change after the recorded candidate SHA.

## 2026-07-28 — Automatic Codex update-check retries

- Added a bounded three-attempt Codex preflight cycle with one-second and
  two-second delays. Every attempt repeats executable resolution, installed
  version detection, and stable release-source lookup; successful results keep
  the existing one-hour cache, while forced checks start a fresh cycle.
- Preserved the renderer's existing Checking Codex state and saved-order queue
  during retries. Any successful attempt releases all waiting Codex sessions
  automatically; only the third failure exposes the sanitized error and
  **RETRY CHECK**. Codex installation itself remains single-shot.
- Ship manifest — User goal: tolerate transient Codex startup update-check
  failures without manual intervention and release v0.69.3. Changed files:
  `prototype/codex-update-service.js`,
  `prototype/scripts/test-codex-update-service.js`,
  `prototype/scripts/test-codex-update-gate-renderer.js`,
  `prototype/package.json`, `prototype/package-lock.json`, `RELEASES.md`,
  `tasks/todo.md`, and `tasks/history.md`. Per-file purpose: implement bounded
  retries; prove retry, cache, error, and queue behavior; bump app metadata;
  document the release and completed task. User-goal mapping: the service owns
  the complete retry cycle so the renderer receives no intermediate error,
  while its existing single check promise retains and releases queued sessions
  in sequence. Tests run: JavaScript syntax checks, focused Codex update service
  and Electron renderer-gate suites, task-doc audit, and the complete
  `prototype` test matrix; all passed without warnings. Skipped tests: no live
  network or installation smoke was run because deterministic injection covers
  the retry boundary and the change must not execute or retry a real update.
  Adversarial review: checked attempt bounds, exact delays, complete preflight
  restart after release-source failures, final-error sanitization, success-only
  caching, forced cache bypass, saved-order queue release, intermediate prompt
  suppression, and install isolation. The review tightened complete-attempt
  coverage; no production defect remained. Residual risk: permanent failures
  now add roughly three seconds plus the existing per-attempt timeouts before
  the prompt appears. Rollback: revert the scoped v0.69.3 commit and remove the
  `chromux-v0.69.3` tag/GitHub Release; v0.69.2 remains the prior release.
  Deploy: no explicit manual deploy contract exists; the GitHub Release is the
  required update channel. Next command: commit the isolated v0.69.3 boundary,
  push it to `main`, publish the matching tag/release, and verify
  `/releases/latest`.

## 2026-07-28 — Capture delivery failure-recovery proof

- Added a repeatable isolated Electron UAT that persists a real Chromux capture
  and screenshot, invokes the production `claude -p` delivery adapter through a
  controlled local fixture, deliberately exits 23 on the first attempt, and
  verifies the matching failed delivery-log record.
- Ran the exact documented manual retry form against the retained payload. The
  second fixture invocation exited 0 with the expected YAML-content hash, while
  the payload and screenshot file hashes remained unchanged. The fixture made
  no real Claude, credential, network, or model request and removed all
  temporary artifacts after writing the sanitized v0.69.4 transcript.
- Ship manifest — User goal: close the recovery-proof gate despite inactive
  real Claude access, without claiming an account recovery. Changed files:
  recovery UAT script and archived report, package metadata, README,
  troubleshooting guide, release notes, task queue, and history. Per-file
  purpose: execute the real persistence/delivery boundary with a bounded fake
  adapter; preserve sanitized evidence; expose the repeatable command; set
  v0.69.4 metadata; record completion. User-goal mapping: the induced first
  failure proves disk-first artifacts and delivery history; the documented
  retry proves recovery using the same artifact content and no hidden mutation.
  Tests run: recovery UAT with report generation, JavaScript syntax check,
  focused capture delivery/renderer checks, and the complete prototype matrix.
  Skipped tests: real Claude authentication and model delivery were excluded
  because the subscription is inactive and the proof targets recovery
  mechanics, not account remediation; real Windows/WSL UAT remains separately
  queued. Adversarial review: checked isolation, real Electron IPC boundaries,
  fixture precedence, bounded invocation count, path containment, failure/log
  attribution, pre/post hashes, output sanitization, cleanup, no-network/no-real
  CLI behavior, and shell command-substitution semantics. The first run exposed
  that command substitution strips trailing newlines; the proof now records
  the normalized retry-input hash separately without weakening immutable-file
  checks. Residual risk: controlled fixture recovery does not establish that a
  human can restore an expired Claude subscription, and the POSIX manual-retry
  fixture is skipped on Windows. Rollback: revert the scoped v0.69.4 commit and
  remove tag/GitHub Release `chromux-v0.69.4`; v0.69.3 remains the prior
  release. Deploy: no explicit manual deploy contract exists; the GitHub
  Release is the required update channel. Next command: commit the isolated
  v0.69.4 boundary, push it to `main`, publish the matching release, and verify
  `/releases/latest`.

## 2026-07-28 — Threads inbox and Git worktree triage

- Replaced the Threads priority rail with always-visible Action Required,
  Ready to Finish, Working, and All Sessions sections. Added keyboard
  processing plus bounded Done/Snooze state in restore schema v10; new turns,
  attention sequences, Git state, and expired snoozes reopen obligations.
- Added a private, bounded repository catalog and provider-neutral linked
  worktree service. Inventory distinguishes stale work from Git-prunable
  metadata, ranks blockers and unfinished delivery work, and validates
  repository/worktree/file/status identity before every mutation.
- Added the Git review drawer with bounded diffs, binary/oversized fallbacks,
  whole-file stage/unstage, manual commit previews and hook warnings, confirmed
  fetch/fast-forward pull/publish/push/sync, and terminal focus/creation.
- Ship manifest — User goal: implement and publish the supplied v0.70.0 Threads
  inbox and Git worktree-triage plan. Changed files: `prototype/main.js`,
  `prototype/preload.js`, `prototype/dev-mode.js`,
  `prototype/git-worktree-service.js`, renderer HTML/JS/CSS, focused parser,
  restore, attention, queue, and real-Electron tests, package metadata,
  prototype README/privacy/troubleshooting docs, `RELEASES.md`,
  `tasks/todo.md`, and this history entry. Per-file purpose: own validated Git
  and schema-v10 persistence in the main process; expose only discriminated
  renderer requests; present the hybrid inbox and review workflow; prove
  parsing, mutation safety, persistence, interaction, accessibility, and theme
  behavior; document storage and recovery; prepare the minor release.
  User-goal mapping: each planned inbox section, triage transition, catalog
  field, worktree signal, review action, confirmation boundary, and excluded
  destructive operation maps to the service, renderer, or documented contract.
  Tests run: JavaScript syntax checks; `git diff --check`; Git parser and
  temporary multi-worktree integration tests; Windows platform checks; the
  complete prototype test matrix outside the command sandbox for macOS AppKit;
  and final directly affected session-rail, turn-signal, update-queue, restore,
  composer, and Git-service reruns. All executable checks passed with no
  product warnings. Skipped tests: real Windows 11/WSL2 UAT and live remote
  authentication were not available locally; deterministic WSL routing,
  noninteractive environment, rejected-push, hook-failure, and symlink fixtures
  cover those boundaries without contacting a real provider. Adversarial
  review: checked renderer path/argument isolation, catalog bounds and modes,
  malformed porcelain, Unicode/spaces/renames, missing/deleted-file stale
  conservatism, symlink escape rejection, linked/detached/locked/prunable
  worktrees, commit-preview invalidation, hook failure, rejected publish,
  fast-forward-only pulls, and omission of destructive/force/rebase/stash
  actions. Review findings fixed WSL noninteractive routing, unknown-mtime stale
  classification, hover-preview refresh races, xterm disposal timing, global
  update placement, and conflict-resolution staging. Residual risk: real
  Windows/WSL path behavior and provider-specific authentication UX remain
  covered by deterministic tests rather than physical-machine/live-account
  UAT. Rollback: revert the scoped v0.70.0 commit and remove
  `chromux-v0.70.0`; v0.69.4 remains the prior release. Deploy: no explicit
  manual deploy contract exists; the required update channel is the matching
  GitHub tag and latest Release. Next command: commit the scoped boundary,
  integrate it onto current `origin/main`, push, publish the release, and verify
  `/releases/latest`.

## 2026-07-28 — Vercel integration foundation

- Added a dependency-injected main-process Vercel service with host/WSL CLI
  discovery, CLI-login and encrypted token profiles, OAuth PKCE/state/token
  rotation/revocation primitives, upward linked-root discovery, and canonical
  project configuration. Exposed only bounded profile/configuration results
  through preload IPC; token-backed CLI calls use `VERCEL_TOKEN` and redact
  returned output.
- Preserved CLI-owned authentication when OS encryption is unavailable by
  storing only its non-secret label/account metadata in plaintext. Token and
  OAuth profiles still fail closed unless Electron `safeStorage` is available.
- Ship manifest — User goal: implement the supplied one-button Vercel shipping
  plan. This execution completed only its independently shippable main-process
  foundation; the visible setup/shipping workflow remains explicitly open in
  `tasks/todo.md`. Changed files: `prototype/vercel-service.js`,
  `prototype/main.js`, `prototype/preload.js`,
  `prototype/scripts/test-vercel-service.js`, package metadata, prototype
  README/privacy docs, `RELEASES.md`, `tasks/todo.md`, and this history entry.
  Per-file purpose: isolate credentials and configuration in main, route CLI
  execution to the project runtime, expose narrow IPC, prove security and
  recovery behavior, and record the incomplete v0.71 boundary. User-goal
  mapping: covers runtime-local discovery, CLI/token/OAuth connection
  primitives, encrypted persistence, secret redaction, deploy-root discovery,
  and per-project configuration; does not claim the button, setup wizard,
  guarded Git ship engine, deployment monitoring, or live UAT. Tests run:
  JavaScript syntax checks, focused Vercel service coverage, and the complete
  prototype test matrix; all passed. The service test was rerun after the
  adversarial fix. Skipped tests: live Vercel CLI/account/OAuth and real WSL
  UAT require external credentials or a Windows machine and are deferred with
  the visible workflow. Adversarial review: checked argv/environment secret
  boundaries, corrupt stores, POSIX modes, safeStorage unavailability, OAuth
  state/PKCE/refresh/revoke, canonical path containment, WSL token forwarding,
  and renderer result redaction. The review fixed CLI-profile persistence when
  encryption is unavailable and canonicalized both saved roots. Residual risk:
  the OAuth loopback owner and Vercel API request adapter are not wired, and
  Vercel API resource permissions must be validated against the registered
  public app before OAuth can drive deployments. Rollback: revert only the
  listed Vercel foundation files; no credential or project file exists until a
  connection/configuration action runs. Deploy: skipped because no explicit
  manual deploy contract exists. Shipping is intentionally held: local `main`
  is independently dirty and diverged from `origin/main`, and v0.71.0 must not
  be tagged or published until the complete user-visible workflow and live
  preview UAT pass. Next command: implement the terminal-header button and
  setup wizard against the existing preload surface.

## 2026-07-28 — Vercel terminal-header setup workflow

- Added a project-scoped **VERCEL** terminal-header action and accessible setup
  wizard over the existing narrow preload surface. The wizard reports the
  runtime-local CLI capability, connects CLI-owned login or an encrypted
  personal token, validates and removes profiles, discovers linked project
  IDs, accepts explicit IDs, configures direct/Git trigger preferences, and
  saves or removes canonical project mappings. Matching sessions display
  **VERCEL · READY** without reading credentials into the renderer.
- Extended project discovery with the canonical repository root needed by the
  setup form, retained deploy-root containment in main, cleared token inputs
  after every attempt, handled macOS `/var` aliases, and added a smoke-only
  no-Keychain seam for isolated renderer fixtures. Production continues to use
  Electron `safeStorage`; the seam is gated by both smoke mode and an explicit
  E2E environment flag.
- Added deterministic service assertions and a real-Electron renderer fixture
  with a fake runtime-local Vercel CLI. Focused service and renderer tests,
  JavaScript syntax checks, scoped diff checks, and the complete prototype
  matrix passed; one native-pointer Streak fixture failed twice during the
  sequential run, then passed in isolation after the Electron fixtures shut
  down, while every subsequent matrix test also passed. No live Vercel account,
  token, OAuth callback, deployment, or WSL runtime was exercised. v0.71.0
  remains an unpublished aggregate candidate; the guarded shipping engine,
  deployment monitor, live preview UAT, tag, and GitHub Release remain open.
  Next command: implement guarded shipping and deployment monitoring against
  the saved mapping.

## 2026-07-28 — Session wrap-up: research refresh and Vercel candidate

- Prepared two coherent direct-to-`main` shipping groups: the refreshed
  adoption/DX/integration/positioning research and review pages, followed by
  the v0.71.0 Vercel main-process foundation and terminal-header setup
  workflow. The existing seven local commits are also part of the integration
  boundary; five have patch-equivalent upstream commits, while the localhost
  first-success proof and Codex update retry remain locally patch-unique.
- Ship manifest — User goal: wrap up and push the current session while
  preserving the still-incomplete one-button Vercel plan. Changed files:
  `research/devtool-adoption.md`, `research/devtool-dx-journey.md`,
  `research/devtool-integration-map.md`,
  `alignment/devtool-adoption-chromux.html`,
  `alignment/devtool-dx-journey-chromux.html`,
  `alignment/devtool-integration-map-gigachadd-process.html`,
  `alignment/devtool-positioning-gblockparty.html`, `alignment/index.html`,
  `interrogation/devtool-adoption-r1-chromux.html`,
  `interrogation/devtool-adoption-r2-chromux.html`,
  `interrogation/devtool-positioning-r1-gblockparty.html`,
  `tasks/record-todo.md`, `tasks/recurring-todo.md`, `RELEASES.md`,
  `prototype/README.md`, `prototype/docs/privacy-and-local-data.md`,
  `prototype/main.js`, `prototype/package.json`,
  `prototype/package-lock.json`, `prototype/preload.js`,
  `prototype/vercel-service.js`, `prototype/renderer/index.html`,
  `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`,
  `prototype/scripts/test-vercel-service.js`,
  `prototype/scripts/test-vercel-renderer.js`, `tasks/todo.md`, and this
  history file. Per-file purpose: the research, alignment, interrogation, and
  advisory-task files capture the current adoption and integration evidence;
  the prototype service/main/preload files own runtime-local Vercel discovery,
  encrypted profiles, and narrow IPC; renderer files provide the setup
  workflow; tests prove the security and Electron integration contracts; app
  metadata, docs, release notes, and current tasks identify the v0.71.0
  candidate and its remaining blockers. User-goal mapping: the research group
  preserves the session's product evidence, while the prototype group delivers
  the independently usable setup slice without claiming that deployment
  shipping is complete.
- Tests run: `node --check main.js`, `node --check preload.js`,
  `node --check renderer/renderer.js`, `node --check vercel-service.js`,
  `node scripts/test-vercel-service.js`, and `git diff --check` passed;
  `node scripts/test-vercel-renderer.js` aborted inside the command sandbox,
  then passed in the approved outside-sandbox Electron context; `npm test`
  passed the complete prototype matrix outside the sandbox with no warnings,
  then passed again after the additive `origin/main` merge brought in the
  Windows/theme candidate changes. Focused Windows and Vercel service checks
  also passed after conflict resolution. The repository has no
  `scripts/audit-task-docs.mjs`, so no task-doc audit command applies.
- Skipped tests: no live Vercel CLI account/token/OAuth/deployment or WSL
  runtime was exercised because those require external credentials or a
  Windows environment; deterministic service and real-Electron fixtures cover
  the local contract. Static research/alignment pages received diff and link
  boundary review but no screenshot comparison because this shipping pass did
  not originate their design and no approved visual baseline exists.
- Adversarial review: performed a changed-file failure review focused on
  credential exposure, argv/environment boundaries, callback state/PKCE,
  canonical root containment, corrupt persistence, renderer token lifetime,
  stale async wizard results, and explicit project input validation. It found
  and fixed overly permissive explicit Vercel organization/project IDs, added
  a regression assertion, and removed the only whitespace warnings.
- Residual risk: real Vercel authentication, WSL discovery, OAuth loopback
  ownership, guarded Git shipping, deployment monitoring, and preview UAT
  remain unproved. A removed connection can leave a non-secret mapping visible
  as ready until setup is reopened and another valid profile is selected; the
  next shipping-engine phase should define whether removal blocks or cascades
  mappings. Rollback: revert the two new feature commits after the upstream
  integration merge; no credential/project store is created until a user
  explicitly connects or saves setup. Deploy: skipped because neither
  `deploy.md` nor `tasks/deploy.md` exists. Release publication remains blocked
  by the active v0.71.0 task and must not be tagged until the guarded shipping
  engine, monitoring, and live preview UAT pass. Next command: `$exec`.

## 2026-07-28 — Signed Windows installer and first-run setup implementation

- Added the versioned Windows setup/readiness contract and a Windows-only,
  keyboard-accessible five-stage setup overlay. Live Windows/WSL2/tool/root
  capabilities now gate only unavailable launches, optional agents remain
  independent, and blocked required runtime readiness leaves restore snapshots
  unconsumed until refresh succeeds.
- Added package-derived Squirrel artifact metadata, Microsoft Artifact Signing
  configuration, exact checksum/build metadata, Authenticode inspection, and a
  protected build-once workflow with Windows 10 build-19045 and Windows 11
  candidate UAT before draft verification and publication.
- Ship manifest — User goal: implement the supplied signed per-user Windows
  installer, protected release pipeline, resumable first-run diagnostics, live
  readiness gates, tests, documentation, and v0.73.0 release preparation.
  Changed files: `.github/workflows/windows.yml`,
  `.github/workflows/windows-release.yml`, `RELEASES.md`,
  `docs/testing/windows-signed-installer-uat-0.73.0.md`, `prototype/README.md`,
  `prototype/docs/privacy-and-local-data.md`,
  `prototype/docs/troubleshooting.md`, `prototype/docs/windows-setup.md`,
  `prototype/forge.config.js`, `prototype/main.js`, `prototype/preload.js`,
  `prototype/update-checker.js`, `prototype/windows-setup.js`,
  `prototype/windows-sign.js`, `prototype/renderer/index.html`,
  `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`,
  `prototype/package.json`, `prototype/package-lock.json`,
  `prototype/scripts/windows-artifacts.js`,
  `prototype/scripts/verify-windows-signatures.ps1`,
  `prototype/scripts/windows-release-uat.ps1`,
  `prototype/scripts/test-windows-artifacts.js`,
  `prototype/scripts/test-windows-platform.js`,
  `prototype/scripts/test-windows-setup.js`,
  `prototype/scripts/test-windows-setup-renderer.js`,
  `prototype/scripts/test-windows-sign.js`,
  `prototype/scripts/test-github-update-check.js`,
  `prototype/git-worktree-service.js`,
  `prototype/scripts/test-git-worktree-service.js`, and Linux Electron
  portability fixes in `prototype/scripts/test-capture-main-integration.js`,
  `test-composer-renderer.js`, `test-prevent-sleep-renderer.js`,
  `test-project-launcher-renderer.js`, `test-session-rail-renderer.js`,
  `test-streak-attention-click-targets-renderer.js`, and
  `test-terminal-scroll-bottom-renderer.js`, plus `tasks/todo.md` and this
  history entry. Per-file purpose: workflows separate unsigned validation from
  protected signing/UAT/publication; setup and renderer files own the bounded
  status contract, narrow IPC, UX, gates, migration, and self-test; updater and
  artifact/signing scripts derive and validate the exact Squirrel feed and
  signed candidate; tests cover setup, updater, packaging, and host
  compatibility; metadata/docs communicate v0.73.0 onboarding, retention,
  troubleshooting, and release gates; the Git fallback and Electron test
  changes resolve older-Git and Linux-host failures surfaced by the complete
  suite. User-goal mapping: every planned readiness check, capability rule,
  setup stage, signing boundary, immutable-candidate asset, real-machine gate,
  release/latest assertion, compatibility promise, and documentation surface
  maps directly to those files.
- Tests run: `npm run test:ci:windows`; the complete pre-integration `npm test`
  matrix in alphabetical continuation chunks after each surfaced host failure;
  focused Git worktree, composer, prevent-sleep, project-launcher,
  session-rail, Streak native-input, terminal-scroll, and Windows setup
  renderer reruns; JavaScript syntax checks; workflow YAML parsing with
  `js-yaml`; `npm audit --omit=dev --json` (zero production vulnerabilities);
  `git diff --check`; and
  focused setup, signing, and artifact tests after adversarial fixes. After
  rebasing onto the concurrent v0.71.0 Vercel foundation, the Windows CI
  suite, Vercel service/renderer checks, Windows setup renderer check, syntax,
  YAML, production audit, and complete `npm test` matrix all passed. The
  complete Linux
  Electron matrix used its existing one-retry policy for one animation-timing
  assertion, one native-pointer geometry race, and one post-success native
  shutdown abort; each passed on retry. Those are accepted Linux test-host
  flake signals, not Windows product warnings.
- The first pushed Windows validation run passed `npm ci` and the complete
  Windows test suite, then exposed that the global secure
  `brace-expansion@5.0.8` override is API-incompatible with Forge's legacy
  `minimatch` consumers (`expand is not a function`). The override was removed
  while retaining compatible secure `tar` and `tmp` overrides, and the
  package/lock boundary was regenerated. The full development-tool audit still
  reports transitive advisories in legacy Forge/Squirrel dependency ranges
  that have no compatible override; this is accepted for build-only tooling,
  while the shipped production dependency audit remains clean. The same run's
  Node 20 deprecation warnings were resolved by moving checkout and setup-node
  to their Node 24-backed v5 releases.
- Skipped tests: real Authenticode signing, Squirrel install/upgrade/uninstall,
  physical Windows 10/11 setup/restore UAT, and `/releases/latest`
  verification require the protected Azure identity, protected GitHub
  environments, signed prior installer, and self-hosted real-machine runners.
  They are intentionally enforced by the new release workflow and remain the
  active release blocker rather than being simulated locally. PowerShell
  execution was unavailable on this Linux host; YAML and JavaScript contracts
  were checked locally, while both PowerShell scripts must execute in the
  Windows candidate jobs.
- Adversarial review: walked every changed production, workflow, validation,
  and documentation boundary; checked WSL1 and old-Node rejection, distro/root
  injection, bounded diagnostics, optional-agent isolation, restore
  non-consumption, updater feed confusion, missing/mismatched assets, workflow
  input injection, signer/timestamp/publisher checks, and candidate hash
  consistency. Findings fixed the `$HOME/projects` default, exposed
  allowlisted per-check guides only when remediation is needed, moved
  `Update.exe` verification from the `.nupkg` to the real installed tree,
  required exact signer-subject equality, cross-checked build metadata against
  actual sizes/hashes, and passed workflow inputs through environment
  variables with an official prior-installer URL allowlist.
- Residual risk: a live GitHub audit found only `Preview` and `Production`
  environments, no repository Actions variables or secrets, no self-hosted
  runners, and a latest v0.72.0 Release with no assets. Therefore the Artifact
  Signing identity/profile, protected `windows-signing` and `windows-release`
  approvals, exact publisher subject, prior signed installer, and labeled
  Windows 10/11 WSL2 runners are confirmed blockers rather than unobserved
  assumptions. Concurrent upstream work also makes the unfinished v0.71.0
  Vercel shipping task an explicit publication blocker; v0.73.0 must not ship
  that incomplete feature accidentally. Rollback: revert the scoped commits
  before publication; after publication, revert, issue a higher corrective
  SemVer, and never replace immutable signed assets. Next command: `$exec` to
  complete the active Vercel shipping engine while the Windows signing
  environments, credentials, runners, and prior signed installer are
  provisioned.
- A concurrent browser-queue feature published and tagged v0.72.0 while the
  Windows CI compatibility correction was in progress. The signed-installer
  candidate was therefore advanced to the next available minor, v0.73.0,
  without rewriting the immutable v0.72.0 tag or Release.

## 2026-07-28 — Guarded Vercel shipping candidate

- Added the complete saved-mapping shipping path: current tracked/untracked Git
  review with a status/configuration fingerprint, direct preview selection,
  Git production-branch derivation, explicit normal and production
  confirmations, stage-all argument-safe commits, upstream push, clean-HEAD
  monitoring, push-only recovery, and refusal of conflicts, detached HEADs,
  stale reviews, hook failures, post-commit dirt, divergence, and empty commits.
- Added a bounded mode-`0600` non-secret job store and live update bridge.
  Direct deployments inspect the returned URL; Git deployments discover by
  `githubCommitSha` before inspection. Cancel is available only during local
  discovery/inspection, never during commit/push/deploy. Safe SHA/URL jobs
  resume after restart without repeating remote mutations.
- Added the exact loopback OAuth owner for
  `127.0.0.1:47891/vercel/oauth/callback`, public-client PKCE exchange,
  refresh rotation, revocation, encrypted token storage, ten-minute timeout,
  and completion/cancel/window/app cleanup. No client secret exists.
- Validation: all prototype tests passed, including the new service, OAuth
  loopback, and real-Electron production-confirmation/job-event suites; focused
  syntax and whitespace checks passed; source smoke passed; the macOS arm64
  package built at `0.71.0`; both plist version fields are `0.71.0`; packaged
  smoke passed outside the command sandbox. The packager's established
  optional `.icon` probe warning was accepted because the bundle was produced.
- Ship manifest — User goal: complete and publish v0.71.0 with guarded
  one-button Vercel shipping. Changed feature files:
  `prototype/vercel-shipping-service.js`,
  `prototype/vercel-oauth-loopback.js`, `prototype/vercel-service.js`,
  `prototype/main.js`, `prototype/preload.js`,
  `prototype/renderer/index.html`, `prototype/renderer/renderer.js`,
  `prototype/renderer/styles.css`, three Vercel test scripts, package scripts,
  README/privacy/troubleshooting/UAT docs, `RELEASES.md`, `tasks/todo.md`, and
  this entry. Per-file purpose and user-goal mapping: services own canonical
  mutation/monitor/OAuth state, main/preload keep credentials and state changes
  out of the renderer, renderer files expose review/progress/recovery, tests
  prove failure boundaries, and documentation records behavior, retention, and
  the remaining live gate. Adversarial review traced stale mapping/status
  races, status parsing, stage-all including untracked paths, detached/conflict
  refusal, commit hooks and post-commit dirt, missing upstreams, unchanged-HEAD
  push recovery, clean synchronized HEADs, production derivation/confirmation,
  direct argv/environment construction, SHA discovery timeout, cancel/retry,
  restart resumption, corrupt stores, event/output bounds, callback
  host/path/state/PKCE ownership, token lifetime/redaction, and active-window
  mutation ownership. It fixed target reset during review, controller lifetime
  during cancellation, double-read branch/environment derivation, and
  cancellation being exposed during Git mutations.
- Skipped/live tests: OAuth-backed direct/Git preview UAT was not run. Vercel
  app creation is dashboard-only and this session had no controllable signed-in
  browser. The local CLI is authenticated and the repository has a preview
  mapping, but identity-only CLI proof cannot substitute for the required
  public OAuth permission proof. Residual risk: Vercel app permissions, real
  Git integration latency/output, and live route behavior remain unproved.
  Rollback: revert only the Vercel candidate boundary; no tag or GitHub Release
  was created. Release is blocked until the public client ID is committed and
  the sanitized live UAT report reaches PASS. Next command: register the public
  app, then rerun `$exec` to complete UAT and publish `chromux-v0.71.0`.
## 2026-07-28 — Codex 403 restart recovery hotfix

- Added a strict public GitHub latest-release redirect fallback for non-Homebrew
  Codex installs while retaining exact npm registry availability checks and the
  existing bounded three-attempt schedule.
- Failed startup discovery now releases every queued Codex launch once in saved
  order, bypasses the gate for the app run, and leaves a non-blocking sanitized
  warning. Background retry never re-gates sessions, clears a current result,
  or reports an available update for a later safe restart without installing.
- Ship manifest — User goal: recover restored Codex sessions from exhausted
  GitHub API 403 checks and publish isolated v0.72.1. Changed files:
  `prototype/codex-update-service.js` implements and validates redirect
  discovery; `prototype/renderer/renderer.js` owns fail-open and background
  retry state; the two focused test scripts prove redirect rejection, retries,
  ordered release, no re-gating, warning actions, and deferred installation;
  package and lock metadata set v0.72.1; `RELEASES.md`, `tasks/todo.md`, and
  this entry record the release. These files map directly to discovery,
  recovery, verification, versioning, and handoff requirements. Unrelated
  Vercel work remains on its separate integration branch and is excluded from
  this hotfix boundary.
- Tests run: focused service and real-Electron gate suites with syntax checks;
  complete `npm test`; source `npm run smoke`; macOS arm64 `npm run
  package:mac`; packaged-app smoke; bundle/package/lock version consistency;
  staged and unstaged whitespace checks. All passed. The packager's established
  optional `.icon` probe warning was accepted because the app bundle was
  produced and smoked successfully.
- Adversarial review checked redirect status/origin/credentials/port/path/tag/
  query/fragment canonicalization, strict stable SemVer, exact npm readiness,
  bounded error exposure, retry count, ordered single release, concurrent
  launches, repeated retry, and live-session installation safety. It tightened
  leading-zero rejection and added renderer-side control-character stripping
  plus a 500-character bound.
- Skipped tests: a live forced GitHub REST 403 was not induced because doing so
  is nondeterministic and could consume shared rate limit; injected API/fallback
  service coverage exercises the same boundary. No separate screenshot review
  was needed because the real-Electron test asserts the exact warning copy and
  actions. Residual risk is limited to GitHub changing its canonical public
  redirect contract; that fails closed and triggers the tested non-blocking
  recovery. Rollback: revert the hotfix commit and issue a higher corrective
  SemVer after publication; never move or replace the immutable v0.72.1 tag.
  Next command: integrate the source-only fix onto current `main` while
  retaining its planned v0.73.0 metadata.

## 2026-07-28 — Intentional, turn-aware browser queue links

- Added authenticated MCP and OSC browser queue submissions with structured
  queued/already-queued/refreshed outcomes.
- Made terminal URL/file discovery a bounded current-turn browser-only fallback
  and removed it from Threads plus session/group attention badges.
- Persisted queue visibility, retained legacy restore behavior, documented the
  explicit signal contract, and prepared the v0.72.0 release.
- Ship manifest — User goal: make browser queue attention intentional and
  turn-aware, then publish v0.72.0. Changed feature files:
  `prototype/browser-queue.js`, main/preload/control/MCP/renderer integration,
  attention and signal domains, preview/resource/restore/group tests, package
  metadata, README/resource/privacy/troubleshooting docs, `RELEASES.md`, and
  task records. Per-file purpose and user-goal mapping: the validation module
  owns bounded authenticated URL admission and WSL file bridging; main/preload
  bridge the existing local control socket and renderer; renderer/attention
  own candidate lifecycle, persisted visibility, shared queue outcomes, and
  presentation filtering; tests prove boundaries and compatibility; docs and
  metadata define the public contract and release.
- Executable verification: changed JavaScript passed `node --check`; browser
  queue validation, preview renderer, restore identity, group badge, resource
  broker/MCP, and turn-signal focused tests passed; the complete registered
  prototype matrix passed twice, including synchronized output, attention
  diagnostics, session rail, shortcuts, browser lifecycle, Windows platform,
  and the adjacent Vercel worktree suites. Source smoke passed. The final
  macOS arm64 package built with both plist version fields at `0.72.0`, and its
  packaged smoke passed.
- Adversarial review traced missing/exited/wrong-session/wrong-token callers,
  unequal token lengths, credential-bearing/unsupported/oversized URLs,
  missing/directory local targets, async file-validation turn races, WSL file
  URL conversion, queue/candidate bounds, duplicate upgrades, open refreshes,
  exit/new-input cleanup, legacy restore defaults, browser-only restore
  persistence, and every Threads/tab/group/count projection. It fixed restore
  sanitization dropping visibility, WSL returning an unloadable Linux file
  URL, and stale async file validation crossing into a newer turn.
- Skipped tests and residual risk: real Windows/WSL interactive MCP invocation
  was not available on this macOS host; deterministic bridge/validation and
  Windows platform tests passed. No live external agent called the MCP tool;
  the same control transport is covered by integration and app-not-running
  contract tests. The packager's established optional `.icon` probe warning
  was accepted because the bundle was produced and smoked. Rollback: revert the
  v0.72.0 feature commit and release/tag; queue restore remains backward
  compatible because legacy records default to attention visibility.

## 2026-07-28 — v0.73.0 Vercel release integration blocked at OAuth permission gate

- Preserved the complete dirty Vercel/Codex candidate on
  `codex/vercel-oauth-v0.73.0-integration`, dropped the patch-equivalent local
  browser-queue commit during rebase, and integrated onto current
  `origin/main` while retaining the v0.73.0 Windows setup/signing candidate and
  packaging dependency fixes.
- Ship manifest — User goal: register a deployment-capable public Vercel OAuth
  app, prove direct and Git preview shipping with cancel/retry/restart recovery,
  and publish the combined source release as v0.73.0. Changed files:
  the Vercel services/main/preload/renderer/tests and supporting docs already
  recorded by the guarded candidate; Codex update service/renderer/tests;
  package scripts and 0.73.0 metadata; `RELEASES.md`; the renamed
  `prototype/docs/testing/vercel-shipping-uat-0.73.0.md`; and task records.
  Per-file purpose and user-goal mapping: the Vercel boundaries own encrypted
  public-client OAuth, guarded mutation, bounded non-secret persistence,
  cancellation, retry, and restart recovery; Codex files absorb the unpublished
  0.72.1 recovery candidate; metadata/release/task files combine all completed
  work under the upstream 0.73.0 candidate while leaving signed Windows assets
  as a separate blocked task.
- Executable verification: changed JavaScript syntax passed; focused Vercel
  service, OAuth loopback, shipping service, renderer, Codex update service,
  and Codex gate suites passed; the complete prototype matrix passed; the
  website build and route regression passed; source Electron smoke passed; the
  macOS arm64 package built; both plist version fields and packaged ASAR report
  0.73.0; packaged smoke passed; package/lock consistency and `git diff
  --check` passed. The complete matrix used its existing one-retry policy for
  one native Streak pointer-geometry timing failure, which passed unchanged on
  retry. The packager's established optional `.icon` probe warning was accepted
  because the bundle was produced and executed.
- Adversarial review: traced upstream conflict resolutions, host/WSL environment
  allowlists, token redaction and OS encryption, public/non-secret renderer and
  job surfaces, callback address/path/state/PKCE ownership, refresh rotation and
  access-token revocation, stage/commit/push production guards, stale review and
  post-hook dirt, direct-deploy creation, discovery/inspection cancellation,
  push/SHA/URL retry identities, automatic restart recovery, bounded mode-0600
  schema-v1 persistence, and absence of committed token-format values. No local
  implementation blocker was found.
- Live gate and residual risk: read-only CLI checks verified Vercel CLI 50.40.0,
  the sanitized account label `george-9471`, and the non-production
  `George Le's projects/chromux-landing` target. No preview was created.
  Browser automation exposed no connected browser, so the dashboard-only app
  could not be registered. Vercel's current official scopes/permissions
  documentation says API/team resource permissions are private beta; therefore
  an identity-only app cannot satisfy the mandatory OAuth deployment proof.
  The public client ID is not yet available, direct/Git live URLs and terminal
  phases are unproved, and no main push, tag, or GitHub Release was created.
  The authoritative current latest Release remains v0.72.0 with no assets.
- Rollback: discard the local integration branch to return to untouched
  `origin/main`; no remote branch, deployment, credential profile, tag, or
  Release needs cleanup. Next command: make a signed-in browser available or
  create the public app manually, confirm deployment write permission is
  exposed, provide only its public client ID, then rerun `$exec`.

## 2026-07-30 — Agent startup loading experience and v0.75.0

- Added a session-local, theme-aware startup skeleton for every managed Claude
  Code, Codex, and Grok Build launch. PTY bytes continue through xterm,
  lifecycle/title parsing, preview detection, and retained scrollback while
  terminal and Composer input remain unavailable behind the loader.
- Added rendered-buffer readiness recognition using the existing bounded Codex
  prompt parser plus provider-branded Claude Code and Grok Build prompt checks.
  Recognized prompts restore fit/focus without background focus theft; a
  15-second stall remains covered until explicit **SHOW TERMINAL**, and an
  early exit reports its code through the same accessible surface.
- Ship manifest — User goal: cover fresh, duplicated, restored, and resumed
  managed agent sessions with a loading page until a rendered interactive
  prompt appears; preserve hidden startup output and shell immediacy; provide
  stalled/manual-reveal, early-exit, accessibility, theme, focus, and cleanup
  behavior; then release v0.75.0.
- Changed files and per-file purpose: `prototype/renderer/renderer.js` owns the
  startup phases, bounded recognizers, timers, input/focus guards, deferred
  Composer restoration, exit/close handling, renderer test seam, and launch
  integration; `prototype/renderer/styles.css` supplies the palette-driven,
  reduced-motion-aware skeleton; `prototype/scripts/test-startup-loader-renderer.js`
  covers providers, shell bypass, background/restore semantics, rendered
  readiness, scrollback retention, the production timeout, strict stalled
  manual reveal, early exit, cleanup, focus, accessibility, and every
  theme/mode; `prototype/scripts/test-full-browser-composer-renderer.js` proves
  a page-created managed Claude session waits for readiness before Composer
  interaction; `prototype/scripts/test-session-rail-renderer.js` proves a
  dedicated Git session retains and opens its unsent review Composer after
  readiness; `prototype/package.json` adds the focused command and sets
  0.75.0; `prototype/package-lock.json` mirrors 0.75.0; `RELEASES.md` documents
  the release; `tasks/todo.md` and this history entry record completion.
- User-goal mapping: only `createSessionNow` opts managed launches into
  `starting`, so fresh/duplicate/restore/resume paths share one lifecycle while
  shells and synthetic fixtures stay immediate. Every clean PTY payload is
  still rendered and detected before a write-completion readiness inspection.
  Codex reuses its structural prompt parser; Claude and Grok require a current
  prompt plus a provider brand within a 120-row tail. The loader marks xterm
  inaccessible and non-focusable, blocks terminal/Composer input, and keeps a
  requested Git/browser Composer pending until reveal. A 15-second transition
  is permanently manual—even if a prompt appears later—and session close
  clears its timer.
- Tests run: changed JavaScript `node --check` and `git diff --check` passed;
  focused startup-loader, synchronized-output, Composer, full-browser
  Composer, themes, restore identity, resume retry, terminal scroll/focus, and
  session-rail suites passed; the complete `npm test` prototype matrix passed
  on the final diff; source `npm run smoke` passed; `npm run package` produced
  the macOS arm64 app; both packaged plist version fields report 0.75.0; and
  the packaged app returned `SMOKE_OK`.
- Skipped tests: no live Claude Code, Codex, or Grok model session was launched,
  because that would require account authentication and billable/external
  model activity. Real xterm fixtures exercise the rendered prompt contracts,
  and intentional future CLI drift falls back to the tested manual reveal
  instead of exposing startup output. Separate screenshot capture was skipped
  because the real Electron renderer test checks the visible loader, opaque
  theme surface, content, accessibility state, and all eight theme/mode
  combinations; no image baseline exists for this surface.
- Adversarial review: performed a failure-oriented changed-file review and
  launch/input/focus/timer/exit/restore scan as the explicit equivalent review
  path because no `quality-sweep` or `expert-review` skill is installed. It
  found and fixed generic test sessions accidentally inheriting production
  loading state, routed Composer remaining callable while starting, and
  dedicated Git review Composer losing its requested open state. It also
  checked split/synchronized writes, prompt-after-timeout behavior, exit/write
  races, inactive readiness, helper textarea tab order, reduced motion, close
  disposal, shell adoption, queued Codex launch release, and create failure
  cleanup. No blocking finding remains.
- Accepted warning and residual risk: Electron Packager again probed for the
  optional `.icon` format before successfully producing and running the
  versioned arm64 bundle. Provider prompt recognition intentionally depends on
  current CLI branding and prompt glyphs within 120 rendered rows. If a future
  CLI changes that contract, the user will see **Still starting** and can use
  **SHOW TERMINAL**; PTY output, lifecycle signals, and scrollback remain
  intact, and the focused fixtures identify which recognizer needs updating.
- Rollback note: revert the v0.75.0 shipping commit, delete tag and GitHub
  Release `chromux-v0.75.0`, and republish v0.74.1 as latest if needed. The
  shipping boundary is exactly the nine source, test, metadata, release, and
  task files named above plus this history entry; the worktree was clean before
  implementation. Deploy skipped: no explicit manual deploy contract exists;
  the GitHub Release is Chromux's required update channel. Next command:
  complete the dashboard-only Vercel OAuth app registration and live preview
  proof tracked in `tasks/todo.md`.

## 2026-07-30 — Terminal startup readiness recovery and v0.76.2

- Made the 15-second agent-startup warning recoverable: live managed sessions
  continue evaluating rendered prompt evidence while stalled and automatically
  reveal once interactivity is proven. Exited sessions remain covered until
  manual reveal.
- Expanded bounded Claude Code and Grok Build branding evidence from 120 to
  1,024 rendered rows, matching the existing Codex prompt scan, without
  connecting startup readiness to turn hooks or changing public interfaces,
  persistence, restore state, focus policy, Composer policy, or lifecycle
  architecture.
- Ship manifest — User goal: repair slow startup so a prompt rendered after
  the warning dismisses the loader, retain the timeout as an escape hatch,
  preserve adjacent startup/turn behavior, and publish v0.76.2.
- Changed files and per-file purpose: `prototype/renderer/renderer.js` widens
  provider evidence and admits live `stalled` readiness checks;
  `prototype/scripts/test-startup-loader-renderer.js` covers current Codex
  0.146 and Claude Code 2.1.214 fixtures, ordinary and post-timeout readiness,
  verbose initialization, exit immunity, manual reveal, focus, timers,
  accessibility, Composer gating, and retained output; package and lock
  metadata set 0.76.2; `RELEASES.md` documents the release; `tasks/todo.md`
  and this entry record completion.
- User-goal mapping: xterm's existing write-completion callback remains the
  only automatic startup readiness trigger. It now accepts `starting` or
  non-exited `stalled`, while provider recognition still requires a current
  prompt plus bounded rendered evidence. `revealed`, exited, dead, shell, and
  unsupported-provider sessions cannot enter the new path. Turn-signal code
  and hooks are unchanged.
- Tests run: the new >120-row regression failed against v0.76.1, then passed
  after implementation. `npm run test:startup-loader-renderer`,
  `npm run test:composer-renderer`, `npm run test:turn-signals-renderer`, and
  `npm run test:synchronized-output-renderer` passed. Changed JavaScript
  `node --check`, package/lock version consistency, and `git diff --check`
  passed. The complete unmodified `npm test` matrix was executed in a
  disposable independent `launchd` coalition because macOS 26.5.2 otherwise
  assigned nested test Electron processes to the running production Chromux
  coalition and aborted in LaunchServices before JavaScript startup. Every
  matrix script passed; the unchanged broad session-rail suite passed in
  isolation after timing failures at unrelated preview, Git refresh, mirror,
  animation, and theme checkpoints.
- Skipped tests: no live Claude Code, Codex, or Grok model was invoked because
  provider accounts and billable external work are unnecessary for a rendered
  xterm readiness contract. Current real-Electron fixtures cover the prompt
  forms and loader behavior. No screenshot baseline exists, and no CSS or
  geometry changed; the real renderer assertions directly verify visibility,
  accessibility, focus, and retained terminal content.
- Adversarial review: performed a failure-oriented exact-diff review as the
  repository's explicit equivalent path because no `quality-sweep` or
  `expert-review` skill is installed. It traced prompt/write versus timeout
  ordering, write callbacks after exit, manual-reveal races, close cleanup,
  dead/background sessions, focus theft, Composer restoration, synchronized
  writes, evidence bounds, scan cost, and startup-versus-turn separation. The
  explicit `startup.exited` guard and lifecycle-aware recognizer prevent an
  exited session from recovering; reveal still clears any live timer. No
  blocking finding or scope drift remains.
- Residual risk: provider branding and prompt glyphs can change in future CLI
  releases, and branding beyond 1,024 rendered rows will still require manual
  reveal by design. The fallback preserves PTY output and scrollback. The
  session-rail matrix remains host-load-sensitive, but its shifting failures
  were unrelated to the two-line production diff and it produced a clean
  isolated pass; the four required adjacent suites and all other matrix
  scripts passed without product findings.
- Rollback note: revert the v0.76.2 shipping commit, delete GitHub Release and
  tag `chromux-v0.76.2`, and republish v0.76.1 as latest if needed. The exact
  shipping boundary is the renderer, focused regression, two metadata files,
  release notes, todo record, and this history entry. Deploy skipped: no
  explicit manual deploy contract exists; the GitHub Release is Chromux's
  required update channel. Next command: complete the dashboard-only Vercel
  OAuth app registration and live preview proof tracked in `tasks/todo.md`.

## 2026-07-31 — Background startup readiness on tab activation and v0.76.3

- Rechecked the existing managed-agent rendered-prompt detectors after fitting
  an activated terminal, allowing Codex, Claude Code, and Grok Build tabs that
  became ready offstage to dismiss their startup loader without another PTY
  write. Stale activation callbacks now stop before fitting, revealing, or
  focusing a tab that is no longer active.
- Added a smoke-only direct-render helper and real-Electron cases that reproduce
  prompt output without the normal PTY readiness callback, preserve the active
  shell's focus until a real tab switch, restore terminal accessibility and
  focus after activation, and keep exited sessions covered.
- Ship manifest — User goal: resolve background managed-agent loading on tab
  switch without loosening prompt recognition, revealing failures, changing
  production interfaces, or stealing focus, then publish v0.76.3.
- Changed files and per-file purpose: `prototype/renderer/renderer.js` guards
  stale animation frames and invokes shared startup inspection after the active
  terminal fit; `prototype/scripts/test-startup-loader-renderer.js` covers the
  missed-callback state for all three managed agents plus focus, accessibility,
  rapid-switch, and exit behavior; `prototype/package.json` and
  `prototype/package-lock.json` set 0.76.3; `RELEASES.md` documents the
  release; `tasks/todo.md` records completion; this entry records validation,
  review, residual risk, and rollback.
- User-goal mapping: activation calls only the existing
  `inspectAgentStartupReadiness()` path, whose lifecycle, provider, phase,
  exit, bounded evidence, and prompt detectors remain authoritative. The
  inspection runs only for the session still active at animation-frame time;
  focus remains behind the existing revealed-phase gate.
- Executable verification: the new activation assertion failed against
  v0.76.2 before the production change. The focused
  `npm run test:startup-loader-renderer` passed after implementation and again
  after the race guard. The complete `npm test` matrix passed after the final
  source change, including startup loader, Composer, synchronized output,
  session rail, shell adoption, restore, theme, turn-signal, webview, Vercel,
  resource, and Windows-platform suites. Changed JavaScript `node --check`,
  package/lock version consistency, and `git diff --check` passed.
- Skipped tests: no live agent model was invoked because readiness depends on
  rendered terminal state and the real-Electron fixtures deterministically
  exercise the provider prompts without paid or account-dependent work. No
  screenshot baseline exists, and no CSS or geometry changed.
- Adversarial review: the repository lacks the referenced
  `docs/quality-gate-contract.md`, `quality-sweep`, and `expert-review`, so a
  failure-oriented exact-diff review served as the equivalent gate. It traced
  normal and direct xterm writes, activation ordering, rapid switches, stale
  animation frames, fit timing, active/background focus, Composer focus,
  starting/stalled/revealed phases, timers, exited/dead sessions, shells, and
  test-interface isolation. The review found that an older activation frame
  could otherwise inspect and focus a now-background tab; the active-session
  guard and tightened regression fixed it. No blocking finding remains.
- Residual risk: readiness still intentionally depends on current provider
  branding and prompt glyphs within the existing bounded rendered evidence
  window. Future CLI prompt changes can leave the loader visible, but the
  existing manual reveal retains output and provides a safe fallback.
- Rollback note: revert the v0.76.3 shipping commit, delete GitHub Release and
  tag `chromux-v0.76.3`, and republish v0.76.2 as latest if needed. The exact
  shipping boundary is the renderer, startup-loader regression, two metadata
  files, release notes, todo record, and this history entry. Deploy skipped:
  no explicit manual deploy contract exists; the GitHub Release is Chromux's
  required update channel. Next command: complete the dashboard-only Vercel
  OAuth app registration and live preview proof tracked in `tasks/todo.md`.

## 2026-07-31 — Codex 0.146 startup readiness detection and v0.76.4

- Extended the existing bounded Codex prompt-chrome matcher to recognize the
  current `Context N% left` footer while retaining shortcut, legacy context,
  chooser, frame, lifecycle, phase, current-prompt, and exit requirements.
  Normal PTY-write inspection, active-tab inspection, stalled recovery, and
  `readCodexRenderedPrompt()` remain the authoritative unchanged paths.
- Replaced simplified startup and Composer fixtures with a Codex 0.146-shaped
  xterm screen containing the `›` prompt, placeholder, percentage footer, and
  ANSI cursor movement back to the prompt. Coverage proves normal reveal,
  missed-callback background coverage, activation reveal, post-warning
  recovery, activation-only focus/accessibility restoration, rejection of a
  percentage footer without a current prompt, and exited-session coverage.
- Ship manifest — User goal: repair Codex 0.146 startup readiness without
  polling, raw-output matching, generic prompt detection, unconditional tab
  reveal, or changes to focus, timeout, persistence, IPC, and lifecycle policy;
  publish v0.76.4.
- Changed files and per-file purpose: `prototype/renderer/renderer.js` admits a
  bounded 0–100 percentage between the existing context and left tokens;
  `prototype/scripts/test-startup-loader-renderer.js` exercises PTY callback,
  offstage activation, stalled, focus/accessibility, false-positive, and exit
  behavior with the current screen; `prototype/scripts/test-composer-renderer.js`
  proves the shared parser resolves that screen instead of retaining a stale
  keystroke shadow; `prototype/package.json` and
  `prototype/package-lock.json` set 0.76.4; `RELEASES.md` documents the release;
  `tasks/todo.md` records completion; this entry records validation, review,
  residual risk, rollback, and next work.
- User-goal mapping: the only production source change is the prompt-chrome
  regular expression used by `readCodexRenderedPrompt()`. The existing `›`
  search, bounded rendered-buffer scan, prompt placeholder handling, frame
  handling, lifecycle guard, starting/stalled phase guard, exited guard,
  active-session animation-frame guard, write callback, timer, manual fallback,
  focus, accessibility, and Composer paths are unchanged.
- Executable verification: the new startup-loader assertion first failed with
  the Codex session still `starting`, and the new Composer assertion first
  failed by retaining its stale shadow against v0.76.3. After the matcher
  correction, `npm run test:startup-loader-renderer` and
  `npm run test:composer-renderer` passed. The complete `npm test` matrix passed
  on the final source and metadata diff, including every renderer, service,
  activity/sidebar lab, resource, restore, shell-adoption, provider, Vercel,
  webview, storage, Windows platform/setup/artifact/signing, and startup suite.
  Changed JavaScript `node --check`, package/lock 0.76.4 consistency,
  `git diff --check`, and the exact-diff inspection passed without warnings.
- Skipped tests: no live Codex model was launched because readiness is a
  deterministic rendered-xterm contract and live execution would add external
  authentication and model activity without improving detector coverage. No
  screenshot baseline exists, and no CSS, geometry, or visible copy changed;
  real-Electron assertions directly verify loader visibility, terminal
  accessibility, focus, and retained screen content.
- Adversarial review: performed a failure-oriented exact-diff and call-site
  review as the equivalent gate because this repository has no
  `docs/quality-gate-contract.md`, `quality-sweep`, or `expert-review`. It
  checked absent/current prompts, 0–100 bounds, legacy `context left`,
  shortcut and framed prompts, prompt/footer cursor ordering, offstage writes,
  activation races, starting/stalled/revealed phases, exited/dead sessions,
  active/background focus, accessibility, timers, Composer extraction, Claude
  Code and Grok Build isolation, and accidental polling/raw-output/API changes.
  No blocking finding or scope drift remains.
- Residual risk: future Codex versions may change the prompt glyph or footer
  wording again. Such screens remain safely covered behind the existing
  **SHOW TERMINAL** fallback with PTY output and scrollback intact. The matcher
  intentionally rejects percentages above 100 and requires an existing
  current prompt within the bounded rendered region.
- Rollback note: revert the v0.76.4 shipping commit, delete GitHub Release and
  tag `chromux-v0.76.4`, and republish v0.76.3 as latest if needed. The exact
  shipping boundary is the renderer, two renderer regressions, two metadata
  files, release notes, todo record, and this history entry. Deploy skipped: no
  explicit manual deploy contract exists; the GitHub Release is Chromux's
  required update channel. Next command: complete the dashboard-only Vercel
  OAuth app registration and live preview proof tracked in `tasks/todo.md`.

## 2026-08-02 — Threads session context menu and v0.77.0

- Reused the established session-tab context menu for Threads sidebar session
  rows. A right-click suppresses the native menu, cancels pending previews,
  dismisses an open preview, activates an inactive target, and opens duplicate,
  cross-agent, group, and close actions at the pointer.
- Added a real-Electron regression that right-clicks an inactive Threads row,
  verifies target activation and action parity, and proves outside-click
  dismissal.
- Ship manifest — User goal: add a context menu on right-click of sessions in
  the Threads sidebar and publish the required feature release.
- Changed files and per-file purpose: `prototype/renderer/renderer.js` attaches
  the row context-menu interaction; `prototype/scripts/test-session-rail-renderer.js`
  covers the production DOM event and resulting menu; `prototype/package.json`
  and `prototype/package-lock.json` set 0.77.0; `RELEASES.md` documents the
  release; `tasks/todo.md` records completion; this entry records validation,
  review, residual risk, rollback, and next work.
- User-goal mapping: Threads rows invoke the same `openSessionContextMenu()`
  path as session tabs, so both surfaces expose one canonical action set and
  existing group/Grok advisory behavior. Activation happens before menu
  creation so actions always apply to the visible active target.
- Executable verification: changed JavaScript passed `node --check`.
  `npm run test:session-rail-renderer` passed the new real-Electron behavior;
  `npm run test:session-tab-groups-renderer` passed existing group-picker
  behavior; and `node scripts/test-themes-renderer.js` passed the established
  context-menu theme matrix. All three suites and both syntax checks also
  passed from a clean temporary clone with only the exact staged release diff
  applied, proving the excluded hotkey-training work is not required.
  Package/lock 0.77.0 consistency and `git diff --check` passed. One corrected
  rail run transiently failed to exit; an immediate clean rerun completed in
  13 seconds with `SESSION_RAIL_RENDERER_OK`.
- Skipped tests: the complete prototype matrix was not repeated because this is
  a localized renderer event binding with direct real-Electron coverage plus
  both adjacent menu suites. No CSS, IPC, persistence schema, native module,
  service, Windows-specific path, or packaging behavior changed.
- Adversarial review: the repository lacks the referenced
  `docs/quality-gate-contract.md`, `quality-sweep`, and `expert-review`, so a
  failure-oriented exact-diff and event-order review served as the equivalent
  gate. It checked active/inactive targets, native menu suppression, preview
  timers, attention and ordinary row construction, activation-driven rerender,
  pointer coordinates, menu dismissal, shared action parity, and accidental
  interaction with tab or group menus. No blocking finding remains.
- Residual risk: the shared custom menu retains its existing mouse-first
  keyboard behavior; this change neither improves nor regresses that behavior.
  Concurrent local hotkey-training work in the worktree is explicitly excluded
  from this release commit and tag.
- Rollback note: revert the v0.77.0 shipping commit, delete GitHub Release and
  tag `chromux-v0.77.0`, and republish v0.76.4 as latest if needed. The exact
  shipping boundary is the one renderer hunk, rail regression, two metadata
  files, release notes, todo record, and this history entry. Deploy skipped: no
  explicit manual deploy contract exists; the GitHub Release is Chromux's
  required update channel. Next command: complete the dashboard-only Vercel
  OAuth app registration and live preview proof tracked in `tasks/todo.md`.

## 2026-08-02 — Hotkey Training Grounds and v0.78.0

- Added a Settings-launched, full-window Hotkey Training Grounds with four
  fixture-backed missions for recovery, direct session switching, attention
  focus, paired-browser layouts, Composer, project creation, and guarded exit.
  Missions include contextual hints, explicit shortcut reveal, elapsed timing,
  replay, mistake tracking, one-to-three-star mastery, and confirmed progress
  reset.
- Routed physical host and renderer shortcut input through the production
  parser while training is active, forwarding only bounded action IDs, session
  indexes, timestamps, and Escape into the simulation. Main-process
  authorization, navigation/window cleanup, renderer guards, and the
  full-window modal keep live sessions, queues, browsers, projects, Composer,
  and lifecycle actions unchanged. A final review added keyboard focus
  containment to match the arena's modal semantics.
- Ship manifest — User goal: complete and publish the isolated Hotkey Training
  Grounds feature as v0.78.0.
- Changed files and per-file purpose: `prototype/hotkey-training.js` defines
  the immutable mission engine, scoring, bounded schema-v1 progress, and
  platform chord labels; `prototype/main.js` and `prototype/preload.js` provide
  the authorized training input bridge; `prototype/shortcut-input.js` aligns
  production macOS labels with the displayed Command symbol;
  `prototype/renderer/index.html`, `prototype/renderer/renderer.js`, and
  `prototype/renderer/styles.css` implement the Settings entry, simulated
  arena, progress UI, screen-reader feedback, reduced motion, focus containment,
  and live-state isolation; the three changed/new test scripts cover parser,
  engine, physical input, safety, persistence, focus, exit, and routing;
  `prototype/README.md` and `prototype/docs/privacy-and-local-data.md` document
  usage and local retention; package metadata sets 0.78.0 and exposes the
  focused test command; `RELEASES.md` documents the release; `tasks/todo.md`
  records completion; this entry records the release gate and rollback.
- User-goal mapping: all mission steps use action IDs returned by the same
  production shortcut parser as normal Chromux operation. Training state is
  renderer-local, fixture rendering uses static synthetic content, and every
  live mutation handler returns early while the main process captures physical
  shortcuts for the arena. Exiting disables interception before restoring
  Settings focus.
- Executable verification: every changed/new JavaScript file passed
  `node --check`; `npm run test:hotkey-training` passed deterministic engine
  and real-Electron physical-input/isolation/focus coverage; and
  `node scripts/test-shortcuts-renderer.js` passed production parser coverage.
  The complete `npm test` matrix then passed all activity/sidebar labs,
  renderer, shortcut/webview, session, theme, startup, capture/resource,
  storage, Vercel, and Windows platform/setup/artifact/signing suites.
  Package/lock 0.78.0 consistency and `git diff --check` passed.
- Validation warning: the existing Streak attention click-target test missed a
  native hover boundary on its first matrix attempt, then passed on the
  runner's built-in retry. The changed feature does not touch that geometry or
  pointer path; no unresolved test failure remains.
- Skipped tests: no live agent/model turn, external account, or network UAT was
  run because the product contract is deliberately synthetic and the
  real-Electron suite drives physical host input while proving exact live-state
  isolation. No separate screenshot baseline exists; the complete theme matrix
  and renderer geometry/accessibility assertions cover the shipped UI.
- Adversarial review: the repository lacks the referenced
  `docs/quality-gate-contract.md`, `quality-sweep`, and `expert-review`, so a
  failure-oriented exact-diff and event-order review served as the equivalent
  gate. It checked unauthorized/stale IPC state, navigation and window cleanup,
  host/renderer/webview input duplication, ordinary typing, modifier-only
  input, wrong recognized shortcuts, Escape at each arena phase, live handler
  suppression, queue/layout/session invariants, malformed and oversized local
  progress, per-step hints, replay scoring, reduced motion, screen-reader
  announcements, modal focus escape, reset scope, and normal routing after
  exit. The modal focus leak found during review was fixed and regressed.
- Residual risk: synthetic fixtures intentionally demonstrate Chromux workflow
  state rather than exercising provider CLIs or real browser navigation.
  Future shortcut additions require adding the matching bounded mission label
  only when a mission adopts that action.
- Rollback note: revert the v0.78.0 shipping commit, delete GitHub Release and
  tag `chromux-v0.78.0`, and republish v0.77.0 as latest if needed. Deploy
  skipped: no explicit manual deploy contract exists; the GitHub Release is
  Chromux's required update channel. Next command: complete the dashboard-only
  Vercel OAuth app registration and live preview proof tracked in
  `tasks/todo.md`.

## 2026-08-02 — macOS Dock attention badge v0.79.0 candidate

- Added a macOS Dock badge derived from the visible post-filtering,
  post-grouping Threads count. Multiple reasons in one session count once;
  system rows and separate sessions count independently; open, resolve,
  dismiss, Done, Snooze, and zero-clear transitions stay aligned with Threads.
- Made completion consumption window-focus-aware across OSC signals, Codex
  title and rendered-prompt recovery, restored attention, session activation,
  and diagnostics. Bringing Chromux forward consumes only the completion in
  the currently visible selected session.
- Ship manifest — User goal: implement and ship macOS Dock attention badges as
  v0.79.0 through macOS and protected signed-Windows verification.
- Changed files and per-file purpose: `prototype/main.js` validates active
  renderer badge IPC and calls Electron only on macOS; `prototype/preload.js`
  exposes the narrow count API; renderer HTML/JS add focus-aware projection,
  grouped badge synchronization, deduplication, and Settings status/guidance;
  `prototype/scripts/test-dock-badge-renderer.js` covers source, packaged, and
  installed Electron behavior plus platform/rejection seams;
  `prototype/docs/privacy-and-local-data.md` documents aggregate-only local
  data handling; package metadata and `RELEASES.md` define v0.79.0; task files
  record the active release gate and this manifest.
- User-goal mapping: the Dock count is computed only after inbox visibility and
  session grouping, then sent as a nonnegative safe integer. The main process
  accepts calls only from the current Chromux renderer. Rejection produces
  non-blocking System Settings guidance without requesting permission.
- Executable verification: new real-Electron source coverage passed; focused
  turn-signal, session-rail, preview-queue, update-queue, and attention
  diagnostics suites passed; the complete `npm test` matrix passed every
  renderer/service/platform/artifact/signing suite; changed JavaScript passed
  `node --check`; `git diff --check` passed. The arm64 package and installed
  `/Applications/Chromux.app` both report 0.79.0, and the packaged and installed
  executables passed the full Dock-badge suite, including isolated relaunch,
  increments, decrements, clearing, rejection, and unsupported-platform paths.
- Accepted warnings: electron-packager emitted its existing icon-format warning
  and retained `electron.icns`; the app launches and badge coverage passes.
  The existing Streak native pointer-boundary test missed an exact hover target
  once in the full matrix and passed its built-in retry, then missed a different
  exact boundary in a standalone run. This change does not touch pointer
  geometry or Streak styles; no badge/focus executable check failed.
- Adversarial review: the repository lacks the referenced
  `docs/quality-gate-contract.md`, `quality-sweep`, and `expert-review`, so a
  failure-oriented exact-diff review served as the equivalent gate. It checked
  unauthorized and invalid IPC, test-only platform seams, async response
  ordering, unchanged-count suppression, zero clearing, startup and blur/focus
  order, active/background title and fallback completion, restored records,
  grouped reasons, system rows, Done/Snooze expiry, Settings visibility, and
  absence of content-bearing IPC. No blocking source finding remains.
- Skipped tests and residual risk: no manual eyeball inspection of the Dock
  artwork was archived; Electron's successful installed-app return values and
  count traces are the executable proof. The protected Windows release could
  not be dispatched: every published Chromux release, including v0.78.0, has
  zero assets and there are no prior `windows-release.yml` runs, so the required
  prior signed `Setup.exe` upgrade-UAT URL does not exist. Fabricating a release
  URL would make the real-machine gate fail without testing an upgrade.
- Shipping status: candidate commit `b9ac0f7` is pushed to `main`, and annotated
  tag `chromux-v0.79.0` is pushed. GitHub exposes only `Preview` and `Production`
  environments, no self-hosted Windows runners, no prior signed-Windows runs,
  and no release assets at any version. The protected workflow was not
  dispatched with a fabricated installer URL; `/releases/latest` correctly
  remains the asset-free v0.78.0 release until the prerequisites are supplied.
- Rollback note: before publication, revert the v0.79.0 candidate commit and
  remove tag `chromux-v0.79.0` if necessary. After publication, also remove the
  matching GitHub Release and restore v0.78.0 as latest. Deploy skipped: no
  explicit manual deploy contract exists; the protected GitHub workflow is the
  required release path. Next command: supply or publish a signed v0.78.0
  installer URL, then dispatch `windows-release.yml` for `chromux-v0.79.0`.

## 2026-08-02 — Action Required card context and overflow fix v0.79.1

- Added a compact context header to session-scoped Action Required cards with
  the live session display name, agent label, project/folder basename, full cwd
  tooltip, and matching accessible context. Each grouped reason now keeps its
  action type beside the existing detail.
- Reflowed reason actions into a full-width two-column grid. Four-action
  historical reasons form two rows, long primary labels wrap within their
  cell, and all buttons remain inside the default 232px rail and Streak's 248px
  rail without changing click, dismiss, Done, Snooze, preview, or grouping
  behavior.
- Ship manifest — User goal: fix missing Action Required card context and
  narrow-rail action overflow, preserve behavior, add bounding regressions, and
  ship the next patch release.
- Changed files and per-file purpose: `prototype/renderer/renderer.js` builds
  and synchronizes session/agent/project context and keeps every reason type
  visible; `prototype/renderer/styles.css` defines compact context and bounded
  two-column action geometry; the session-rail renderer test adds long-label,
  multi-reason, four-action, keyboard, default-width, Streak-width, and long
  primary-action assertions; package metadata and `RELEASES.md` define
  v0.79.1; task files record completion and this manifest.
- User-goal mapping: presentation-only renderer changes supply the omitted
  identity, keep reason copy and full-path tooltips, and change only card
  geometry. Attention objects, persistence, IPC, public APIs, action order,
  action handlers, multi-reason ranking, and triage semantics are unchanged.
- Executable verification: the focused session-rail, theme, and Streak click
  target suites passed; changed JavaScript passed `node --check`; the complete
  `npm test` matrix passed all renderer, service, platform, packaging, and
  signing-configuration suites; `git diff --check` passed.
- Adversarial review: checked both session-card render paths, live title and
  agent synchronization, folder/path disambiguation, accessible status,
  completion label semantics, all four action bounds, long action wrapping,
  default and Streak widths, multiple reasons, keyboard opening, and unchanged
  handler wiring. The review removed an unintended ordinary-row tooltip/ARIA
  change and dead header CSS; no blocking finding remains.
- Skipped tests and residual risk: no manual screenshot archive or packaged-app
  smoke was required for this renderer-only patch because real-Electron layout
  assertions exercise Chromium's computed geometry in every theme/mode and the
  complete suite covers packaging contracts. Extremely narrow user-injected
  CSS or future translations could require another responsive breakpoint.
- Rollback note: revert the v0.79.1 shipping commit, delete GitHub Release and
  tag `chromux-v0.79.1`, and restore v0.78.0 as latest if necessary. Deploy
  skipped: no explicit manual deploy contract exists; the GitHub Release is
  Chromux's required update channel. Next command: supply the signed Windows
  installer and protected runner prerequisites tracked in `tasks/todo.md`.

## 2026-08-02 — Focus-safe automated Electron windows v0.79.2

- Replaced the Boolean background-E2E decision with normal, hidden, and
  inactive modes. Scripted windows are always created hidden; only the native
  Streak pointer-boundary test requests `showInactive()` immediately before its
  script, and its real mouse hover/click assertions now prove the document
  never gains focus.
- Kept Activity Lab smoke windows hidden while preserving normal manual lab
  visibility. Removed three Linux-only ordinary-test visibility overrides and
  added a regression that rejects future ordinary tests using the visible-E2E
  escape hatch.
- Ship manifest — User goal: prevent automated Chromux tests from stealing
  focus while preserving native pointer-boundary coverage and production,
  manual-smoke, Activity Lab, and Sidebar Lab behavior.
- Changed files and per-file purpose: `prototype/main.js` owns the three-mode
  policy and non-activating presentation timing; Activity Lab main/renderer and
  smoke test prove native hidden state and renderer focus; the Streak test
  proves focus safety around real host input; composer, session-rail, and
  terminal-scroll tests remove ordinary visibility overrides; the window
  configuration regression enforces modes, timing, Activity Lab policy, and
  the sole visible-test allowlist; package metadata, `RELEASES.md`, and task
  files define and record v0.79.2.
- User-goal mapping: production and manual smoke resolve to normal visibility;
  ordinary E2E resolves to hidden; the explicit native pointer mode starts
  hidden and calls only `showInactive()` immediately before execution. No
  public API, production IPC, renderer behavior, or Sidebar Lab path changed.
- Executable verification: window configuration, Activity Lab, native Streak,
  composer, session-rail, and terminal-scroll focused suites passed; changed
  JavaScript passed `node --check`; the final complete `npm test` matrix passed
  every renderer, Electron, service, platform, packaging, and signing-policy
  check; `git diff --check` passed.
- Adversarial review: the referenced `docs/quality-gate-contract.md`,
  `quality-sweep`, and `expert-review` are absent, so an exact-diff and launcher
  inventory served as the equivalent gate. It checked hidden-at-creation
  semantics, `showInactive()` ordering, focus before and after native clicks,
  manual/production fallbacks, authoritative Activity Lab visibility, hidden
  Chromium painting, ordinary-test opt-ins, the already-headless Sidebar Lab,
  and production API/IPC isolation. No blocking finding remains.
- Skipped tests and residual risk: no manual focus-stealing observation was
  archived because real-Electron focus and `BrowserWindow.isVisible()`
  assertions directly exercise the required state. The removed Linux-only
  overrides passed on macOS and are statically enforced, but Linux rendering
  remains dependent on Electron's `paintWhenInitiallyHidden` behavior covered
  by the window contract and should remain part of cross-platform CI.
- Release-version note: the supplied plan named v0.79.1, but that tag and
  GitHub Release were already public before implementation. The fix advanced
  to the next safe patch, v0.79.2, instead of rewriting a published release.
- Rollback note: revert the v0.79.2 shipping commit and remove its GitHub
  Release and tag if necessary; v0.79.1 then becomes latest again. Deploy
  skipped: no explicit manual deploy contract exists; the GitHub Release is
  Chromux's required update channel. Next command: continue the blocked signed
  Windows release prerequisite work tracked in `tasks/todo.md`.

## 2026-08-04 — Persistent Settings update status v0.81.0

- Moved the update status from the scrollable Settings body into a fixed,
  accessible footer row above the existing actions. Version details, release
  URL, and install/check diagnostics remain in the body.
- Manual checks now immediately show neutral “Checking for updates…” feedback
  and disable the check action until the unchanged update-check IPC completes.
  Existing current, available, queued, blocked, installing, and failure
  projection and install behavior remain intact.
- Ship manifest — User goal: keep Chromux update results visible without
  scrolling, add immediate check feedback, preserve updater behavior, support
  narrow layouts, and publish v0.81.0.
- Changed files and per-file purpose: `prototype/renderer/index.html` moves
  the live status and groups footer actions; `prototype/renderer/styles.css`
  supplies settings-only two-row, wrapping, responsive geometry;
  `prototype/renderer/renderer.js` supplies synchronous manual-check feedback;
  the update-queue renderer test covers placement, accessibility, update
  phases, long copy, narrow geometry, and disabled/checking state; package
  metadata and `RELEASES.md` define v0.81.0; task files record completion and
  this manifest.
- User-goal mapping: only presentation and manual-check feedback changed.
  Updater APIs, persisted state, update queues, managed-install decisions,
  lifecycle protection, restore snapshots, release links, and diagnostic
  output are unchanged.
- Executable verification: focused update-queue, GitHub update-check, and
  theme renderer suites passed; the complete `npm test` matrix passed all
  renderer, Electron, service, platform, packaging, and signing-configuration
  tests; `git diff --check` passed. The full suite's first
  `test-browser-collapse-renderer.js` attempt hit an unrelated WebView
  readiness race and passed on its built-in retry.
- Visual verification: isolated real-Electron captures with the Settings body
  at both its top and bottom confirmed the status and actions remain fixed,
  separated, fully visible, and unclipped.
- Adversarial review: inspected the exact diff for scroll containment,
  settings-only selector scope, theme inheritance, live-region semantics,
  neutral-to-result class transitions, hidden install actions, long unbroken
  copy, narrow action wrapping, and unchanged check/install wiring. No
  blocking finding remains.
- Skipped tests and residual risk: no packaged-app build was run because the
  change is renderer-only and real-Electron source tests and screenshots
  exercised Chromium layout directly. Future localization could create longer
  action labels that need another breakpoint, although the action row already
  wraps.
- Rollback note: revert the v0.81.0 shipping commit and remove its GitHub
  Release and tag if necessary; v0.80.2 then becomes latest again. Deploy
  skipped: no explicit manual deploy contract exists; the GitHub Release is
  Chromux's required update channel. Next command: continue the blocked signed
  Windows release prerequisite work tracked in `tasks/todo.md`.

## 2026-08-05 — Chromux Next runner-first interface v0.2.0

- Replaced the successor's document-first shell with grouped Codex sessions,
  a display-only searchable xterm transcript, fixed session composer,
  same-turn steering, interruption, structured approvals/questions, model and
  permission selection, custom groups, restoration, and secondary Alignment,
  Deck, Canvas, and Browser surfaces.
- Added a main-process Codex CLI 0.146.0+ app-server facade with validated and
  bounded JSONL, request correlation, compatibility probing, bounded restart,
  thread resume/unsubscribe, exact session/request approval routing, and
  workspace/read-only policies. Added isolated atomic state and fixed a
  concurrent write race exposed by manager tests.
- Added deterministic blockers plus bounded, redacted, source-validated
  `gpt-5.6-luna` recommendations with read-only Git context, cadence limits,
  last-good retention, snoozing, and evidence-fingerprint dismissal.
- Ship manifest — User goal: make Codex sessions the primary Chromux Next
  experience, add contextual Luna attention, preserve strict renderer/process
  boundaries, restore state without new turns, and publish v0.2.0 as a
  prerelease while legacy Chromux remains unchanged.
- Changed files and per-file purpose: `chromux-next/src/runner/` defines
  runtime contracts, protocol, lifecycle, normalization, persistence inputs,
  and analyzer behavior; main/preload/IPC files expose the narrow validated
  bridge; renderer/style files provide the runner-first interface; local store
  serializes atomic writes; package metadata adds xterm and v0.2.0; the
  compatibility fixture pins the 0.146.0 facade; focused tests cover contracts,
  attention, manager security, and renderer isolation; README, architecture,
  UAT, release notes, and task files document the shipped behavior.
- User-goal mapping: Codex remains authoritative for history; Chromux stores
  only bounded successor metadata/cache. Raw envelopes and process spawning
  stay in main. Composer submissions select start versus steer from active
  turn state. Hard blockers are immediate/non-dismissible, while Luna triage
  is fingerprint-sensitive. The legacy package/version/release line is
  untouched.
- Executable verification: `npm run verify` passed TypeScript, 10 Vitest files
  with 32 tests, Electron Forge production packaging, and packaged preload
  smoke. `git diff --check` passed. A real packaged Electron visual pass
  confirmed the runner layout and live Luna refresh; it found and led to a fix
  for the packaged relative mark path before the final verification.
- Adversarial review: checked request correlation registration before writes,
  1 MiB protocol bounds, 64 KiB drafts/events, 128 KiB snapshots, credential
  redaction, absolute canonical project paths, selected-project writable roots
  with network disabled, cross-session request spoof rejection,
  unoffered-decision rejection, question-specific cancellation,
  unknown-request fail-closed behavior, xterm stdin isolation, explicit
  HTTP(S) links, crash restoration, concurrent atomic persistence, stale
  source rejection, and immutable legacy state. No blocking finding remains.
- Skipped tests and residual risk: no real destructive approval was accepted
  during UAT, and no Windows/Linux package was built in this macOS session.
  The protocol fixture and fakes cover approval and failure variants, but
  future Codex app-server schema changes still require updating the facade.
  Luna quality varies by model output; deterministic blockers remain
  independent and last-good analysis is preserved.
- Rollback note: remove GitHub prerelease and tag `chromux-next-v0.2.0`, then
  revert the runner-first commit. The independent v0.1.1 successor and stable
  legacy Chromux release remain available. Deploy skipped: no explicit manual
  deploy contract exists; the GitHub prerelease is the required publication.
  Next command: begin the seven-day builder daily-driver record tracked in
  `tasks/record-todo.md`.

## 2026-08-05 — Chromux Next structured Alignment v0.4.0

- Restored Alignment as a complete persistent secondary workspace with
  canonical open/save/Save As, every schema-v1 semantic editor, stable item
  selection and ordering, document and human-review status, live Deck/Canvas
  projections, and session-local inverse-batch Undo.
- Moved mutation authority fully into the main process: the renderer sends only
  path plus batch; the document store serializes by canonical path, rereads
  disk, validates document and revision, applies transactionally, atomically
  persists, and returns the updated document and validated inverse.
- Restored dedicated bounded fake/Codex document contribution with immutable
  snapshots, selected-item context, cancellation, response links, explicit
  Apply/Reject, and preserved-but-disabled stale proposals. Unified the five
  presentation approaches around one mounted workspace so runner terminal,
  Composer, drafts, pending interactions, viewport, and secondary surfaces
  survive switching.
- Ship manifest — User goal: restore structured Alignment editing in Chromux
  Next without weakening the canonical mutation/contributor contracts or
  disturbing live runner state, then publish v0.4.0 as an experimental
  prerelease while keeping the legacy stable update channel unchanged.
- Changed files and per-file purpose: `src/alignment/editor-model.ts` owns
  editor mappings, defaults, reviews, batches, tables, and staleness;
  domain/persistence/IPC/preload/main files implement the authoritative
  serialized mutation boundary and inverse result; renderer/styles implement
  the application-level editor, projections, contributors, mounted surfaces,
  accessibility, and responsive layouts; provider prompt includes selected
  context; tests cover every kind, reviews, mutations, inverse restoration,
  malformed/stale/external/concurrent disk state, and interface contracts;
  package metadata, README, architecture, UAT, release notes, and task records
  define and record v0.4.0.
- User-goal mapping: a cancelled first-edit Save As performs no mutation;
  accepted batches increment exactly once; Undo is another canonical revision;
  external conflicts reload the latest valid file and clear Undo; stale
  proposals remain inspectable but cannot Apply; agent runs never reuse runner
  threads; inactive surfaces use mounted hidden containers; only
  `chromux-next/package.json` and its lockfile changed version metadata.
- Executable verification: `npm run verify` passed TypeScript, all 13 Vitest
  files with 52 tests, Electron Forge arm64 packaging, and packaged smoke.
  `npm run visual:packaged -- /tmp/chromux-next-visual-0.4.0-recheck` captured
  all five approaches at standard and narrow sizes. Visual inspection found an
  initial narrow contributor overlay; the responsive layout was corrected,
  rebuilt, and all ten views requalified.
- Adversarial review: checked renderer-supplied document removal from mutation
  IPC, disk reread before every batch, per-path concurrency serialization,
  atomic replacement, document/revision mismatch rejection, stable IDs,
  inverse ordering and view restoration, unsaved cancellation, conflict reload
  and Undo clearing, stale proposal blocking, bounded events/results, Codex
  read-only/ephemeral/schema flags, explicit links, review metadata clearing,
  mounted workspace identity, hidden-surface focus behavior, and standard/
  narrow clipping. No blocking finding remains.
- Skipped tests and residual risk: optional live Codex contribution and manual
  native file-dialog UAT were not automated because they depend on local
  authentication and interactive user path choices; fake-provider,
  schema/provider, persistence, packaged smoke, and visual qualifications cover
  the deterministic contracts. Windows/Linux packages remain part of the
  separate successor cutover gate, not this macOS prerelease.
- Rollback note: remove GitHub prerelease and tag `chromux-next-v0.4.0`, then
  revert the v0.4.0 shipping commit. The v0.3.0 successor prerelease and legacy
  stable Chromux release remain available. Deploy skipped: no explicit manual
  deploy contract exists; GitHub prerelease publication is the requested
  release action. Next command: continue the runner-first hardening matrix in
  `tasks/todo.md`.

## 2026-08-06 — Chromux Next production UI polish v0.6.0

- Reworked all five Chromux Next approaches into one calm premium-dark
  graphite/sage visual system while preserving their distinct arrangements,
  runner actions, persistent workspace, Alignment editing, preferences, and
  successor-only trust boundaries.
- Ship manifest — User goal: implement the supplied v0.6.0 production polish
  plan completely, verify it in the packaged app, and publish the experimental
  prerelease without changing legacy Chromux or `/releases/latest`.
- Changed files and per-file purpose: `src/ui/components.tsx` adds Button,
  IconButton, Tabs, Field, Badge, EmptyState, Dialog, Toolbar, and Panel;
  `src/styles/{tokens,components,layouts,legacy}.css` separates semantic
  foundations, reusable states, layout arrangements, and workflow styling;
  `src/styles.css` is the import boundary; `src/renderer.tsx` adds Lucide
  controls, unified header/session navigation, group and session dialogs,
  adaptive runner/Alignment/onboarding states, and focus restoration;
  `src/main.ts` and `scripts/visual-qualify.mjs` expand packaged qualification
  to 20 views; package/lock and runner protocol metadata advance to 0.6.0;
  interface/protocol tests enforce the new structure and version; README, UAT,
  release notes, and task records document the release.
- User-goal mapping: surface switching now lives in one global header; group
  creation lives in contextual session navigation; prompt, emoji, arrow, and
  raw close-glyph controls are absent; icon-only controls expose names and
  tooltips; dialogs trap focus, handle Escape where dismissal is valid, and
  restore focus; narrow modal fields stack; comfortable/compact and
  system/full/reduced preferences retain their schema; five approaches still
  share one mounted workspace and unchanged runner/document IPC.
- Executable verification: `npm run typecheck` passed; all 16 Vitest files and
  85 tests passed; Electron Forge packaged the macOS arm64 app; baseline
  packaged smoke passed; two-launch/two-session restoration smoke passed; and
  packaged visual qualification captured 20 views. Representative onboarding,
  New Session, Settings, Control Room, and Mission Board standard/narrow
  captures were visually inspected after the final build. `git diff --check`
  passed. `npm audit --omit=dev` reported zero production vulnerabilities.
- Adversarial review: checked for prompt/glyph regression, nested action
  controls, inaccessible icon-only actions, modal focus escape and restoration,
  nondismissible onboarding behavior, reduced-motion overrides, narrow modal
  stacking, header and toolbar clipping, persistent-workspace identity,
  retained runner IPC action strings, all five semantic board/tree
  equivalents, version consistency, exact capture count, and preservation of
  legacy release metadata. No blocking finding remains.
- Warnings and residual risk: the existing development packaging dependency
  tree still reports npm audit findings when dev dependencies are included;
  production dependencies report zero findings, and applying breaking
  toolchain upgrades is outside this renderer-only release. Windows/Linux
  packaging, real signed distribution, manual native folder/file dialogs, and
  live authenticated Codex contribution remain part of the separate cutover
  gate; deterministic tests and macOS packaged runs cover this prerelease.
- Rollback note: remove GitHub prerelease and tag `chromux-next-v0.6.0`, then
  revert the v0.6.0 shipping commit. Chromux Next v0.5.0 and the stable legacy
  Chromux release remain available. Deploy skipped: no explicit manual deploy
  contract exists; the GitHub prerelease is the required publication. Next
  command: begin the macOS daily-driver and clean-install evidence tracked by
  the Chromux Next cutover gate in `tasks/todo.md`.

## 2026-08-06 — Chromux Next detect-first onboarding v0.7.0

- Made DETECT the first Chromux Next experience and retained it permanently in
  the product header, with scanning, populated, empty, denied-title, failure,
  searchable, and two-stage configuration states plus Choose Folder and
  Continue Without Session fallbacks.
- Ship manifest — User goal: implement the supplied Chromux Next Detect-First
  Onboarding plan completely, verify the packaged macOS app, and publish
  `chromux-next-v0.7.0` as a prerelease without changing legacy Chromux or the
  stable `/releases/latest` channel.
- Changed files and per-file purpose: `src/detection/{contracts,external}.ts`
  define strict public payloads, opaque creation input, bounded macOS process/
  cwd/title discovery, sanitization, ancestry exclusion, deduplication, and
  transient cache authority; runner manager/store changes provide exact-cwd
  app-server enrichment, bounded nested agent previews, already-open matching,
  and atomic detected project/session persistence; IPC/preload/main changes
  validate and route opaque IDs, broadcast preferences, and add deterministic
  visual fixtures; renderer/styles add detect-first onboarding and permanent
  access; tests cover parser, bounds, denial, expiry, enrichment, spoof
  prevention, transactions, and interface contracts; package/protocol
  metadata, README, architecture, UAT, release notes, and task records define
  v0.7.0; the visual harness now requires 26 captures. Test-only subprocess
  deadlines were widened to tolerate observed Node startup latency while
  retaining bounded timeout and cleanup assertions.
- User-goal mapping: detection uses capped `ps`, concurrent capped `lsof`, and
  optional Terminal/iTerm Automation metadata without controlling external
  processes; exact-directory Codex rows use `thread/list` and bounded
  `thread/read`; renderer creation cannot supply cwd/thread IDs; two-minute
  main cache entries are actively evicted; resume warns about divergence;
  Focus Existing avoids duplicate open threads; detected creation starts or
  resumes before atomically committing project and runner state; onboarding
  completes only after success or the explicit empty-workspace fallback.
- Executable verification: `npm run verify` passed TypeScript, all 17 Vitest
  files with 93 tests, Electron Forge macOS arm64 packaging, baseline packaged
  smoke, and two-launch/two-session restoration smoke. `npm run
  visual:packaged -- /tmp/chromux-next-0.7.0-release-visual` captured all 26
  required views. Scanning, populated, denied-title, empty, and configuration
  captures were visually inspected at applicable standard/narrow sizes.
  `git diff --check` and a diff secret-pattern scan passed.
- Skipped tests and residual risk: live Automation consent with real Terminal
  and iTerm tabs and live authenticated Codex thread history were not
  automated because they depend on local macOS privacy state and user-owned
  CLI history. Dependency-injected detector tests, fixture app-server tests,
  packaged visual states, and manual capture inspection cover deterministic
  behavior; first daily-driver use should confirm real tab-title mapping and
  exact-cwd preview shape. With Automation denied, another app's tty may appear
  as a generic terminal because no title metadata is available; thread-list
  source metadata also varies by CLI version, so exact-cwd matching is the
  current saved-thread authority. Windows/Linux detection remains an
  adapter-friendly empty result and is part of the separate cutover gate.
- Adversarial review: performed failure-oriented self-review plus an
  independent read-only release review, targeting renderer spoofing, expired
  cache authority, cwd canonicalization, descendant exclusion, denied titles,
  malformed app-server data, preview bounds, duplicate threads, partial state,
  onboarding completion, narrow layout, version consistency, and legacy-state
  isolation. Findings were fixed before the final verification run; no
  blocking finding remains.
- Rollback note: remove the GitHub prerelease and tag
  `chromux-next-v0.7.0`, then revert the v0.7.0 shipping commit. Chromux Next
  v0.6.0 and the legacy stable release remain available. Deploy skipped:
  no `deploy.md` or `tasks/deploy.md` manual deployment contract exists; the
  GitHub prerelease is the required publication. Next command: begin the
  macOS daily-driver and clean-install evidence tracked by the Chromux Next
  cutover gate in `tasks/todo.md`.

## 2026-08-09 — Chromux Next v0.7.1 modular baseline

- **User goal:** Begin the cutover-ready upgrade program in release order,
  preserving successor behavior while creating enforceable module, IPC,
  dependency-injection, and recovery boundaries.
- **Implementation:** Browser guest ownership moved to an injected
  `BrowserViewService`; IPC registrations now pass through a complete handler
  catalog with startup parity enforcement; main-to-renderer events share
  runtime schemas; persistent surfaces have a dedicated renderer owner; and
  app, runner, UI, and workspace/onboarding data now use independent private
  atomic files with the v0.7.0 combined file retained as a read-only fallback.
  Main-process contracts now define subprocess, storage, release-client,
  clock, ID, successor migration, and future update seams.
- **Verification:** `npm run typecheck` and all 100 Vitest tests passed,
  including new duplicate/missing IPC and malformed/future slice cases. Full
  packaged verification and release publication are recorded separately at
  ship time.
- **Scope and residual risk:** This prerelease does not import legacy Chromux,
  expose an update API, or implement the session browser/evidence workflow.
  Those remain the subsequent v0.8.0–v0.10.0 program milestones. Stable 1.0.0
  remains blocked by the explicit seven-day, signing, platform, upgrade, and
  rollback gates and must not replace `/releases/latest` early.
- **Rollback:** Remove prerelease `chromux-next-v0.7.1` and revert its commit;
  v0.7.0 continues reading the untouched combined successor state file.

## 2026-08-14 — Chromux Next project labels v0.9.0

- **User goal:** Replace low-value `node` and `/usr/bin/env` labels beside
  Codex in the Find Your Work modal with the detected project name.
- **Changed files and purpose:** `src/detection/contracts.ts` and
  `src/detection/external.ts` add a bounded, sanitized project name derived
  from the canonical cwd; `src/renderer.tsx` uses it in result rows, selected
  configuration, search, and generated session titles; `src/main.ts` keeps
  visual fixtures contract-complete; detection, contract, and interface tests
  cover env/node launchers and prevent raw-command label regressions;
  package/lock metadata, README, `RELEASES.md`, and task records document the
  v0.9.0 prerelease.
- **User-goal mapping:** Every detected row still shows its agent badge,
  terminal, and full directory, but the adjacent primary label now comes from
  the working directory basename. Optional tab titles and raw commands remain
  bounded detection/search metadata and are no longer used as the primary
  project label.
- **Executable verification:** `npm run verify` passed TypeScript, all 21
  Vitest files with 106 tests, Electron Forge macOS arm64 packaging, packaged
  app smoke, packaged two-session restoration, and packaged browser-evidence
  smoke. The three focused detection/contract/interface files passed 19 tests
  after the final regression assertion. The root website suite was also run
  inadvertently and passed without changing tracked output.
- **Skipped tests and residual risk:** A new visual capture was not required
  because the existing visual fixture now carries the same project-name field
  and the change does not alter layout or styling. Live Terminal/iTerm process
  discovery was not repeated because it depends on local Automation privacy
  state; dependency-injected coverage verifies an `/usr/bin/env node ...
  codex` process resolves to the canonical cwd basename. Unusual cwd basenames
  are sanitized and bounded by the strict schema.
- **Adversarial review:** Failure-oriented self-review checked launcher
  wrappers, root-directory fallback, overlong/control-character names, strict
  fixture parity, search retention for tab title and raw command, selected-row
  consistency, version metadata, legacy isolation, and prerelease channel
  behavior. Required fixture fields and direct renderer regression assertions
  were added; no blocking finding remains.
- **Rollback note:** Remove GitHub prerelease and tag
  `chromux-next-v0.9.0`, then revert the v0.9.0 shipping commit. Chromux Next
  v0.8.0 and the stable legacy release remain available. Deploy skipped: no
  explicit manual deployment contract exists; GitHub prerelease publication
  is the required release step. Next command: begin the macOS daily-driver and
  clean-install evidence tracked by the Chromux Next cutover gate in
  `tasks/todo.md`.
