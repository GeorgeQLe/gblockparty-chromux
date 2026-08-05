# Release Notes

## GBlockParty Chromux Next v0.1.1 (prerelease)

Tag: `chromux-next-v0.1.1`

- Give Chromux Next a distinct upward-chevron version of the established
  three-node Chromux mark while preserving the product family's colors and
  dark app tile.
- Display the successor mark in the workspace rail and use generated ICNS,
  ICO, and PNG assets for packaged application identity.
- Keep every legacy Chromux logo and package asset unchanged.

## GBlockParty Chromux Next v0.1.0 (prerelease)

Tag: `chromux-next-v0.1.0`

- Add an isolated Electron Forge/Vite, React, and TypeScript successor app with
  the independent `dev.georgele.chromux.next` identity and user-data path.
- Define and runtime-validate canonical alignment documents, semantic items,
  document/deck/canvas views, review responses, revisioned mutation batches,
  provider requests/events/results, and typed IPC payloads.
- Add atomic workspace JSON persistence, history, stale-revision rejection,
  inverse mutations, undo, a native alignment editor, and deterministic demo
  fixtures.
- Add a structured agent composer with immutable context snapshots, streaming
  events, cancellation, review-before-apply mutation proposals, deterministic
  failure fixtures, and a read-only Codex reference adapter.
- Add explicit-click HTTP(S) link detection and a popup-denying
  main-process-owned browser view without queues or automatic navigation.
- Document architecture, trust boundaries, UAT, the remaining successor
  roadmap, and the prerelease convention that preserves legacy Chromux as
  GitHub `/releases/latest`.

## GBlockParty Chromux v0.81.0

Tag: `chromux-v0.81.0`

- Keep update results visible in a fixed, two-row Settings footer while
  version details, release links, and install diagnostics remain scrollable.
- Show neutral “Checking for updates…” feedback as soon as a manual check
  begins, and disable the check action until the existing update check
  completes.
- Preserve current, available, queued, blocked, installing, and failed update
  states with an accessible polite status announcement.
- Wrap long status messages above responsive footer actions so Settings stays
  usable in narrow Chromux windows.

## GBlockParty Chromux v0.80.2

Tag: `chromux-v0.80.2`

- Treat Codex 0.146's one-key “Implement this plan?” choices as submitted
  turns, so both implementation paths immediately display Working while the
  original digit still reaches the PTY exactly once.
- Keep “No, stay in Plan mode,” permission choices, ordinary Plan questions,
  numbered prose, and non-Codex numeric input from starting agent activity.
- Preserve Composer-shadow suppression for numeric choosers, clear stale
  turn-scoped preview candidates, refresh recent activity, and allow normal
  provider activity and completion signals without applying the `/clear`
  completion barrier.
- Add a real-Electron cross-surface regression covering chooser parsing, PTY
  delivery, Composer state, tab and Threads activity, preview cleanup, and
  subsequent lifecycle signals.

## GBlockParty Chromux v0.80.1

Tag: `chromux-v0.80.1`

- Keep the Developer Inspect session selector mutation-free while its native
  macOS menu is focused, without pausing the surrounding live diagnostics.
- Defer added, exited, renamed, reordered, and closed session option changes
  until the selector loses focus, then reconcile keyed options and preserve
  the active-or-first fallback when the inspected session closes.
- Commit a selection immediately, close the selector interaction, restore
  focus to the active terminal, and resume normal Chromux hotkey routing.
- Add real-Electron coverage for timer, diagnostic-event, window-focus,
  lifecycle, native-selection, fallback, terminal-focus, and hotkey behavior.

## GBlockParty Chromux v0.80.0

Tag: `chromux-v0.80.0`

- Replace the Threads card's 2×2 text-button grid with compact, right-aligned
  outline icons for specialized Queue/Git/system actions, supported Dismiss,
  and universal Snooze; the card header remains the ordinary Open action.
- Keep permission, authentication, rate-limit, tool-failure, Queue, and
  conflict reasons non-dismissible while preserving their Open/resolve and
  Snooze paths.
- Remap `d` from Done to supported Dismiss, retain Enter/`o` and `s`, stop
  creating Done triage records, and continue honoring existing saved Done
  records until their reopen token changes.
- Add stable action identifiers, descriptive labels and tooltips, decorative
  SVG treatment, compact focus targets, and real-Electron coverage across
  Threads layouts, themes, update rows, keyboard navigation, and native Streak
  click boundaries.

## GBlockParty Chromux v0.79.3

Tag: `chromux-v0.79.3`

- Preserve the exact visible terminal scrollback row when switching between
  session tabs immediately after native viewport scrolling.
- Snapshot the active terminal's physical viewport before hiding it and when
  the Chromux window loses focus, preventing later refits from restoring a
  stale top, bottom, or prior scroll position.
- Keep alternate-screen and bottom-following behavior unchanged, and add
  real-Electron coverage for upward and downward race cases plus blur/refit
  stability.

## GBlockParty Chromux v0.79.2

Tag: `chromux-v0.79.2`

- Keep ordinary scripted Electron E2E windows hidden from creation through
  completion, while preserving normal app and manual-smoke window behavior.
- Show the native Streak pointer-boundary test with `showInactive()` only when
  its script is ready, retaining real mouse hover, geometry, and click coverage
  without focusing Chromux or stealing keyboard input.
- Keep automated Activity Lab smoke coverage hidden while leaving manually
  launched labs visible, and enforce all three visibility modes with focused
  window-configuration and real-Electron regressions.

## GBlockParty Chromux v0.79.1

Tag: `chromux-v0.79.1`

- Add compact session, agent, and project/folder context to every
  session-scoped Action Required card while keeping the full working directory
  available in its tooltip and accessible card label.
- Keep each grouped action type beside its existing reason detail, then place
  the reason's actions in a responsive two-column grid so all four controls and
  long primary labels remain inside the narrow Threads rail.
- Add real-Electron regression coverage for long session and folder labels,
  multiple reasons, keyboard activation, four-action two-row geometry, button
  bounds, and the Streak theme's alternate rail width.

## GBlockParty Chromux v0.79.0

Tag: `chromux-v0.79.0`

- Mirror the visible, post-filtering and post-grouping Threads attention count
  on the macOS Dock icon, count each session once even when it has multiple
  reasons, and clear the badge when every item is opened, resolved, dismissed,
  completed, or snoozed.
- Treat the selected session as viewed only while the Chromux window is
  focused, preserving completions produced in the background until that
  session becomes visible without consuming attention from other sessions.
- Add validated active-renderer IPC, a macOS-only Settings status row with
  non-blocking Notifications guidance when Electron rejects badging, local
  aggregate-only privacy documentation, and real-Electron platform, rejection,
  focus, grouping, triage, and clearing coverage.

## GBlockParty Chromux v0.78.0

Tag: `chromux-v0.78.0`

- Add Hotkey Training Grounds to Settings with four fixture-backed workflow
  missions, mission selection and replay, contextual hints, full chord reveal,
  accessible status announcements, elapsed timing, and one-to-three-star
  mastery scoring.
- Intercept only production-recognized Chromux shortcuts and Escape while
  training is active, route sanitized action IDs into the simulation, and keep
  live sessions, queues, browsers, projects, Composer, and app quit behavior
  untouched.
- Persist a bounded schema-v1 local progress record with best time, fewest
  mistakes, best stars, and last completion time; reject malformed, oversized,
  future-schema, and unknown-mission data, and provide a training-only
  confirmed reset.
- Use the production shortcut parser for mission parity, display ⌘ labels on
  macOS and Ctrl labels on Windows, and contain keyboard focus within the
  modal arena.

## GBlockParty Chromux v0.77.0

Tag: `chromux-v0.77.0`

- Add the full session context menu to Threads sidebar rows on right-click,
  matching the duplicate, cross-agent, group, and close actions available from
  session tabs.
- Activate an inactive session before opening its Threads context menu and
  dismiss any pending or open terminal preview so the selected session and menu
  actions stay aligned.
- Add real-Electron regression coverage for menu activation, action parity,
  and outside-click dismissal.

## GBlockParty Chromux v0.76.4

Tag: `chromux-v0.76.4`

- Recognize the Codex 0.146 percentage-based context footer, such as
  `Context 62% left`, as bounded prompt chrome when it accompanies the current
  rendered `›` prompt.
- Restore normal PTY-write, background-tab activation, and post-warning startup
  reveal behavior without changing focus, lifecycle, timeout, or exit policy.
- Keep prompt-less percentage text and exited sessions covered, retain legacy
  Codex prompt forms, and add real-Electron startup and Composer regressions
  shaped like the current cursor-positioned screen.

## GBlockParty Chromux v0.76.3

Tag: `chromux-v0.76.3`

- Recheck the existing rendered-prompt readiness detectors when a user
  activates a managed-agent tab, so a prompt that finished rendering while
  offstage dismisses the startup loader without requiring more PTY output.
- Preserve background focus, terminal accessibility, and normal activation
  focus across Codex, Claude Code, and Grok Build while keeping exited sessions
  covered.
- Add real-Electron regression coverage for the missed background callback
  state without changing production APIs, IPC, persistence, or readiness
  matching.

## GBlockParty Chromux v0.76.2

Tag: `chromux-v0.76.2`

- Automatically dismiss the startup loader when a live agent renders its
  interactive prompt after the 15-second warning; the manual terminal action
  remains available while the prompt is still pending.
- Keep exited sessions covered until manually revealed, and preserve retained
  output, Composer blocking, accessibility restoration, and background-session
  focus behavior during slow startup recovery.
- Recognize Claude Code and Grok Build branding within the same bounded
  1,024-row startup evidence window used by Codex, reducing false stalls after
  verbose shell initialization.

## GBlockParty Chromux v0.76.1

Tag: `chromux-v0.76.1`

- Keep Developer Inspect session options mounted across one-second and
  event-driven diagnostics refreshes so an open native dropdown is not
  disrupted.
- Reconcile new, exited, reordered, and closed sessions in place while
  preserving explicit background inspection and active-or-first fallback.
- Add real-Electron regression coverage for option identity, selection
  persistence, session lifecycle updates, and inspected-session closure.

## GBlockParty Chromux v0.76.0

Tag: `chromux-v0.76.0`

- Add an isolated developer-only Contextual Sidebar Lab with Gallery and
  counterbalanced Study modes, 18 synthetic sessions, six instrumented tasks,
  the current Threads control, and nine market-inspired navigation concepts.
- Record completion, speed, errors, interactions, switching, scroll, row
  relocation, and flow ratings; export a sanitized schema-v1 report with
  median task/variant scoring, separate spatial churn, and a synthesized
  recommendation.
- Keep production Threads, preload, session state, PTYs, Git state, and user
  profiles outside the lab. Add deterministic core/renderer/Electron coverage,
  a no-model 60-trial UAT baseline, and reproduction/source documentation.

## GBlockParty Chromux v0.75.0

Tag: `chromux-v0.75.0`

- Cover every managed Claude Code, Codex, and Grok Build launch with a
  theme-aware startup skeleton while retaining all PTY output in terminal
  scrollback and preserving lifecycle, preview, and title processing.
- Reveal the terminal only after xterm renders a provider-recognizable
  interactive prompt. Plain shell sessions remain immediate, and background
  or restored sessions become ready without stealing focus.
- After 15 seconds, keep the loader visible with a manual **SHOW TERMINAL**
  escape hatch. Report early process exits through the same accessible surface
  and clean up startup timers when sessions close.

## GBlockParty Chromux v0.74.1

Tag: `chromux-v0.74.1`

- Show immediate Codex submission spinners when activity indicators are
  enabled while retaining internal pending state, update blocking, and
  provider-confirmed Working classification.
- Accept authenticated v2 and generated v1 Codex completion notifications for
  ordinary pending turns even when title or meaningful-output start evidence
  never arrived. Keep exact `/clear` protected from delayed completion.
- Upgrade the isolated Activity Indicator Lab interactive lane to use the
  production submission projection, OSC parser, attention reducer, and Codex
  notify completion path, then end resident TUI processes after observed turn
  completion.

## GBlockParty Chromux v0.74.0

Tag: `chromux-v0.74.0`

- Restore Threads as a session-first inbox: rank every live session into
  exactly one of Action Required, Ready to Finish, Working, or All Sessions;
  combine its reasons on the highest-priority card; hide empty priority
  sections; and report accurate counts.
