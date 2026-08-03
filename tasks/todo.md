# Task Queue

## Priority Documentation Todo

No active priority documentation items.

## Implementation And Documentation Todo

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

- [ ] Complete the v0.73.0 OAuth-backed Vercel shipping release. Main-process
  runtime discovery, encrypted CLI/token/OAuth profile primitives, canonical
  linked-root/project persistence, narrow IPC, security documentation, and
  deterministic service coverage are implemented, along with the
  terminal-header button, project setup wizard, guarded stage-all commit/push
  recovery, direct/Git-triggered deployment monitoring, mode-`0600` restart
  recovery, owned loopback OAuth, two-step production confirmation, and
  deterministic service/real-Electron coverage are implemented. Complete the
  dashboard-only public OAuth app registration, commit its public client ID,
  prove the OAuth credential can deploy the mapped preview project, archive the
  direct/Git/cancel/restart live UAT, then publish the release. _(source:
  user-supplied One-Button Vercel Shipping plan; blocker evidence:
  `prototype/docs/testing/vercel-shipping-uat-0.73.0.md`; no controllable
  signed-in browser is available, and Vercel documents API/team resource
  permissions as private beta)_

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

- [ ] Run the separate protected v0.73.0 signed-candidate workflow on Windows 10 Pro 22H2 build 19045 x64 and Windows 11 with current WSL2, complete the manual setup/restore checks, attach all five verified Squirrel assets to the matching release, and verify the Windows update feed. _(source: user-supplied signed-installer and first-run plan; implementation evidence: `.github/workflows/windows-release.yml`, `prototype/windows-setup.js`, setup renderer/main/preload integration, signing/artifact/UAT scripts, focused and complete local test coverage, and `docs/testing/windows-signed-installer-uat-0.73.0.md`; this remains a separate blocked task requiring the missing `windows-signing`/`windows-release` environments and Azure settings, two real-machine runners, a prior signed installer, protected approvals, exact signed candidate hashes, and real-machine PASS)_

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