- Keep ordinary dirty, ahead, unpublished, and stale worktrees in Git mode.
  Only a conflict associated with a live session enters Action Required, where
  its action opens the dedicated Git session.
- Replace the embedded Git mutation drawer with a searchable
  Action/Stale/All worktree navigator. Selecting a canonical worktree creates
  or reuses `Git · <branch>`, inherits the newest associated agent or Codex,
  preserves existing terminal/draft state, and opens an editable unsent status
  review in Composer.
- Add bounded Git-session prompt inserts for status, conflict, commit,
  sync/publish, GitHub, stale-state, and saved-mapping Vercel preparation.
  Remove renderer, preload, IPC, and service exposure for diff, stage,
  unstage, commit, fetch, pull, publish, push, and sync mutations.
- Advance restore snapshots to schema v11 with sanitized, path-matched
  `git-worktree` session identity so dedicated sessions remain reusable after
  restart.
- Absorb the unpublished v0.73.0 source candidate into this release without
  creating or moving a v0.73.0 tag.

## GBlockParty Chromux v0.73.0

Unpublished candidate; superseded by `chromux-v0.74.0`.

- Add a Windows-only, keyboard-accessible, five-stage first-run setup and
  diagnostics wizard with resumable WSL2 selection, required Bash/Git/Node
  checks, optional per-agent readiness, explicit Projects Root creation, and a
  sanitized no-model PTY self-test.
- Gate sessions from live runtime readiness instead of setup completion:
  preserve pending restore snapshots when WSL2 is blocked, disable only missing
  agent choices, and limit an invalid Projects Root to Create Project.
- Preserve existing profiles through versioned completion migration, canonical
  `wslDistro` and per-distribution `projectsRoots` settings, per-user upgrades,
  and uninstall-time local-data retention.
- Replace hardcoded Windows artifact metadata with package-derived names and a
  protected Microsoft Artifact Signing release pipeline that builds once,
  signs all unpacked and nested executable payloads, uploads one immutable
  checksummed candidate, and gates publication on exact-hash Windows 10/11 UAT.
- Re-download and verify every draft GitHub Release asset before atomic
  publication, then verify `/releases/latest` and Chromux's validated common
  Squirrel feed directory.
- Retain compatibility with older Git worktree porcelain, legacy Electron
  Forge packaging dependencies, current GitHub Actions runtimes, and
  Linux-hosted Electron regression runs.
- Add the complete OAuth-backed Vercel preview shipping workflow: public PKCE
  sign-in, guarded direct and Git-triggered deployment creation, bounded
  monitoring, cancellation, retry, and restart recovery with non-secret
  mode-`0600` job persistence.
- Recover Codex startup checks from unauthenticated GitHub REST rate limits by
  validating the public latest-release redirect before accepting its exact
  stable version. npm installations still require that version to exist in the
  registry.
- After all bounded release checks fail, start every queued restored Codex
  session once in saved order and keep Codex launches ungated for the rest of
  that app run.
- Keep the failure warning non-blocking with background retry and dismiss
  actions. A later successful check clears the warning when current, or reports
  the available release without updating live sessions.

## GBlockParty Chromux v0.72.1

Tag: `chromux-v0.72.1`

- Recover Codex startup checks from unauthenticated GitHub REST rate limits by
  validating the public latest-release redirect before accepting its exact
  stable version. npm installations still require that version to exist in the
  registry.
- After all bounded release checks fail, start every queued restored Codex
  session once in saved order and keep Codex launches ungated for the rest of
  that app run.
- Keep the failure warning non-blocking with background retry and dismiss
  actions. A later successful check clears the warning when current, or reports
  the available release without updating live sessions.

## GBlockParty Chromux v0.72.0

Tag: `chromux-v0.72.0`

- Add authenticated `chromux_browser_queue_add` MCP and `browser-preview` OSC
  signals so agents can intentionally queue bounded HTTP(S) or existing local
  file targets for their originating Chromux session.
- Keep terminal URL/path discovery as a turn-aware, bounded compatibility
  fallback. New user input clears stale candidates; Claude and Grok promote at
  actionable/completion boundaries, Codex promotes at completion, and
  uninstrumented sessions retain a delayed browser-only fallback.
- Persist queue visibility and keep terminal fallback records inside the paired
  browser queue without creating Threads entries, session-tab badges, or
  tab-group attention counts. Explicit MCP/OSC requests and page popups retain
  those attention surfaces; legacy restored records remain compatible.
- Return structured `queued`, `alreadyQueued`, and `refreshed` outcomes for
  explicit requests while preserving the existing user-approved **OPEN** flow.

## GBlockParty Chromux v0.71.0

Unpublished candidate; superseded by `chromux-v0.73.0`.

- Add the main-process Vercel integration foundation for runtime-local CLI
  discovery, CLI-login and encrypted-token connection profiles, OAuth
  PKCE/state/refresh/revocation primitives, linked deploy-root discovery, and
  per-runtime project configuration.
- Keep Vercel tokens out of renderer results, command arguments, and status
  text. Token-backed CLI calls receive credentials only through
  `VERCEL_TOKEN`; stored records use Electron OS-backed encryption and fail
  closed when it is unavailable.
- Persist non-secret Vercel project mappings separately with mode `0600`,
  recover safely from corrupt records, and retain Vercel CLI-owned login state
  when a Chromux connection is removed.
- Add a project-scoped **VERCEL** terminal-header button and setup wizard for
  runtime-local CLI discovery, CLI-login or encrypted-token connections,
  linked-project discovery, explicit project IDs, connection validation, and
  canonical deploy mappings. Saved sessions show **VERCEL · READY**.
- Add a guarded **SHIP** review for tracked and untracked Git status, exact
  branch/environment targeting, stage-all commit and upstream push, clean-HEAD
  monitoring, direct deploys, explicit second production confirmation, and
  push-only recovery without pull, force push, rollback, or empty commits.
- Persist bounded, non-secret deployment jobs with mode `0600`; correlate Git
  deployments by commit SHA, inspect direct and Git deployments to a terminal
  state, cancel only local monitoring, and automatically resume safe discovery
  or inspection after restart.
- Own the exact `127.0.0.1:47891` OAuth callback before opening Vercel, use a
  public PKCE client without a secret, rotate and revoke encrypted tokens, and
  close the listener on completion, cancellation, timeout, window destruction,
  or app exit.
- This candidate was never published. Its completed implementation is absorbed
  into v0.73.0, which remains gated on a deployment-capable public Vercel
  application and the live direct/Git/cancel/restart preview UAT.

## GBlockParty Chromux v0.70.0

Tag: `chromux-v0.70.0`

- Redesign Threads as a four-section hybrid inbox: **Action Required**,
  **Ready to Finish**, **Working**, and the complete directory-grouped
  **All Sessions** navigator. Add keyboard queue navigation plus explicit,
  persisted Done and Snooze processing in restore schema v10.
- Replace the live-session flat diff with a bounded local repository catalog
  and ranked linked-worktree inventory. Keep stale work distinct from Git's
  formal prunable state and deduplicate repository obligations across sessions.
- Add a focused repository review drawer with bounded text diffs, binary and
  oversized fallbacks, whole-file stage/unstage, manual commit preview,
  commit-hook warnings, and confirmed provider-neutral fetch, fast-forward
  pull, branch publish, push, and sync actions.
- Revalidate catalog, worktree, branch, status, and selected-file state before
  each mutation; run remote Git operations non-interactively and surface
  authentication, hook, ruleset, divergence, and conflict failures without
  automatic commit or push retries.

## GBlockParty Chromux v0.69.4

Tag: `chromux-v0.69.4`

- Add a repeatable isolated Electron recovery UAT that deliberately fails the
  first `claude -p` delivery, verifies the persisted payload, screenshot, and
  delivery-log entry, then runs the documented manual retry command against
  the unchanged YAML content.
- Archive a sanitized passing recovery transcript without using a real Claude
  account, credential, network request, or model turn.

## GBlockParty Chromux v0.69.3

Tag: `chromux-v0.69.3`

- Retry the complete Codex executable, installed-version, and stable-release
  preflight after one second and two seconds before showing the existing
  update-check failure prompt.
- Keep restored Codex sessions queued in saved order during automatic retries,
  release every waiting session as soon as any attempt succeeds, and retain
  **RETRY CHECK** as a fresh three-attempt cycle without retrying installations.

## GBlockParty Chromux v0.69.2

Tag: `chromux-v0.69.2` (pending real Windows 10 UAT)

- Add Windows 10 22H2+ x64 support at build 19045 or newer, including Windows
  11, while rejecting older builds, malformed release strings, ARM64, and ia32.
- Require updated WSL2, retain per-distribution Projects Roots, and retarget
  Windows Squirrel packaging and the mandatory real-machine UAT to v0.69.2.
- Keep ANSI white and bright-white readable on every light terminal theme and
  enforce xterm's WCAG AA 4.5:1 contrast floor across live terminals, hover
  previews, and renderer test terminals.
- Resolve `tar` and `brace-expansion` to patched releases, bringing the
  production dependency audit to zero findings.
- Add a dependency-free, loopback-only localhost first-success fixture with
  stable review markers, health routing, a documented fixed port, and
  ephemeral-port test support.
- Prove real HTTP queue detection, approval-gated OPEN, mounted-page
  attachment persistence, selected-session Composer routing, decoy isolation,
  actionable response handling, timeout behavior, and complete cleanup without
  model use in deterministic coverage.
- Add a visible UAT that requires exactly one authorized Codex turn, never
  retries after submission, archives a bounded sanitized report, and removes
  its isolated Chromux profile and captures.

## GBlockParty Chromux v0.69.1

Tag: `chromux-v0.69.1`

- Keep scripted Electron E2E windows hidden so automated test runs do not
  steal focus, while preserving DOM layout, webviews, synthetic input, and
  screenshot capture.
- Keep production launches and manual `npm run smoke` windows visible, with
  `CHROMUX_E2E_SHOW_WINDOW=1` available to watch a scripted E2E run.

## GBlockParty Chromux v0.69.0

Tag: `chromux-v0.69.0`

- Stop rendering unconfirmed Codex Pending/Awaiting agent activity as an
  animated Working spinner; only existing provider evidence activates Working.
- Preserve Pending as update-unsafe while retaining completion, cancellation,
  process-exit, `/clear`, restore, Threads, diagnostics, disabled-indicator,
  title/output, and notify fallback behavior.
- Add an explicitly turn-budgeted same-turn Activity Lab probe for Codex
  0.145.x using ephemeral read-only threads, a private Unix-socket app-server,
  a WebSocket-framed observer through `app-server proxy`, bounded sanitized
  lifecycle evidence, and verified cleanup without `codex exec`.
- Record the Gate 1 rejection of persistent app-server lifecycle integration:
  the separate observer did not receive the visible TUI turn stream, so the
  capability-gated production pilot and its three Gate 2 live turns remain
  disabled.

## GBlockParty Chromux v0.68.0

Tag: `chromux-v0.68.0`

- Present live sessions with unknown turn state and idle agents using the same
  neutral gray indicator across session tabs, grouped tabs, Threads, themes,
  and the disabled-activity-indicators mode while retaining distinct lifecycle
  state, tooltips, and accessibility descriptions.
- Remove the misleading **SENT** title-bar gauge while preserving capture
  records, delivery outcomes, failure handling, and contextual **CAPTURE SENT**
  chips.
- Keep Working, Completed, Action required, and Exited indicators visually
  distinct as cyan spinners, green checks, amber alerts, and red dots.

## GBlockParty Chromux v0.67.0

Tag: `chromux-v0.67.0`

- Add an isolated Codex Activity Indicator Lab launched with
  `npm run activity-lab`, using a temporary Electron profile and temporary
  workspaces without restoring or launching normal Chromux sessions.
- Compare production-style interactive PTY title/output inference with
  `codex exec --json` structured lifecycle ground truth across response-only,
  read-only inspection, concurrent, cancellation, and idle control scenarios.
- Keep every scenario behind an explicit Run action, restrict both live lanes
  to read-only/no-approval execution, bound output and runtime, support
  cancellation, and clean up lab-created workspaces.
- Show explicit launching, working, completed, failed, cancelled, and idle
  states with animation limited to working, plus a timestamped signal trace and
  sanitized JSON export that excludes response text.
- Add fake-Codex parser, lifecycle, malformed-event, bounds, cancellation,
  timeout, isolation, and Electron smoke coverage; keep live model tests
  manual and opt-in.

## GBlockParty Chromux v0.66.0

Tag: `chromux-v0.66.0`

- Replace the overloaded new-session modal with a two-tab project launcher:
  **Open Existing** on Command/Control-T and **Create Project** on
  Command/Control-N, preserving editable-field and modal shortcut guards.
- Add native `np`-compatible fresh and clone creation with configured flat,
  lifecycle, and sandbox categories, destination previews, kebab-case and root
  containment validation, unique staging directories, and atomic final moves.
- Store Projects Root per host and WSL distribution, initially inherit
  `P_BASE` or `<runtime-home>/projects`, and retain canonical Linux paths on
  Windows.
- Update `p` history, invalidate completion caches, and invoke executable
  `P_NP_HOOK` integrations with visible non-fatal warnings after successful
  creation.
- Offer **Create Only** and emphasized **Create & Launch**, passing the
  main-process-returned runtime, distribution, and path into canonical session
  creation while retaining the Grok data-risk acknowledgment.

## GBlockParty Chromux v0.65.0

Tag: `chromux-v0.65.0`

- Add macOS-only MCP tools to list opaque Chromux-window and paired-browser
  targets, capture browser evidence or the whole Chromux window, and start/stop
  one bounded window recording.
- Require a visible **ALLOW ONCE** approval for every screenshot and recording
  before macOS capture access, identify the requester and target, deny unanswered
  requests, and never remember approval or expose page URLs in target listings.
- Record at up to 1280×720 and 15 fps for 60 seconds with a persistent red HUD,
  user stop control, caller ownership, recording exclusivity, idempotent stop,
  and automatic persistence on deadline, requester disconnect, window close, or
  app shutdown.
- Prefer WebM VP9/Opus then VP8/Opus, request system-loopback audio without
  microphone capture, and continue visibly as video-only when audio is denied,
  unsupported, or unusable.
- Persist private screenshots, YAML evidence, recordings, timestamped contact
  sheets, and manifests under `~/.chromux/captures`; expose approved images
  directly and generated files through safe `chromux://capture/...` MCP
  resources without opening a network listener.
- Add a mode-`0600` capture-control socket, bounded/caller-aware request
  transport, path and size validation, macOS audio privacy metadata, mocked
  Electron recording smoke coverage, socket/coordinator/artifact/MCP contract
  tests, and permission, retention, failure-recovery, and resource docs.

## GBlockParty Chromux v0.64.1

Tag: `chromux-v0.64.1`

- Launch every Chromux-managed Codex session with process-scoped `TERM=xterm-color` and Codex’s
  ANSI TUI theme so syntax and diff colors remain mapped to the active Chromux terminal palette.
- Apply the compatibility profile to new and resumed macOS/WSL sessions and bare Codex commands
  adopted from a Chromux shell without changing Claude, Grok Build, or ordinary shell behavior.
- Preserve explicit shell-launched Codex themes as an opt-out while adding only missing notify and
  update-check settings, with no duplicated configuration arguments.
- Repaint representative palette-indexed Codex syntax and diff output across all eight Chromux
  appearances without retaining immutable truecolor diff backgrounds.
- Keep Electron smoke tests from starting detached resource-broker daemons and disconnect terminal
  resize observers before disposal so repeated renderer runs remain isolated and deterministic.

## GBlockParty Chromux v0.64.0

Tag: `chromux-v0.64.0` (superseded before publication by `chromux-v0.64.1`)

- Replace the unpublished full-browser chat timeline with a full-width browser and routed
  **COMPOSE** drawer.
- Route prompts to any live session through the recipient’s existing terminal-input, history,
  activity, and attention paths while keeping the source browser visible; allow working-agent
  steering and block exited, missing, pending-input, or draft-owning targets.
- Add explicit persisted **ATTACH CURRENT PAGE** evidence with removable/refreshable chips and
  bounded payload, screenshot, URL, and title references that clear only after successful delivery.
- Create **New session** targets through canonical session creation with inherited runtime,
  distribution, directory, and current URL, a fresh browser partition, moved attachments, and an
  editable unsent prompt.
- Keep schema v9 while persisting `fullBrowserComposerOpen` and staged evidence, treating the
  unpublished `chatOpen` field as a compatibility fallback and discarding `chatMessages`.

## GBlockParty Chromux v0.63.1

Tag: `chromux-v0.63.1` (superseded before publication by `chromux-v0.64.0`)

- Keep the production Electron profile at the stable `chromux` app-data path instead of deriving it
  from display-oriented packaging metadata.
- Recover renderer settings automatically by preferring an existing legacy `chromux` profile, then
  an existing `GBlockParty Chromux` profile, while using `chromux` for clean installations.
- Preserve explicit `--user-data-dir` paths and isolated smoke profiles, and retain renderer Local
  Storage during startup cleanup.
- Left-align the icon-only Recent/A–Z thread filter within its existing 8 px toolbar inset while
  preserving accessibility, persisted ordering, and the collapsed Git Changes layout.

## GBlockParty Chromux v0.63.0

Tag: `chromux-v0.63.0` (superseded before publication by `chromux-v0.63.1`)

- Add an optional full-browser structured-chat presentation with a theme-width timeline, retained
  mounted browser, docked/expandable Composer, exact Composer prompt tracking, and explicitly labeled
  bounded terminal-derived assistant output.
- Persist bounded per-session chat timelines and staged browser-context references in schema-v9
  managed restore snapshots, restoring pending replies as interrupted while keeping schemas v1–v8
  compatible with empty chat state.
- Capture bounded visible page text alongside the existing URL, title, console tail, screenshot, and
  optional picked element, then create fresh same-runtime browser sessions with removable/refreshable
  context chips and editable unsent drafts for Claude, Codex, Grok, or Shell.
- Preserve the Grok acknowledgment gate, source drafts on failure, raw-terminal escape hatch, exact
  browser/tab/queue/console/history state, and all non-chat layouts.

## GBlockParty Chromux v0.62.1

Tag: `chromux-v0.62.1` (pending real Windows UAT for the v0.62 release line)

- Position native macOS traffic-light controls from each theme header’s measured left edge so inset Liquid Glass and Retro-OS titlebars retain comfortable window-edge spacing.
- Increase Liquid Glass titlebar branding clearance for the shifted native controls.
- Give the SESSIONS, QUEUED, and SENT glass gauges visible 1 px boundaries with balanced internal padding in both Light and Dark modes.

## GBlockParty Chromux v0.62.0

Tag: `chromux-v0.62.0` (pending real Windows UAT)

- Add native Windows 11 x64 packaging with an unsigned per-user Squirrel installer, ASAR/native-module unpacking, platform release assets, and Windows auto-updates.
- Run Windows terminals in user-selected WSL2 distributions with readiness checks, canonical Linux workspace locations, argv-safe execution, Windows/WSL path transport, distro-stable projects, and schema-v8 restore migration.
- Add Windows title-bar behavior, Control shortcuts, Prevent Sleep, Windows foreground-input resources, named-pipe broker transport, and distro-local hooks/MCP launchers while keeping iOS Simulator controls macOS-only.
- Add Windows platform tests, PATHEXT-aware Codex executable discovery, hosted packaging CI, SmartScreen/WSL guidance, and a mandatory real-machine UAT gate. Do not tag or publish until that report passes.
- Add `Command+Shift+F` on macOS and `Control+Shift+F` on Windows to run the active session browser rail’s expansion action from the host, terminal, or a non-editable embedded browser.
- Honor the configured full-Chromux, paired-workspace, or three-layout cycle behavior while preserving the exact paired or terminal return layout, divider width, mounted webview, active tab, URL, queue, and console state.
- Keep the existing paired-browser open/shut shortcut unchanged, preserve native macOS `Control+Command+F`, and suppress the new fullscreen shortcut for modals, editable host or guest focus, and missing active sessions.

## GBlockParty Chromux v0.61.9

Tag: `chromux-v0.61.9`

- Keep numeric Codex permission, plan-progression, and Plan-mode questionnaire selections out of Prompt Composer while forwarding every chosen digit to Codex exactly once.
- Recognize only visible chooser structures with a selected numbered row, a distinct numbered option, and a nearby confirmation or submission footer; reject ordinary numeric prompts, numbered prose, historical chooser transcripts, and non-Codex terminals.
- Invalidate stale rendered-prompt recovery after a chooser selection so immediate and working-state redraws cannot recover the digit, an option label, a conflict prompt, or a terminal-clearing control.

## GBlockParty Chromux v0.61.8

Tag: `chromux-v0.61.8`

- Keep Codex turns Working across repeated composer-bearing redraws whenever the current frame also contains meaningful non-rate-limit output.
- Preserve the mounted tab spinner and Threads Working row while live redraws continue, refreshing activity and completion eligibility on every frame.
- Continue completing from a later composer-only idle redraw, a stopped rate-limit chooser, a stable title, or validated notifier evidence.

## GBlockParty Chromux v0.61.7

Tag: `chromux-v0.61.7`

- Keep the last complete terminal hover-preview frame visible while the newest serialized source snapshot resets, resizes, themes, and replays into a reusable hidden xterm layer.
- Coalesce sustained output behind one in-flight replay, repaint every staging row before an instant opacity swap, and immediately prepare any pending newer snapshot in the now-hidden layer.
- Preserve ANSI styling, alternate-screen redraws, bounded scrollback, source dimensions and viewport position, preview scaling, theme changes, accessibility, and cancellation on dismissal or session closure.

## GBlockParty Chromux v0.61.6

Tag: `chromux-v0.61.6`

- Keep full-Chromux browser mode below the measured application header across Blueprint, Retro-OS, Streak, and Liquid Glass layouts.
- Continue covering the session rail, session tabs, workspace, and status bar while leaving the titlebar visible, usable, and outside browser hit testing.
- Preserve the browser rail, paired and terminal return layouts, divider width, live webview, active browser tab, URL, queue, console state, and fullscreen preference behavior.

## GBlockParty Chromux v0.61.5

Tag: `chromux-v0.61.5`

- Restore visible terminal content in hover and keyboard-focus previews for sessions without attention reasons.
- Keep the optional attention panel hidden without collapsing the terminal viewport or displacing the footer across compact, comfortable, and large previews in every theme appearance.
- Preserve terminal serialization, scaling, repaint, attention overflow, interaction, and accessibility behavior.

## GBlockParty Chromux v0.61.4

Tag: `chromux-v0.61.4`

- Reclaim closed-session Chromux browser partitions and exact stale signal-correlation records on the next launch, before the first window and session are created.
- Restrict cleanup to legacy, UUID, and renderer-fallback partition directories plus exact lowercase signal filenames, while retaining unrelated entries, ordinary partition files, top-level symlinks, nonmatching signals, captures, delivery logs, restore data, prompt history, and agent-owned storage.
- Continue startup after individual filesystem failures with bounded diagnostics and aggregate counts, while preserving distinct persistent browser partitions for every new session.

## GBlockParty Chromux v0.61.3

Tag: `chromux-v0.61.3`

- Remove the printable `]` and `\` framing left around correlated Codex OSC 10/11/12 color replies, including wrapped, adjacent, repeated, and partially stripped forms.
- Keep artifact-only prompts empty, prefer clean session-local input over contaminated rendered content, and preserve legitimate mixed prompt text byte-for-byte.
- Continue forwarding raw terminal input unchanged while retaining bounded session-local correlation and exact-match cleanup.

## GBlockParty Chromux v0.61.2

Tag: `chromux-v0.61.2`

- Keep Recent Threads rows and working-directory groups stable while navigating ordinary, Working, and Needs Attention sessions.
- Advance recency only for meaningful work such as session creation, submitted prompts, turn-state changes, and explicit attention actions.
- Ignore follow-up mouse clicks from a double-click after Threads rebuilds, preventing a newly exposed row from activating while preserving single-click and keyboard activation.

## GBlockParty Chromux v0.61.1

Tag: `chromux-v0.61.1`

- Repaint every mirrored xterm row after hover-preview serialization, scrolling, CSS scaling, resizing, theme changes, and preview-size changes.
- Preserve source geometry, viewport position, ANSI colors, alternate-screen state, and bounded scrollback while rendering active and idle Codex previews.
- Cover production-width DEC synchronized-output redraws and the return from Codex's alternate screen to a shell prompt.

## GBlockParty Chromux v0.61.0

Tag: `chromux-v0.61.0`

- Add a persisted Browser fullscreen behavior setting for paired-workspace expansion, a three-layout cycle, or full-Chromux browser toggling; full Chromux is the default.
- Replace browser fullscreen flags with session-local paired, terminal, browser-workspace, and browser-Chromux modes that preserve the exact return layout and last divider width.
- Let the active browser cover the complete Chromux renderer while retaining its toolbar, tabs, and rail, without entering native macOS fullscreen or remounting live webviews.
- Keep Command-Shift-B dedicated to opening or shutting the paired browser, including a direct return to terminal-focused layout from either browser expansion mode.

## GBlockParty Chromux v0.60.4

Tag: `chromux-v0.60.4`

- Keep the browser review queue visible after `OPEN` while the selected page is still loading, and close it only after that page loads successfully.
- Leave the queue open after main-frame failures so restored offline loopback rows, rechecks, and server-launch recovery remain accessible.
- Track only the latest queue selection across browser tabs, accept successful redirects, and clear transient navigation state when its tab or session closes.

## GBlockParty Chromux v0.60.3

Tag: `chromux-v0.60.3`

- Run every Codex update-preflight subprocess with the same augmented PATH used to discover the Codex executable.
- Restore boot-time version detection for Node-based Codex launchers when Chromux starts from Finder with a minimal inherited PATH.
- Preserve direct executable execution, bounded output, timeouts, install-source detection, update behavior, and post-update verification.

## GBlockParty Chromux v0.60.2

Tag: `chromux-v0.60.2`

- Keep OSC color replies out of Compose even when Codex renders their printable residue into its editor and Chromux prefers that rendered prompt over the keystroke shadow.
- Correlate cleanup only with bounded, session-local OSC 10/11/12 replies actually emitted by xterm, preferring clean typed input and preserving unrelated OSC-looking text.
- Parse OSC input across split `ESC`/`]` introducers and split string terminators while forwarding every original byte to the PTY unchanged.

## GBlockParty Chromux v0.60.1

Tag: `chromux-v0.60.1`

- Render Codex terminal redraws atomically by honoring DEC synchronized-output markers even though Chromux remains on xterm.js 5.5.
- Preserve ordinary PTY output, OSC signals, titles, preview detection, completion recovery, scrolling, themes, and input behavior around synchronized frames.
- Release malformed frames after one second or 1 MiB, and clear pending synchronized-output state when a session closes.

## GBlockParty Chromux v0.60.0

Tag: `chromux-v0.60.0`

- Add per-session paired-browser fullscreen within the Chromux workspace, with a rail-only expansion control and exact restoration of the prior collapsed or split layout.
- Keep browser tabs, URLs, webviews, review queues, favorites, captures, console state, narrow toolbars, and divider width intact across collapsed, split, and fullscreen transitions.
- Make Needs Attention queue `OPEN` activate its session, restore a shut browser, and reveal the review queue without navigating to or consuming the queued preview.
- Preserve the existing collapse control and Command-Shift-B behavior, including shutting the browser directly from fullscreen into the terminal-focused collapsed layout.

## GBlockParty Chromux v0.59.1

Tag: `chromux-v0.59.1`

- Show the existing Working spinner immediately after every Codex prompt submission while retaining the internal update-blocking **Awaiting agent activity** state.
- Keep pending turns outside the Threads Working section until provider activity is observed, preserving Working membership as provider-confirmed evidence.
- Preserve `/clear` composer-redraw resolution, stale-completion rejection, disabled-indicator behavior, and unchanged Claude and Grok turn handling.

## GBlockParty Chromux v0.59.0

Tag: `chromux-v0.59.0`

- Show `CHECKING…`, `READY`, or `SERVER OFFLINE` on queued loopback previews using bounded TCP-only IPv4/IPv6 probes that reject credentials and remote hosts.
- Offer `RECHECK` and an anchored `START SERVER…` launcher for offline previews, resolving only validated npm, pnpm, yarn, or bun package scripts and running the chosen script in a visible non-focused shell tab.
- Keep browser navigation approval-gated, poll launched servers for 15 seconds, and return failed main-frame loopback loads to the queue while preserving their browser tabs for an explicit `OPEN` retry.
- Reprobe restored queue entries without persisting runtime liveness, launcher state, timers, or server-shell relationships.

## GBlockParty Chromux v0.58.7

Tag: `chromux-v0.58.7`

- Transfer a Codex `$skill` completion into Compose after Tab even when the active rendered prompt omits shortcut, context, and frame chrome.
- Require a session-scoped Tab intent and a strict extension of the same `$` token before trusting an otherwise ambiguous prompt, preserving conservative fallback behavior for unrelated terminal output.
- Invalidate completion intent after further input or session termination, preserve following and narrow-wrapped prompt text, and keep Unicode and 64 KiB draft bounds intact.

## GBlockParty Chromux v0.58.6

Tag: `chromux-v0.58.6`

- Make `⌘1` through `⌘9` target the visible primary group-tab order while grouped mode is enabled, restoring each destination group’s remembered session on entry.
- Cycle through a selected group’s visible lower session tabs on repeated presses, including wraparound and stable one-session groups; leave empty group slots inactive.
- Preserve global session-index switching in flat mode and update Developer Mode shortcut diagnostics to distinguish group targets from session targets.

## GBlockParty Chromux v0.58.5

Tag: `chromux-v0.58.5`

- Keep xterm-generated OSC replies, including OSC 10/11 color reports, out of pending terminal input and Compose drafts.
- Recognize BEL, `ESC \`, and C1 OSC/ST forms across repeated or adjacent replies while preserving ordinary editable text around them.
- Continue forwarding the original terminal input bytes to the PTY unchanged, preserving terminal protocol behavior and existing input editing semantics.

## GBlockParty Chromux v0.58.4

Tag: `chromux-v0.58.4`

- Preserve grouped session and aggregate group tab DOM identity across title, hover, badge, and status updates so Working spinner animations continue without restarting.
- Update hover-only marquee state without rebuilding grouped tabs, keeping pointer targets mounted so lower session-tab clicks reliably activate their corresponding terminals.
- Reconcile grouped tabs by stable identity, remove duplicate badge-triggered renders, and cover animation, DOM, hover, and activation continuity in the Electron renderer regression suite.

## GBlockParty Chromux v0.58.3

Tag: `chromux-v0.58.3`

- Keep the GitHub Releases API as the primary update source, then recover from rate limits, server errors, timeouts, DNS failures, and other request errors through GitHub's public latest-release redirect.
- Accept only an exact HTTPS GitHub redirect to a stable `chromux-vX.Y.Z` release in the canonical Chromux repository, while leaving custom `CHROMUX_RELEASES_URL` JSON endpoints unchanged.
- Stop caching transient network errors for one day and ignore legacy cached failures so update checks retry automatically; retain the existing renderer and IPC status contract.

## GBlockParty Chromux v0.58.2

Tag: `chromux-v0.58.2`

- Put each submitted Codex turn into an update-blocking **Awaiting agent activity** state without showing a Working spinner or placing it in the Working section.
- Start Working only from a Braille-prefixed Codex title or meaningful terminal output, and finish from the stable title or an idle composer redraw; focused finishes become Idle while background finishes retain one completion notice.
- Remove all `/clear` parsing, autocomplete intent, and rendered-command session state while preserving generation invalidation, stale-completion rejection, title/spinner continuity, and unchanged Claude/Grok lifecycle behavior.

## GBlockParty Chromux v0.58.1

Tag: `chromux-v0.58.1`

- Keep a Tab-autocompleted Codex `/clear` submission Idle even when Enter reaches Chromux before Codex redraws the expanded command.
- Retain the existing `/clear` generation advance, stale-completion barrier, and next-prompt re-arming while invalidating transient autocomplete intent after edits, controls, ambiguous menus, arguments, unrelated commands, submission, or session replacement.
- Exercise both PTY redraw orders plus ambiguous, edited, argument-bearing, unrelated-command, and non-Codex paths in the real-xterm turn-signal regression suite.

## GBlockParty Chromux v0.58.0

Tag: `chromux-v0.58.0`

- Add opt-in two-level session navigation with custom groups first and exact normalized working-directory groups after them, preserving session-open order, last-active focus, searchable/keyboard activation, horizontal overflow, and the existing flat tab bar by default.
- Add persistent custom-group creation, validation, rename, deletion, and context-menu moves; empty groups remain manageable in Settings, while nonempty group deletion returns sessions to automatic directory grouping.
- Aggregate session count, highest-priority status, and attention/queue badges on group tabs, and upgrade restart snapshots to schema v8 for custom membership, exact active session, and per-group last-active restoration while retaining schema v1–v7 compatibility.

## GBlockParty Chromux v0.57.0

Tag: `chromux-v0.57.0`

- Show every projected session reason in a visible **Needs Attention** band between a terminal preview’s header and live terminal mirror.
- Preserve priority order, semantic labels and colors, full expanded details, restored records, and queued-preview URLs while keeping preview clicks summary-only and action-free.
- Live-sync open previews as attention changes, include the summary in the accessible description, and cap the independently scrolling band at 100px, 140px, or 180px while preserving at least 120px for the terminal.

## GBlockParty Chromux v0.56.2

Tag: `chromux-v0.56.2`

- Simplify Needs Attention session cards so the highest-priority reason appears once in the header, followed by `+N` when more reasons are present.
- Remove the separate session-status icon and repeated primary-reason label while preserving accessible status descriptions, direct actions, ordering, counts, previews, and keyboard behavior.
- Keep additional reasons identifiable with semantic colors and labels, and allow attention summaries to wrap to two lines before truncation.

## GBlockParty Chromux v0.56.1

Tag: `chromux-v0.56.1`

- Make the saved-project renderer regression wait for the server URL approval-queue outcome instead of relying on a fixed startup delay.
- Keep the same ten-second failure bound so a missing project session or URL discovery still fails with the original behavioral assertions.
- Publish the refreshed GIGACHADD integration-map artifact review and alignment index entry while preserving its Stage 2 approval boundary.

## GBlockParty Chromux v0.56.0

Tag: `chromux-v0.56.0`

- Keep a focused session in **Needs Attention** while its live turn requires input, permission, authentication, rate-limit handling, or tool-failure handling.
- Preserve the amber Action Required status, active-row interaction, attention count, and deduplication from Working and working-directory groups.
- Continue suppressing focused completions, browser queues, delivery failures, acknowledged actions, and restored historical records; move the session normally when its turn resumes or resolves.

## GBlockParty Chromux v0.55.0

Tag: `chromux-v0.55.0`

- Shrink the Threads-header Detect action to the same compact height as the existing thread-order control.
- Move thread ordering below the header into an icon-only funnel toggle while preserving persisted Recent/A–Z behavior, keyboard focus, tooltips, and accessible current-state labels.
- Collapse the filter toolbar in Git Changes and preserve the compact layout across every supported theme and light/dark appearance.

## GBlockParty Chromux v0.54.1

Tag: `chromux-v0.54.1`

- Resolve an exact `/clear` submission when Codex dispatches the uniquely matching visible autocomplete candidate while its rendered composer still shows a prefix such as `/cl`.
- Route autocomplete-dispatched `/clear` through the existing authoritative Idle boundary, stale-completion barrier, shared tab/Threads/diagnostics/update-safety projection, and next-prompt re-arming without changing ambiguous menus, arguments, unrelated slash commands, non-Codex input, direct typing, or Chromux composer submission.
- Exercise the live prefix-plus-popup behavior in real xterm fixtures and isolate the Grok warning renderer test from the user's live Chromux profile so the complete prototype matrix cannot restore unrelated sessions during verification.

## GBlockParty Chromux v0.54.0

Tag: `chromux-v0.54.0`

- Enrich resumable Codex DETECT rows through a bounded, short-lived local app-server scan with the inferred thread's representative name and latest-agent-message excerpt.
- Keep resume selection exact-directory and newest-interactive-thread based, retain terminal/process metadata and search/accessibility coverage, and use the representative name for new resumed tabs with existing uniqueness suffixes.
- Preserve the rollout-file resume identity fallback when Codex is missing, slow, malformed, or lacks the required methods; excerpts remain transient and never enter restore snapshots.

## GBlockParty Chromux v0.53.0

Tag: `chromux-v0.53.0`

- Preview any inactive ordinary, Working, or Needs Attention thread after a 250 ms pointer hover or immediately on keyboard focus, without moving focus into the non-modal preview region.
- Keep the live terminal preview open across row-to-preview movement with a 150 ms exit grace; Escape closes from the focused row, while outside click and existing lifecycle dismissal remain available.
- Activate every Threads session with one row click, revealing its tab and restoring terminal or composer focus, while retaining preview-click activation, active-row confirmation, inline attention actions, live preview refresh, and title-stable Working rows.

## GBlockParty Chromux v0.52.2

Tag: `chromux-v0.52.2`

- Classify a standalone Codex submission from the rendered prompt before Enter, falling back to the keystroke shadow when the rendered editor cannot provide a trustworthy nonempty semantic value, so autocomplete and history edits cannot hide an exact `/clear`.
- Preserve the existing idle boundary, generation invalidation, stale-completion barrier, and next-prompt re-arming for rendered `/clear` submissions without changing arguments, other slash commands, non-Codex sessions, combined paste submissions, or multiline composer behavior.
- Keep animated Codex title frames from moving Recent Threads rows or restarting Working spinners, while retaining mounted-row A–Z reordering when the normalized display label genuinely changes.

## GBlockParty Chromux v0.52.1

Tag: `chromux-v0.52.1`

- Treat exact whitespace-trimmed Codex `/clear` submissions as an authoritative idle boundary, immediately removing the session from Working and projecting Idle through tabs, Threads, attention, diagnostics, and update safety.
- Advance the cleared turn generation, remove stale turn metadata, and suppress delayed rendered or native completion signals so cleared work cannot reappear.
- Re-arm the normal working and completion lifecycle on the next ordinary prompt while leaving `/clear` with arguments, other slash commands, and non-Codex sessions unchanged.

## GBlockParty Chromux v0.52.0

Tag: `chromux-v0.52.0`

- Default Threads to a persisted **Recent** order with a compact, keyboard-accessible **RECENT** / **A–Z** header toggle that stays hidden in Git Changes.
- Track deliberate per-session activity on creation or focus, submitted terminal/composer input, and real turn-state transitions without letting streaming PTY output or duplicate signals jump rows.
- Sort Working rows, directory groups, and contained sessions by newest activity in Recent mode; alphabetize directory and session display labels in A–Z mode with deterministic label, cwd, and session-ID tie-breakers.
- Preserve Chromux Update and Needs Attention urgency ordering, and upgrade restore snapshots to schema v7 while keeping schemas v1-v6 readable through shared snapshot-time fallback activity.

## GBlockParty Chromux v0.51.0

Tag: `chromux-v0.51.0`

- Give every terminal session a compact paired-browser tab strip with page-local history, title, console, capture, and picker state while preserving one persistent Chromium partition per session.
- Route plain and OSC 8 terminal HTTP(S) links, approved queue items, favorites, and project HTML selections into new-or-focused foreground tabs with normalized URL deduplication; unsafe schemes remain inactive and page popups stay approval-gated.
- Add a project-scoped HTML explorer with Git-root fallback, live-PTY/launch/project path resolution, unique repository fallback, folder navigation, filtering, URL-field autocomplete, refresh, and safe encoded `file://` URLs.
- Restore ordered page tabs and explorer path/query lazily through schema-v6 snapshots while migrating legacy `currentUrl` snapshots into one active page tab.

## GBlockParty Chromux v0.50.2

Tag: `chromux-v0.50.2`

- Hide “↓ SKIP TO BOTTOM” when native xterm viewport scrolling reaches the physical bottom, including scrollbar dragging and other DOM scroll paths that do not emit xterm's public scroll event.
- Keep saved terminal viewport state and the one-page skip-control threshold synchronized with native viewport scrolling.
- Extend the real-Electron terminal scroll suite with native viewport bottom and upward-threshold coverage.

## GBlockParty Chromux v0.50.1

Tag: `chromux-v0.50.1`

- Keep exact `/clear` submissions and subsequent unsubmitted typing idle instead of inferring a new Codex turn.
- Track submitted Codex turns with a monotonic generation so a delayed terminal-render callback cannot complete newer work.
- Require the rendered composer fallback to observe a busy post-submission render before accepting the composer's return as completion, while retaining native completion notifications as authoritative and the explicit rate-limit chooser as a conservative terminal state.
- Project the corrected shared turn state consistently through tabs, Threads, attention, diagnostics, and update safety.

## GBlockParty Chromux v0.50.0

Tag: `chromux-v0.50.0`

- Double-click any session row in Threads to activate it in the terminal area, reveal its tab, and restore terminal or composer focus.
- Keep the first and second clicks immediate: inactive rows can show the read-only terminal preview during the gesture, and completed double-click activation dismisses it.
- Apply the same activation path to ordinary, Working, and Needs Attention rows while preserving inline attention actions, active-row confirmation, preview activation, and title-stable row DOM.

## GBlockParty Chromux v0.49.0

Tag: `chromux-v0.49.0`

- Transfer the current Codex prompt editor value into COMPOSE from the cursor-anchored xterm buffer, capturing accepted autocomplete expansions, history recall, cursor edits, Unicode, intentional newlines, and visual wrapping.
- Use the same resolved prompt value for empty-draft insertion and Append, Replace, Copy, and Dismiss conflict outcomes while preserving the 64 KiB UTF-8 and clipboard boundaries.
- Exclude prompt chrome, placeholders, borders, autocomplete menus, unrelated output, and stale submitted rows; retain the session-local keystroke model as a conservative fallback and leave ambiguous live Codex input uncleared.
- Keep Claude, Grok, and shell transfer behavior unchanged and add real-Electron coverage for rendered extraction, ambiguity, overflow, exited sessions, conflicts, and non-Codex fallback.

## GBlockParty Chromux v0.48.1

Tag: `chromux-v0.48.1`

- Keep working Threads spinner nodes mounted while ordinary characters, terminal controls, and other unsubmitted input update the live terminal draft.
- Continue tracking pending terminal input and preview suppressions without rebuilding unrelated sidebar state when turn state does not change.
- Preserve the existing submitted-input transition to Working, including the expected Threads render when status or group membership changes.

## GBlockParty Chromux v0.48.0

Tag: `chromux-v0.48.0`

- Check Codex once per Chromux launch, hold every fresh or restored Codex session behind one workspace decision, and continue restoring Claude, Grok, and shell sessions immediately.
- Follow Codex's stable release-source policy for Homebrew, npm-compatible, and standalone installs; cache successful checks for one hour, bound failures and progress, require explicit update confirmation, and verify the installed version before releasing queued sessions.
- Suppress Codex's native startup update prompt only inside Chromux with the official process-scoped configuration override, including fresh, resumed, restored, Detect, and recognized shell launches.
- Offer one aggregated prompt with release notes, retry, verified update, and launch-local Resume Anyway paths while preserving the existing per-session warning for genuine Codex resume failures.

## GBlockParty Chromux v0.47.0

Tag: `chromux-v0.47.0`

- Pin every live session with an agent turn in progress in an always-expanded `WORKING` section in Threads.
- Update the section immediately as turns start, finish, or sessions close, while keeping working sessions out of duplicate working-directory groups.
- Preserve higher-priority Needs Attention visibility and add real-Electron coverage for complete membership, deduplication, and removal.

## GBlockParty Chromux v0.46.0

Tag: `chromux-v0.46.0`

- Move a session's pending editable terminal line into an empty composer when it opens, preserving Unicode and common cursor/edit controls while clearing the live PTY line exactly once.
- Resolve terminal-input/draft conflicts with accessible Append, Replace, Copy, and Dismiss choices; Copy uses a main-process-enforced 64 KiB clipboard bridge and leaves both sources intact.
- Add an `EXPAND` / `COLLAPSE` composer control between History and Close so the editor can replace the terminal body, retain per-session state and history, and restore xterm scrollback position on collapse.
- Reset expansion on Close or Escape and add real-Electron coverage for transfer, conflicts, bounds, exited and independent sessions, shortcuts, focus, history, themes, and viewport preservation.

## GBlockParty Chromux v0.45.0

Tag: `chromux-v0.45.0`

- Preserve session-scoped Needs Attention reasons through managed updates, Developer Mode restarts, and app-close workspace restores.
- Label restored reasons as `Before restart`, keep them separate from resumed live turn state, consume historical completion on thread open, and retain other historical reasons until dismissal.
- Upgrade restore snapshots to bounded schema v5 records while retaining schema v1-v4 readability and excluding browser-queue duplication and global update rows.
- Add main-process validation and renderer coverage for bounds, malformed records, stable identifiers, mixed historical/live attention, completion consumption, dismissal, queue exclusion, update exclusion, and failed-delivery persistence.

## GBlockParty Chromux v0.44.2

Tag: `chromux-v0.44.2`

- Keep Threads rows clickable while working agents animate their terminal titles by synchronizing presentation metadata in place instead of rebuilding the rail.
- Keep row text, tooltip, ARIA status, and an open terminal-preview heading synchronized without changing inactive preview-first or no-preview direct-activation behavior.
- Give every Needs Attention card its own boundary with 6px separation and inset padding across all four themes in Light and Dark modes.
- Add real-Electron coverage for DOM-node preservation, pointer continuity, title/status synchronization, inline action isolation, and attention-card geometry.

## GBlockParty Chromux v0.44.1

Tag: `chromux-v0.44.1`

- Keep the focused session tab fully visible when Threads, search, attention actions, keyboard shortcuts, or other programmatic navigation activate an off-screen session.
- Reveal tabs minimally in either direction while preserving the current horizontal scroll position whenever the focused tab is already visible.
- Respect the sticky Search/Add action boundary so a newly focused tab and its controls are not hidden underneath the action group.
- Add real-renderer coverage for right and left reveals, sticky-control clearance, and the visible-tab no-op.

## GBlockParty Chromux v0.44.0

Tag: `chromux-v0.44.0`

- Remove Codex's leading animated Braille title frame from every Chromux-presented session label while preserving raw OSC title data and falling back to the launch name.
- Project tab, Threads, tooltip, ARIA, preview, search, and diagnostic status from one shared session-status model with red exit, amber action-required, cyan working, green completed, gray idle, and green live indicators.
- Keep exit and action-required indicators visible when activity indicators are disabled, and animate tab and Threads working spinners with the same reduced-motion-safe keyframes.
- Add renderer coverage for title frames, provider state agreement, single-indicator rendering, disabled preferences, status precedence, animation, and diagnostics.

## GBlockParty Chromux v0.43.1

Tag: `chromux-v0.43.1`

- Center the paired-browser `BROWSER` and `COLLAPSE` rail controls vertically across the full-height 40px rail.
- Keep the entire rail clickable while preserving its icon, vertical label, colors, hover behavior, browser state, shortcuts, and narrow-toolbar access.
- Add real-renderer geometry coverage for full-height hit area and centered visible content in both open and shut states.

## GBlockParty Chromux v0.43.0

Tag: `chromux-v0.43.0`

- Make Threads the default unified session rail and migrate saved Attention or invalid rail preferences, leaving Git Changes as the only alternate mode.
- Pin managed Chromux Update status above an expanded Needs Attention section, aggregate every outstanding reason and action into one attentive thread, and keep attentive sessions out of their working-directory groups until the final reason clears.
- Move the individual outstanding-item badge to Threads while preserving attention priority, update safety, acknowledgements, previews, active-session confirmation, keyboard access, and direct inline actions.
- Update diagnostics, accessibility copy, documentation, and focused renderer coverage for the unified two-mode rail.

## GBlockParty Chromux v0.42.0

Tag: `chromux-v0.42.0`

- Add an on-demand multiline composer to Codex, Claude, Grok, and shell panes with `Command+Shift+Enter` open/submit, newline editing, per-session drafts, xterm-native paste/input submission, shell multiline confirmation, and safe exited-session behavior.
- Add local per-project prompt history with scratch-preserving `Option+Up` / `Option+Down` recall, search, full-prompt reuse, deletion, clearing, deduplication, atomic `0600` persistence, per-project retention, and a global 5 MiB cap.
- Upgrade managed restore snapshots to schema v4 with bounded composer drafts while retaining legacy readability, leaving restored composers closed, and keeping the xterm helper textarea untouched.
- Document local plaintext storage and the ordered roadmap for normalized agent interactions, Codex App Server, structured controls, and a future lazy-loaded Monaco adapter.

## GBlockParty Chromux v0.41.1

Tag: `chromux-v0.41.1`

- Keep every rendered terminal row above the pane's lower boundary by moving the existing visual inset onto xterm's FitAddon-aware element.
- Preserve the terminal's 6px vertical inset while allowing FitAddon to choose one fewer row at boundary heights.
- Cover real xterm geometry across row-boundary heights, bottom scrolling, repeated tab activation, browser layout changes, and explicit refits.

## GBlockParty Chromux v0.41.0

Tag: `chromux-v0.41.0`

- Add an explicit quiet `idle` turn state: unseen background completions retain their checkmark and Attention row until viewed or dismissed, while visible completions transition directly to Idle and submitted input returns Idle to Working.
- Recover missed Codex completion notifications only after xterm finishes rendering a recognized Codex composer at the cursor, retaining the native `agent-turn-complete` hook as authoritative and recording terminal recovery as low confidence.
- Make Developer Mode attention diagnostics rail-aware so Threads and Git report `NOT MOUNTED` without false mismatches, while genuine Attention DOM drift remains highlighted.
- Treat Idle sessions as update-safe and preserve exited-session indicator precedence.

## GBlockParty Chromux v0.40.0

Tag: `chromux-v0.40.0`

- Replace the browser-toolbar collapse control with a permanent 40px rail at the paired pane's far-right edge in both open and shut states.
- Label the shut-state rail `BROWSER` with a decorative left-opening panel icon, while retaining accessible open/shut names and `COLLAPSE` in the open state.
- Preserve per-session browser state, saved split width, divider behavior, terminal refitting, URL-driven and terminal-link reopening, Command+Shift+B, and narrow-toolbar access through Capture.

## GBlockParty Chromux v0.39.1

Tag: `chromux-v0.39.1`

- Preserve each tab's exact normal-buffer terminal viewport across tab activation and terminal fitting.
- Keep scrolled-back inactive tabs fixed on their saved content while new output arrives, while tabs already at the bottom continue following output.
- Retain viewport position through browser layout changes, divider and observer-driven resizing, and alternate-screen applications without changing skip-to-bottom behavior.

## GBlockParty Chromux v0.39.0

Tag: `chromux-v0.39.0`

- Add one live, read-only xterm preview when an inactive Threads row is selected, preserving ANSI colors, wrapping, recent scrollback, and alternate-screen state without changing the active session or source viewport.
- Open the previewed session by clicking anywhere in the popover or using Enter/Space; dismiss on Escape, outside click, mode changes, hidden anchors, session closure, or activation through another route.
- Confirm clicks on the already-active Threads row with a linked row and terminal-pane cue, including repeatable and reduced-motion treatments.
- Add accessible current/expanded state, viewport clamping, fully opaque theme-specific preview surfaces, and lifecycle/geometry coverage across all eight theme appearances.
- Default to a more readable Comfortable popover and add persisted Compact, Comfortable, and Large preview sizes for vision accessibility without changing source terminal wrapping.

## GBlockParty Chromux v0.38.0

Tag: `chromux-v0.38.0`

- Add a floating, bottom-centered `↓ SKIP TO BOTTOM` control after a terminal is at least one visible page behind its newest output.
- Smoothly follow the current end of scrollback without interrupting a user's scrolled-back viewport when new PTY output arrives; reduced-motion mode jumps immediately.
- Keep scroll state independent per session, suppress the control in alternate-screen and no-scrollback buffers, cancel animations on user interaction or disposal, and return focus safely to the active terminal.

## GBlockParty Chromux v0.37.0

Tag: `chromux-v0.37.0`

- Replace the Git session hierarchy with a dedicated working-copy diff tracker grouped only at the repository level.
- Show changed file paths and statuses, staged markers, and repository staged/unstaged totals, including untracked and conflicted files.
- Refresh Git changes automatically while the rail view is selected, while keeping Threads responsible for session navigation by working directory.

## GBlockParty Chromux v0.36.1

Tag: `chromux-v0.36.1`

- Vertically center the 9px horizontal session scrollbar with approximately 3px of visible clearance above and below it across every theme.
- Keep the scrollbar lane permanently reserved so tab-strip and terminal geometry remain stable as horizontal overflow appears and disappears.
- Preserve session-tab heights, sticky search/add actions, horizontal scrolling behavior, and all vertical scrollbar styling.

## GBlockParty Chromux v0.36.0

Tag: `chromux-v0.36.0`

- Add persisted icon-only Attention, Threads, and Git rail modes while retaining horizontal session tabs as the primary navigator.
- Keep unseen background completions in Attention until their session is opened, without clearing actionable agent states or completed tab status.
- Group live Threads by exact working directory and Git sessions by validated repository root, with accessible status icons and a final non-repository group.

## GBlockParty Chromux v0.35.0

Tag: `chromux-v0.35.0`

- Add session search by dynamic title, launch name, agent, or working directory, with keyboard navigation and one-click activation.
- Keep search and add-session controls together at the editor's right inset while session tabs scroll beneath them.
- Preserve scroll-end clearance so the right-most session tab and its close button remain fully reachable.

## GBlockParty Chromux v0.34.0

Tag: `chromux-v0.34.0`

- Add a persistent Prevent Sleep switch in Settings that runs macOS `caffeinate -dims` while enabled.
- Tie the managed assertion to the Chromux process, stop it when the switch is disabled or Chromux quits, and report launch failures in Settings.

## GBlockParty Chromux v0.33.3

Tag: `chromux-v0.33.3`

- Preserve each tab's exact Claude, Codex, or Grok conversation across app, update, and Developer Mode restarts, including multiple tabs in the same directory.
- Reserve exact conversation IDs before assigning distinct newest-first candidates to legacy snapshots, and disclose every best-effort match at startup.
- Validate provider identity fields inside authenticated turn-signal envelopes and persist them in backward-compatible restore snapshot schema v3.

## GBlockParty Chromux v0.33.2

Tag: `chromux-v0.33.2`

- Keep Streak attention cards and their `VIEW`/`DISMISS` hit-test rectangles fixed while hovered or pressed.
- Preserve tactile action feedback with stable border depth, border-color changes, and inset shadows instead of geometric translation.
- Cover boundary clicks with native Electron pointer input so background activation and dismissal complete on the first click.

## GBlockParty Chromux v0.33.1

Tag: `chromux-v0.33.1`

- Reserve a permanent 9px lane beneath session tabs for the existing horizontal scrollbar.
- Keep tab dimensions and terminal-stage positioning stable as horizontal overflow appears or disappears across all four theme families.

## GBlockParty Chromux v0.33.0

Tag: `chromux-v0.33.0`

- Add a host-wide, user-only Unix-socket resource broker shared by Chromux and local Codex sessions, with on-demand startup and an optional LaunchAgent.
- Add MCP tools for resource state, atomic FIFO acquisition, queued-request waiting and cancellation, lease renewal and release, editable external-client names, and lease-validated Simulator operations.
- Recover abandoned work on disconnect, TTL expiry, or daemon restart without resurrecting unverifiable leases; serialize multi-resource requests without blocking unrelated resources.
- Add a Resources view with owners, expirations, queued agents, wait times, simulator capacity overrides, cancellation, force release, and cooperative-enforcement warnings.
- Apply conservative elastic Simulator admission and idle-drain hysteresis, and isolate every paired browser in a unique persistent partition.
- Add global Codex guidance for preferring the built-in Browser and acquiring `macos:foreground-input` before Computer Use.

## GBlockParty Chromux v0.32.0

Tag: `chromux-v0.32.0`

- Add an always-expanded, read-only attention diagnostics strip with independent session inspection, expected/tracked/queue/tab comparisons, mismatch highlighting, and a sanitized newest-first event trail.
- Keep stable packaged launches in standard mode by default while enabling diagnostics for interactive unpackaged development; explicit runtime flags override the persisted Developer Mode preference.
- Add a Developer Mode switch in Settings that confirms when sessions are open, saves a restore snapshot, restarts Chromux with the selected mode, and restores resumable sessions through the existing startup flow.

## GBlockParty Chromux v0.31.1

Tag: `chromux-v0.31.1`

- Vertically center the native macOS traffic-light controls with the Chromux brand row across Blueprint, Retro-OS, Streak, and Liquid Glass.
- Recalculate the native-control position when switching theme families while preserving every theme's existing header geometry and spacing.
- Validate renderer-provided window-button coordinates before applying them through Electron's macOS window API.

## GBlockParty Chromux v0.31.0

Tag: `chromux-v0.31.0`

- Mark the tab context-menu action for Grok Build with a warning triangle and show the full data-security advisory before opening it.
- Require a fresh, explicit dangerous-action acknowledgement before Grok Build can launch from either the new-session modal or a tab context menu.

## GBlockParty Chromux v0.30.5

Tag: `chromux-v0.30.5`

- Add a consistent 6px gap between neighboring session tabs and the add-session button.
- Preserve the add-session button's left alignment when the tab strip is empty.

## GBlockParty Chromux v0.30.4

Tag: `chromux-v0.30.4`

- Give the shared tab context menu a fully opaque, theme-specific surface in all four themes and both brightness modes.
- Render duplicate, cross-agent, and close action labels and details in black for Light mode and white for Dark mode.
- Verify real right-click menus across all eight appearances for opaque backgrounds and WCAG AA text contrast.

## GBlockParty Chromux v0.30.3

Tag: `chromux-v0.30.3`

- Stop Codex tab spinners when a missed notifier is followed by an ANSI-rich composer redraw, including redraws split across terminal chunks.
- Reset completion authority between submitted Codex turns while preserving authenticated event ordering and duplicate rejection across the session.
- Fall back to the legacy completion signal only when Codex notification classification or terminal delivery fails; malformed and unrelated notifications remain ignored.

## GBlockParty Chromux v0.30.2

Tag: `chromux-v0.30.2`

- Add breathing room between the add-session button and the session tab immediately to its left while preserving theme-specific tab spacing.

## GBlockParty Chromux v0.30.1

Tag: `chromux-v0.30.1`

- Keep completed and waiting agent sessions idle when terminal focus reporting, navigation keys, tabs, mouse sequences, or unsubmitted typing emit input.
- Start input-inferred working activity only after a prompt is submitted with Enter, while preserving native Claude and Grok turn-start signals.

## GBlockParty Chromux v0.30.0

Tag: `chromux-v0.30.0`

- Keep the add-session button directly beside the right-most session tab instead of pinning it to the far edge of the window.
- Place the add-session button at the left edge of the tab strip when no sessions are open.

## GBlockParty Chromux v0.29.0

Tag: `chromux-v0.29.0`

- Show an animated spinner in each live session tab while its agent turn is working and a checkmark when the turn completes.
- Keep exited sessions red and all other attention states on the existing lifecycle dot, with activity indicators visible on active and background tabs.
- Add an enabled-by-default, locally persisted “Show tab activity indicators” switch in Settings.
- Respect reduced-motion preferences and expose each tab's activity status through its accessible label and tooltip.

## GBlockParty Chromux v0.28.4

Tag: `chromux-v0.28.4`

- Keep the focused terminal input helper visually transparent so it cannot cover xterm's scrollbar.
- Scope textarea form styling directly to capture notes while preserving normal terminal keyboard, IME, selection, and context-menu behavior.
- Exercise a real focused xterm with scrollback across all four themes in Light and Dark modes.

## GBlockParty Chromux v0.28.3

Tag: `chromux-v0.28.3`

- Keep active terminal-tab labels readable in Streak Dark by preserving the high-contrast active background.
- Align the Streak attention-queue heading with its empty-state card.

## GBlockParty Chromux v0.28.2

Tag: `chromux-v0.28.2`

- Repaint every live terminal viewport immediately after changing the theme or Light/Dark mode so the active prompt, typed input, and cursor use the selected palette.
- Preserve terminal contents, scrollback, input, focus, session state, and PTY/TUI processes while applying the visual update.
- Ignore incomplete, mocked, or disposed terminal sessions safely during theme changes.

## GBlockParty Chromux v0.28.1

Tag: `chromux-v0.28.1`

- Give Streak theme buttons a tactile half-press on hover and a full press while active.
- Apply the interaction consistently to primary, toolbar, queue, session-tab, and theme-card controls while leaving disabled buttons still.
- Respect reduced-motion preferences by keeping the visual states while removing their transitions.

## GBlockParty Chromux v0.28.0

Tag: `chromux-v0.28.0`

- Add independently selectable and persisted Light and Dark modes to Blueprint, Retro-OS, Streak, and Liquid Glass.
- Match the embedded terminal palette and native control color scheme to every theme and brightness combination.
- Make Liquid Glass Light the default appearance for users who have not already selected a theme.
- Expand theme interaction, contrast, persistence, and screenshot coverage from four appearances to all eight combinations.

## GBlockParty Chromux v0.27.1

Tag: `chromux-v0.27.1`

- Execute a queued managed update directly from the attention queue instead of focusing a blocker session.
- Require explicit warning confirmation before executing or dismissing a queued update.
- Accept the first click while the macOS window is inactive so attention actions do not require a second click.

## GBlockParty Chromux v0.27.0

Tag: `chromux-v0.27.0`

- Open terminal URLs and local HTML links in the same session's paired browser with a normal click; no Command or Control modifier is required.
- Restore a shut paired browser automatically when a terminal link is clicked.

## GBlockParty Chromux v0.26.4

Tag: `chromux-v0.26.4`

- Add a consistent left gutter between the Streak terminal stage and attention queue rail.
- Match the Streak Settings header button height to the neighboring status gauges.
- Keep Chromux form styling off xterm's hidden helper textarea so it no longer overlaps the terminal scrollbar.

## GBlockParty Chromux v0.26.3

Tag: `chromux-v0.26.3`

- Use the canonical three-node Chromux logo on the starting screen instead of the unrelated triangle glyph.
- Remove the Agent Cockpit badge from the top header.

## GBlockParty Chromux v0.26.2

Tag: `chromux-v0.26.2`

- Install an available managed update immediately when Chromux has no open sessions and no projected attention items.
- Skip the intermediate `UPDATE READY` queue item, restart confirmation, and empty restore snapshot for that idle-workspace fast path.
- Preserve staged updates, blocker focus, restart protection, restore snapshots, retries, and manual-release handling whenever the workspace is not eligible for immediate installation.

## GBlockParty Chromux v0.26.1

Tag: `chromux-v0.26.1`

- Restore Blueprint filled-control backgrounds so dark on-accent labels no longer render directly over blue surfaces.
- Centralize on-accent foreground colors and improve contrast for Streak selected, badge, and active-session states plus Liquid Glass selected-theme checks.
- Add WCAG AA contrast regression coverage for primary buttons, update/armed controls, queue and shortcut badges, theme selection, and active-session surfaces across all four themes.

## GBlockParty Chromux v0.26.0

Tag: `chromux-v0.26.0`

- Add four complete, clickable Chromux appearance directions—Blueprint, Retro-OS, Streak, and Liquid Glass—while preserving the shared terminal, browser, queue, capture, and settings behavior.
- Add a visual theme picker to Settings with instant switching, a clear selected state, and local persistence across app restarts.
- Match the embedded terminal palette to the selected cockpit theme, add Electron interaction coverage for selection and persistence, and provide a deterministic four-theme screenshot capture command for visual review.

## GBlockParty Chromux v0.25.1

Tag: `chromux-v0.25.1`

- Display a prominent data-security warning whenever Grok Build is selected for a new session, noting that the CLI may transmit codebase files, Git history, and secrets to xAI-controlled infrastructure, with direct links to the reproducible wire-level research, independent reporting, and xAI's current privacy guidance.
- Advise users handling proprietary, regulated, or sensitive code to review xAI's current data controls and consult a cybersecurity or data-security professional before use.
- Document that Chromux launches the separately installed Grok CLI unchanged and cannot verify, restrict, or audit its provider-side transfers.

## GBlockParty Chromux v0.25.0

Tag: `chromux-v0.25.0`

- Present all thirty-six fixed 1440×900 desktop concepts through a shared scale-to-fit viewer that centers the complete design at narrower viewport sizes without document overflow.
- Preserve every clean `/designs/<slug>` route and page title while moving unchanged iframe sources to the internal `/designs/raw/` build directory.
- Route the local desktop gallery through the same allowlisted viewer, retain unchanged mobile gallery routing, and add route, viewport, overflow, focus, modal, and visual regression coverage.

## GBlockParty Chromux v0.24.2

Tag: `chromux-v0.24.2`

- Restore direct-file navigation from `design-prototypes/index.html` to all thirty-six sibling design mockups.
- Preserve clean `/designs/*` production URLs by translating the local links only in the generated website artifact.
- Extend website route regression coverage to verify both direct-file gallery links and deployed clean routes.

## GBlockParty Chromux v0.24.1

Tag: `chromux-v0.24.1`

- Close the mobile-gallery release audit with an explicit ship-ready verdict for the seven static prototypes and document the intentionally non-functional interaction boundary.
- Remove the stale root Electron `main.js`; `prototype/main.js` remains the sole packaged Electron entrypoint.
- Verify the generated mobile gallery and its seven clean production routes, including content, clean-URL behavior, and security headers.

## GBlockParty Chromux v0.24.0

Tag: `chromux-v0.24.0`

- Add twenty new desktop design-refresh prototypes (17–36) to the design gallery: Mission Patch, Cartographer, Darkroom, Bauhaus Console, Library Stacks, Analog Synth, Air-Traffic Control, Executive Glass, Comic Control Room, Field Notebook, Broadcast Studio, Museum Archive, Kinetic Typography, Cybernetic Organism, Medieval Scriptorium, Financial Terminal, Japanese Station System, Thermal Industrial, Soundstage Blueprint, and Chromatic Shadow.
- Each variation is a self-contained static mockup of the full main window rendering the shared `design-prototypes/SPEC.md` app state, so all thirty-six directions remain directly comparable.
- Publish the new batch as clean `/designs/*` routes on the static site and extend the website route regression test to cover all 36 design routes.

## GBlockParty Chromux v0.23.0

Tag: `chromux-v0.23.0`

- Add seven mobile Chromux interaction prototypes (Mission Control, Agent Inbox, Browser Field Kit, Timeline / Black Box, Deck of Agents, Command Lens, Remote Workbench) under `mobile-prototypes/`, exploring the phone as a remote agent command center rather than a miniature desktop IDE.
- Share one fabricated fleet state, layered-context structure (`screen-home` → `screen-session` → `screen-terminal`/`screen-browser` → `screen-evidence` → `sheet-send`), and intervention-safety contract across all seven prototypes via `mobile-prototypes/SPEC.md` so the directions are directly comparable.
- Publish the mobile gallery at `/mobile/` on the static site, link it from the landing page, and extend the website route regression test to verify both the 16 design routes and the 7 mobile routes.

## GBlockParty Chromux v0.22.1

Tag: `chromux-v0.22.1`

- Fix production design-gallery navigation by linking every card to its Vercel clean URL instead of an `.html` path.
- Add a website route regression test that verifies every gallery card maps to a generated HTML file and rejects `.html` links.

## GBlockParty Chromux v0.22.0

Tag: `chromux-v0.22.0`

- Add locally persisted saved projects with validated project directories and `package.json` start scripts.
- Derive an allowlisted npm, pnpm, yarn, or bun start command instead of storing arbitrary shell commands.
- Start a saved project in its own terminal-first session and route detected server URLs into the approval queue without silently opening the paired browser.
- Document `package.json` as the v1 configuration source; `devctl` / `apps.json` remains deferred pending a stable schema.

## GBlockParty Chromux v0.21.0

Tag: `chromux-v0.21.0`

- Add global favorites for paired-browser documents and URLs, with toolbar and review-queue pin controls plus a shared picker that opens into the active session.
- Persist a bounded, validated list atomically in `~/.chromux/favorites.json`, normalize fragments for deduplication, and recover safely from missing or malformed data.
- Restore a shut paired browser when a favorite is opened, and document local storage, privacy, cleanup, and troubleshooting behavior.

## GBlockParty Chromux v0.20.1

Tag: `chromux-v0.20.1`

- Add a structured first-success issue form for the controlled OSS preview, covering environment, agent CLI, preview routing, capture, delivery, recovery, and documentation friction.
- Require reporters to confirm that credentials, private source, sensitive paths, and other private project data have been removed before submission.

## GBlockParty Chromux v0.20.0

Tag: `chromux-v0.20.0`

- Authenticate agent attention events with a per-PTY 256-bit token and correlated v2 OSC envelopes while retaining lower-confidence v1 compatibility.
- Classify native Claude Code, Codex, and Grok Build callbacks into permission, authentication, input, rate-limit, tool-failure, turn-start, and completion states; unknown notifications remain diagnostic-only.
- Add monotonic event validation, authoritative-over-heuristic precedence, distinct attention priorities, stopped-aware update safety, and per-agent capability diagnostics.
- Generate dependency-free hook adapters for Electron's embedded Node runtime, with safe v1 or uninstrumented fallback when installation fails.

## GBlockParty Chromux v0.19.0

Planned tag: `chromux-v0.19.0`

- Add the 16th design-refresh prototype, "Liquid Glass": a bright silver-blue optical-glass cockpit with rounded edge-lit panes, a smoked-glass terminal slab, restrained cyan/violet/green/amber/coral state color, traveling-highlight interactions, and a thicker floating capture sheet.
- Wire the new prototype into the design gallery as Batch 3 with a glass-reflection swatch, and update the gallery README and counts (the website build picks up the new file automatically).

## GBlockParty Chromux v0.18.0

Planned tag: `chromux-v0.18.0`

- Publish the Chromux website as a deterministic static Vercel build with the product landing page at `/` and the complete 15-direction design refresh gallery at `/designs/`.
- Add production security headers and clean URLs while keeping Electron application and repository-internal files outside the deployed artifact.
- Link the public design gallery from the landing-page navigation and product footer.

## GBlockParty Chromux v0.17.0

Planned tag: `chromux-v0.17.0`

- Make the paired browser approval-gated: new sessions start with the browser shut, and detected localhost / loopback / local `.html` previews always enter QUEUE instead of auto-opening an empty pane.
- Open a preview only on explicit approval — queue OPEN, ⌘/Ctrl-click a terminal link, or Enter in the URL bar — and restore a shut browser when a URL is opened.
- Polish Command+Shift+B and COLLAPSE/RESTORE control copy for open/shut semantics, and update README / troubleshooting for the terminal-first workflow.

## GBlockParty Chromux v0.16.0

Planned tag: `chromux-v0.16.0`

- Add Grok Build (`grok`) as a first-class agent alongside Claude Code and Codex: new-session picker, DETECT resume/fresh, shell-tab adoption, and restore snapshots.
- Install Chromux turn-signal hooks into `~/.grok/hooks/chromux-turn-signals.json` (plus `~/.chromux/grok-hook.sh`) so Grok sessions emit the same OSC attention signals as Claude; hooks no-op outside Chromux when `CHROMUX_SESSION_ID` is unset.
- Resume Grok conversations from `~/.grok/sessions/<encoded-cwd>/` via `grok --resume <id>` for DETECT and workspace restore.
- Extend agent-command quoting and shell-adoption smoke coverage for Grok launch/resume and process classification.

## GBlockParty Chromux v0.15.0

Planned tag: `chromux-v0.15.0`

- Introduce a unified Chromux brand mark: three dots in a right-facing chevron — orange (Claude), purple (Codex), green (Gemini) — replacing the previous mismatched marks across surfaces.
- Regenerate the macOS app icon (`build/icon.icns`) from the new mark on a dark tile, and reuse the same mark for the in-app titlebar and the landing page.
- Add the missing landing-page favicon and Apple touch icon derived from the app tile so the browser tab matches the Dock icon.

## GBlockParty Chromux v0.14.5

Planned tag: `chromux-v0.14.5`

- Keep attention-queue session labels aligned with dynamic terminal titles shown in the top session tabs, with the original launch name retained as the shared fallback.
- Refresh visible attention rows when terminal titles change and cover the cross-surface label behavior with a renderer regression test.

## GBlockParty Chromux v0.14.4

Planned tag: `chromux-v0.14.4`

- Suppress bare Shift and ordinary shifted typing in the hotkey diagnostics strip while preserving Shift highlighting and catalog matching for Command+Shift+B.

## GBlockParty Chromux v0.14.3

Planned tag: `chromux-v0.14.3`

- Adopt Claude and Codex sessions launched from a Chromux Shell tab by rewriting simple `claude ...` and `codex ...` submissions into Chromux-instrumented commands while preserving user arguments.
- Leave complex shell syntax, wrappers, redirects, and existing Claude/Codex hook flags untouched, then fall back to read-only process scanning for Chromux-owned PTYs.
- Save adopted shell-started agents as Claude/Codex sessions in restore snapshots so update safety and workspace restore use the corrected session identity.

## GBlockParty Chromux v0.14.2

Planned tag: `chromux-v0.14.2`

- Hide the native scrollbar inside narrow paired-browser toolbars while preserving horizontal scrolling so Queue, Pick Element, Capture, and Collapse remain reachable.

## GBlockParty Chromux v0.14.1

Planned tag: `chromux-v0.14.1`

- Quiet the status-bar hotkey diagnostics during ordinary typing, keeping only the modifier chips visible until Command or Control is held.
- Keep Command shortcut diagnostics fully active, including latest-key and catalog matching, while letting Control wake the display without creating new Control-routed app shortcuts.

## GBlockParty Chromux v0.14.0

Planned tag: `chromux-v0.14.0`

- Update session tab labels from terminal OSC 0/1/2 title sequences emitted by agents and shells while leaving the title control bytes flowing through to xterm.
- Keep launch names as tab fallbacks, retain full title/cwd tooltip context, and sanitize empty/control-heavy titles before display.
- Add overflow-aware tab labels with active-title marquee, inactive hover handoff, and reduced-motion static ellipsis fallback.
- Extend OSC parser coverage and add renderer smoke coverage for title updates, fallback labels, truncation, marquee selection, and hover handoff.

## GBlockParty Chromux v0.13.2

Planned tag: `chromux-v0.13.2`

- Route terminal-focused Chromux shortcuts through an explicit allowlist, preserving terminal/system shortcuts such as copy, paste, and interrupt.
- Deliver Command+T and Command+D through main-process shortcut routing so new-session and detect modals open from terminal and non-editable paired-browser focus.
- Keep real host editables and guest-page editables suppressing Chromux-owned shortcuts while treating xterm's helper textarea as terminal focus.

## GBlockParty Chromux v0.13.1

Planned tag: `chromux-v0.13.1`

- Detect quick exits from Codex restore/resume launches and show a footer warning with the exact `codex resume <id>` command.
- Add a RETRY RESUME action that sends the saved resume command back into the same session terminal, preserving the failed output context.
- Add renderer smoke coverage for resume-retry display, retry input, dismissal, non-resume exits, and exits outside the startup window.

## GBlockParty Chromux v0.13.0

Planned tag: `chromux-v0.13.0`

- Add an always-visible hotkey diagnostics strip to the bottom status bar, showing sanitized shortcut keys, active modifiers, event source, focus context, and shortcut availability.
- Add a renderer-owned shortcut catalog for Command+1..9, Command+J, Command+Shift+B, Command+Q, Command+T, Command+D, and Esc, including contextual disabled reasons for modal, host editable, guest editable, empty queue, and missing-session states.
- Emit sanitized shortcut diagnostic input from host-window and paired-webview `before-input-event` handlers without changing existing shortcut action IPC names or behavior.
- Add hotkey debug renderer and smoke coverage for catalog state, host/webview key source reporting, and guest editable suppression.

## GBlockParty Chromux v0.12.10

Planned tag: `chromux-v0.12.10`

- Deliver app-scoped Command+1..9, Command+J, Command+Shift+B, and guarded quit shortcuts from paired browser webviews as well as the host window.
- Track focused editable elements inside guest pages so session, queue, and browser-toggle shortcuts remain suppressed while preview-page inputs are active.
- Add a webview shortcut smoke test that sends real Command key events into a guest webview and verifies both delivery and editable suppression.

## GBlockParty Chromux v0.12.9

Planned tag: `chromux-v0.12.9`

- Keep UPDATE WAITING dismissal as a non-destructive reminder clear; it returns the queue to idle and never grants permission to stop live sessions.
- Add a Settings-only INSTALL ANYWAY path for managed updates blocked by live sessions, preserving the existing live-session confirmation, restore snapshot, managed installer, and session reopen flow.
- Keep attention rail UPDATE WAITING focused on triage: FOCUS still activates the first blocker, while Settings explains the managed override and only offers it when a managed install source is available.

## GBlockParty Chromux v0.12.8

Planned tag: `chromux-v0.12.8`

- Harden terminal preview parsing so code, diff, search, test fixture, markdown, and release-note examples containing localhost URLs do not open or queue fake previews.
- Preserve real dev-server/prose preview detection for lines such as `Local: http://localhost:5173/` and `ready on http://localhost:3000`.
- Document the future explicit Chromux preview OSC signal path, with MCP planned as an adapter over the same internal preview action.

## GBlockParty Chromux v0.12.7

Planned tag: `chromux-v0.12.7`

- Suppress preview detection from completed user-typed localhost and local `.html` command echoes, including commands assembled across terminal input chunks.
- Add queue source/reason metadata so review queue rows and attention details explain why each preview exists, with legacy restored queue records labeled as restored from a previous session.

## GBlockParty Chromux v0.12.6

Planned tag: `chromux-v0.12.6`

- Fix Command+1..9 session switching when Electron reports top-row number keys through `input.code` as `Digit1` through `Digit9` instead of a plain digit `input.key`.

## GBlockParty Chromux v0.12.5

Planned tag: `chromux-v0.12.5`

- Add Command+Shift+B and a View menu item to toggle the active session's paired browser between collapsed and restored states.
- Keep the browser collapse shortcut guarded while modals or editable fields are focused, matching the existing shell-level shortcut behavior.
- Extend the browser-collapse renderer smoke test to cover the shortcut path in addition to the collapse/restore control.

## GBlockParty Chromux v0.12.4

Planned tag: `chromux-v0.12.4`

- Add a Codex-only renderer fallback that marks an already-working turn completed when Codex reaches a known idle or rate-limit interstitial state, while preserving OSC `turn-end` as the primary signal.
- Reject malformed localhost preview tokens that concatenate nested URLs or include prompt glyph contamination, and preserve delimiters while stripping terminal control sequences so status redraws cannot corrupt preview URLs.
- Suppress localhost previews echoed from typed Codex prompt input once per occurrence, while still allowing the same URL to route when later printed by agent output.

## GBlockParty Chromux v0.12.3

Planned tag: `chromux-v0.12.3`

- Keep completed attention rows display-hidden only while their own session is focused; they now reliably reappear after blur unless explicitly dismissed or superseded by new input.
- Stop queuing malformed terminal preview URLs when Codex output wraps or concatenates localhost URLs; nested `http://` / `https://` starts are split and prompt glyphs terminate the current URL.

## GBlockParty Chromux v0.12.2

Planned tag: `chromux-v0.12.2`

- Move renderer attention and turn-transition rules into a dedicated `renderer/attention.js` domain module, leaving DOM rendering and activation actions in `renderer.js`.
- Normalize deterministic Claude/Codex lifecycle inputs through one turn vocabulary while keeping malformed or wrong-session OSC sequences diagnostic-only.
- Reorder the attention rail as an actionable triage queue: input needed, delivery failures, actionable update states, queued previews, completed turns, then passive update waiting.
- Keep focused-session hiding, dismiss acknowledgements, user-input turn transitions, and update safety derived from canonical turn state instead of rendered queue rows.

## GBlockParty Chromux v0.12.1

Tag: `chromux-v0.12.1`

- Show the running app's actual version in Settings even when update release metadata comes from the one-day cache.
- Recompute cached update availability against the live app version so newer local builds do not display stale update prompts.
- Reopen the exact installed `/Applications/Chromux.app` bundle after managed update installs instead of resolving by bundle name.

## GBlockParty Chromux v0.12.0

Planned tag: `chromux-v0.12.0`

- Change the update action from opening GitHub Releases to a managed install flow that runs the recorded local `npm run install-app` source.
- Save a workspace restore snapshot before managed update installs, quit Chromux, run the installer after the current app exits, and reopen Chromux when installation finishes.
- Keep the GitHub Release URL visible as a reference link, while Settings and update attention now label the primary action as INSTALL UPDATE / RETRY INSTALL.

## GBlockParty Chromux v0.11.1

Planned tag: `chromux-v0.11.1`

- Let queued update attention items be dismissed from WAITING, READY, and FAILED states; dismissal clears the stale reminder back to idle while preserving the available release.
- Allow the update queue to be queued again after dismissal, so cleared or newly opened Codex windows can bring back UPDATE WAITING or UPDATE READY as current session safety changes.

## GBlockParty Chromux v0.11.0

Planned tag: `chromux-v0.11.0`

- Add a per-session paired-browser collapse control: collapsed sessions expand the terminal, keep a narrow restore rail visible, disable divider resizing, and preserve browser URL, queue, webview, and capture state.
- Restore each browser pane to its previous split width and refit the paired terminal after collapse, restore, divider drag, and session activation.
- Make the paired browser header controls horizontally scrollable when the pane is narrow, keeping Queue, Pick Element, and Capture reachable instead of squeezing controls into overlap.
- New test: `test:browser-collapse-renderer` covers collapse/restore state preservation, per-session tab switching, terminal refit, disabled divider behavior, and narrow-toolbar reachability.

## GBlockParty Chromux v0.10.1

Planned tag: `chromux-v0.10.1`

- Preserve a pending (unconsumed, non-empty) restore snapshot when quitting with zero open sessions; an idle Command+Q can no longer destroy a workspace the user hadn't reopened yet. Quits with open sessions still write a fresh `app-close` snapshot.
- Guard Command+J against editable focus, matching Command+1..9: focusing the next queued preview no longer fires while an input, textarea, select, or contenteditable is focused (or while a modal is open).
- Stop pointing agents at broken hook paths when the startup hook install fails: `get-env` now returns `null` for `hooksSettingsPath`/`codexNotifyPath` unless the corresponding file was written successfully, and both main and renderer fall back to launching bare `claude`/`codex`.
- Quote agent launch commands for the shell: hook/notify paths (and resume ids) are POSIX single-quoted, and the codex notify path is additionally TOML-escaped, so a HOME containing spaces, quotes, or backslashes no longer produces an unparseable command.
- New test: `test:agent-command-quoting` builds claude/codex commands under a hostile HOME and verifies them with zsh; `test:shortcuts-renderer` now exercises the guarded shortcut IPC paths with an editable focused.
- Upgrade the prototype runtime/build devDependencies to Electron 43 and `@electron/rebuild` 4.1.0, clearing npm audit findings before packaging and raising the prototype Node prerequisite to 22.12+.
- Add a troubleshooting guide for preview detection, file previews, queued reviews, screenshots, console logs, CLI delivery, wrong-session routing, and local storage cleanup.

## GBlockParty Chromux v0.10.0

Planned tag: `chromux-v0.10.0`

- Replace regex-based agent attention heuristics with deterministic turn signals: Claude Code sessions launch with a Chromux-managed `--settings` hooks file (UserPromptSubmit/Notification/Stop) and Codex sessions with a `notify` override; both emit a Chromux OSC sequence that rides the session's own PTY.
- Add the Chromux OSC v1 wire protocol and a chunk-boundary-safe parser (`renderer/signals.js`); signals whose session id does not match the PTY they arrived on are dropped and recorded as rejected.
- Restructure renderer session state into explicit domains (identity, lifecycle, turn, browser, terminal) with a single `apply()` event seam, a bounded diagnostic event ring, and coalesced rendering.
- Make the attention queue a pure projection: the focused session's items are hidden while focused and reappear on blur; DISMISS acknowledges without deleting state; typing after completion returns the turn to working (stale output can no longer resurrect COMPLETED); exited sessions show only the dead tab dot.
- Derive update-queue safety from turn state (exited/needs-input/completed are safe; working/unknown block) so focusing a session can no longer regress a READY update to WAITING.
- Track captures as first-class records with a delivery index: overlapping deliveries resolve independently, failures attribute to the capture's own target/capturing session (never the focused one), the SENT gauge counts only exit-0 deliveries, records survive modal close, and the browser pane shows a capture chip for its current URL.
- Guard shell-level shortcuts: Command+1..9 switch sessions from the Chromux shell, Command+J reveals and focuses the next queued preview's OPEN button without opening it, and Command+Q now routes through the quit confirmation flow.
- New tests: `test:osc-parser`, `test:turn-signals-renderer` (replaces `test:attention-signals-renderer`), `test:capture-records-renderer`, `test:shortcuts-renderer`; update-queue test rewritten onto turn state.

## GBlockParty Chromux v0.9.0

Planned tag: `chromux-v0.9.0`

- Switch update checks from local source comparisons to GitHub Releases.
- Cache automatic update checks for up to one day while allowing manual checks to bypass the cache.
- Open the GitHub Release URL for newer versions instead of auto-installing binaries.
- Prepare the project for publication as `GeorgeQLe/gblockparty-chromux` under the MIT license.
