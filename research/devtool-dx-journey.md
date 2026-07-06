# Chromux - Devtool DX Journey

_Producing skill: `$devtool-dx-journey` · Status: canonical · Date: 2026-07-05 · Concept slug: `chromux`_

## Executive Journey Stance

Chromux's developer experience should be judged by one daily-driver loop: start terminal-native Codex or Claude Code sessions, let each session surface its own `localhost` or `file://` preview, inspect the page without leaving the cockpit, and send a bounded browser evidence payload back to the correct agent.

Because the repo is still pre-implementation, the current DX journey is an acceptance map rather than public onboarding copy. It should drive the first stack spike, README quickstart, capture payload contract, troubleshooting guide, and proof artifacts. The product should not optimize for broad installation, team rollout, or monetization until the builder can repeatedly complete the local loop faster than manual terminal plus Chrome copy/paste.

The main DX principle is explicitness: Chromux should preserve existing CLI habits, make preview routing legible, show what was captured, store payloads locally with visible paths, and fail in ways the developer can retry manually.

## 2026-07-06 Implementation Update - Reinstall And Restore

Chromux now treats reinstall and app-close recovery as part of the daily-driver loop rather than a manual Detect-only fallback. Before update install or window close, live PTY sessions trigger a blocking confirmation that explains the stop, writes a workspace snapshot, and proceeds only after user confirmation. On the next launch, Chromux auto-restores the saved workspace snapshot with session tabs, browser URLs, queued previews, and Claude/Codex resume commands where a saved CLI session can be matched. If resume metadata is missing, the session opens fresh and a dismissible red warning names the affected workspaces. The backup snapshot remains available in Detect as a secondary recovery surface and is marked restored instead of deleted.

## Journey 1 - Install And First Launch

### Target User

The initial user is the builder running Chromux on a macOS laptop. A later user is an OSS developer already using terminal-native coding agents and local preview apps.

### Desired Path

1. Read the project status and understand that Chromux is a local macOS cockpit, not a new agent runtime.
2. Confirm prerequisites: macOS, chosen Electron/cmux stack, Codex CLI, Claude Code CLI, and authenticated CLI state.
3. Install or run from source with a small number of commands.
4. Launch Chromux and see an empty session workspace with a clear way to add a Codex or Claude command.
5. Start a terminal session without re-authenticating or changing shell habits.
6. See a paired browser pane reserved for that session.

### Current Gaps

- No `README.md`, package manifest, app source, install command, or launch command exists in the active checkout.
- `cmux` fork feasibility is still unproven.
- There is no documented handling for CLI auth, PATH, shell startup files, macOS permissions, browser profile state, or local capture directories.

### Acceptance Criteria

- A developer can launch Chromux from the repo after following one quickstart.
- A missing Codex or Claude Code CLI produces a clear fix, not a silent terminal failure.
- Existing CLI auth state is reused or a precise remediation is shown.
- The first session visibly owns both a terminal pane and a browser pane.

## Journey 2 - Quickstart To First Success

### First Success Definition

First success is not "the app opens." First success is completing the session-paired review loop once:

1. Start one agent session.
2. Have it emit a `localhost` URL or local HTML path.
3. See Chromux route that preview to the session's paired browser pane or queue.
4. Inspect the preview.
5. Capture browser evidence.
6. Verify the generated YAML and screenshot path.
7. Deliver or manually retry the payload.

### Happy Path

1. The developer starts a Codex or Claude Code session inside Chromux.
2. The agent starts a simple local app, for example a Vite preview on `http://localhost:5173`.
3. Chromux detects the URL from terminal output and associates it with the originating session.
4. If the paired pane is idle, Chromux loads the URL there. If the developer is actively reviewing another page, Chromux badges the pending preview instead of hot-swapping.
5. The developer selects the relevant page state or element.
6. Chromux generates a bounded payload containing schema version, timestamp, originating session ID, project path, URL, page title, selected selector, selected HTML excerpt, console tail, screenshot path, delivery target, and optional notes.
7. The developer reviews the payload path or summary.
8. Chromux sends the payload through the configured v1 adapter, likely `claude -p`, or leaves an inspectable file-drop fallback.

### Current Gaps

- No runnable app exists to demonstrate preview detection.
- No capture payload schema or sample YAML exists.
- No delivery adapter has been proven end to end.
- No review queue UI exists.

### Acceptance Criteria

- The first quickstart can be completed in under 10 minutes on the builder's machine after prerequisites are met.
- The developer can tell which session owns the preview.
- The payload can be inspected before or immediately after delivery.
- A failed delivery leaves enough evidence for a manual retry.

## Journey 3 - Error Recovery And Debugging

### Failure Modes That Need First-Class Recovery

| Failure | User-visible symptom | Required recovery |
| --- | --- | --- |
| CLI missing | Session command fails immediately | Show missing executable and suggested install/auth check. |
| CLI auth unavailable | Agent opens but cannot operate | Preserve original CLI output and link to auth remediation docs. |
| Preview not detected | Terminal prints a URL but pane stays empty | Show detection log and allow manual paste/open tied to the session. |
| Multiple previews detected | Wrong port or file opens | Present a picker and remember the chosen route for that session. |
| Active review interrupted | Pane changes while user is inspecting | Queue and badge background previews instead of replacing the page. |
| `file://` cannot load | Local HTML preview is blank or blocked | Explain file permission/profile limitation and provide manual open path. |
| Screenshot fails | Capture produces no image | Keep payload without screenshot, log the failure, and allow retry. |
| Console tail too large | Payload becomes noisy or expensive | Bound logs and show truncation metadata. |
| Selected DOM too large | Prompt becomes unwieldy | Store excerpt plus selector, not unbounded DOM. |
| Payload sent to wrong target | Agent receives irrelevant evidence | Require originating session ID in every payload and delivery log. |
| `claude -p` fails | Delivery exits non-zero | Show exit status, payload path, command target, and manual retry command. |

### Debugging Surfaces

- Session event log: agent command, preview detections, queue events, active URL changes, and capture events.
- Payload log: payload path, screenshot path, delivery adapter, target session, exit status, and timestamp.
- Storage map: where payloads, screenshots, browser profiles, console tails, and local history live.
- Troubleshooting docs for preview detection, file previews, screenshots, console capture, CLI auth, and cleanup.

### Acceptance Criteria

- Every failed first-success step has a visible next action.
- The developer can recover without restarting Chromux for ordinary preview and capture failures.
- No privacy or security claim is made until local data handling is documented.

## Journey 4 - Production Adoption

### What "Production" Means For This Tool

For Chromux v1, production adoption means the builder uses it during real coding-agent work across multiple sessions for several days, not that a company deploys it organization-wide. The product should be considered production-ready for the builder only after it handles repeated localhost/file preview loops, capture retries, and session switching without creating more friction than terminal plus Chrome.

### Adoption Milestones

| Milestone | Proof Needed | Blocking Unknown |
| --- | --- | --- |
| Stack feasible | `cmux` or chosen host can embed browser pane and capture hooks | `cmux` source/extensibility is unverified. |
| First loop works | Demo transcript for URL detection, pane routing, payload generation, and delivery | `claude -p` may fragment context. |
| Daily-driver candidate | Builder completes multiple real review/capture loops without reverting to Chrome | Focus discipline, screen real estate, and reliability. |
| OSS preview | README quickstart, payload schema, troubleshooting, sample payload, screenshot fixture | Support burden and setup tolerance unvalidated. |
| Public trust claims | Storage, retention, deletion, browser profile, and command invocation docs | Capture data can include sensitive local evidence. |

### Adoption Risks

- Browser co-location alone will not beat existing IDE or browser tools.
- If capture delivery does not reach the right agent context, the wedge collapses into a file generator.
- If Chromux steals focus or hot-swaps previews, it will feel worse than a separate browser.
- If local storage is opaque, "local-first" will not be credible.

## Journey 5 - Team Rollout

Team rollout is explicitly out of scope for v1. Treat it as a future signal, not a roadmap commitment.

### Possible Team Triggers

- More than one developer wants to review the same agent-generated preview or capture history.
- A team wants shared capture evidence, replayable bug context, or durable review queues.
- A security or platform owner asks for policy around screenshots, DOM capture, logs, browser profiles, or agent delivery.
- A managed GBlockParty surface emerges with hosted sessions, capture history, or controlled sandboxes.

### Team DX Requirements If Triggered Later

- Installable signed builds and update controls.
- Shared workspace model and access controls.
- Audit logs for captures and deliveries.
- Retention policies for screenshots, DOM excerpts, logs, and prompts.
- Admin controls for allowed projects, agents, browser profiles, and delivery adapters.

### Why To Defer

The current evidence base is the builder's personal workflow. Team features would increase setup, privacy, support, and policy complexity before the local loop is proven.

## Journey 6 - Retention And Repeated Use

### Retention Hypothesis

Chromux retains users only if it becomes the default place to supervise parallel agent sessions. The repeat-use hook is not novelty; it is lower cognitive load when moving between terminal output, page inspection, and browser evidence capture.

### Retention Drivers

- Reliable session-to-preview pairing.
- Review queue that preserves attention.
- Capture payloads that are faster and cleaner than manual copying.
- Transparent local storage and easy cleanup.
- Low-friction recovery when detection or delivery fails.
- Compatibility with existing Codex and Claude Code habits.

### Retention Metrics For The Builder

- Number of real coding sessions launched through Chromux per day.
- Percentage of agent-generated previews reviewed in Chromux instead of external Chrome.
- Number of capture payloads sent or file-dropped per day.
- Manual retry rate for preview detection and payload delivery.
- Number of times the builder leaves Chromux because the layout, browser pane, or delivery path gets in the way.

These are local observation metrics, not telemetry requirements. If tracked, store them as opt-in local notes or manual records until productization is justified.

## Prioritized DX Backlog

1. Run a `cmux` stack spike to validate embedded Chromium pane feasibility and capture hooks.
2. Prototype preview detection for `localhost`, loopback URLs, and local HTML paths from terminal output.
3. Define `docs/capture-payload.md` with a versioned YAML schema, field bounds, retention notes, and one sample payload.
4. Build an end-to-end capture-to-delivery proof using `claude -p` plus file-drop fallback.
5. Write `README.md` with the "first local loop" quickstart after runnable commands exist.
6. Write `docs/troubleshooting.md` for preview detection, file previews, screenshots, console logs, CLI auth, wrong-session routing, and storage cleanup.
7. Write `docs/privacy-and-local-data.md` before making public privacy or local-first claims.
8. Add proof artifacts under `examples/`: sample payload, sample screenshot path, and demo transcript.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Decision impact |
| --- | --- | --- | --- | --- |
| The first-success loop is session-paired preview plus capture | `research/idea-brief.md`, `research/devtool-positioning.md`, and `research/devtool-integration-map.md` all name 1:1 pairing, preview detection, review queue, and browser evidence capture as the wedge. | Quickstart and acceptance tests should center on the full loop, not app launch alone. | High | Prioritize preview routing and payload delivery over broad browser features. |
| Current repo cannot support public install docs yet | `research/devtool-docs-audit.md` found no README, package manifest, runnable source, active docs, or implementation commands. | DX work must first define proof paths and acceptance criteria. | High | Do not write fake install commands; create quickstart only after stack proof. |
| Error recovery is a core DX requirement | Existing research warns about CLI auth, preview detection, wrong routing, screenshots, `file://`, payload size, delivery failure, and local storage. | The tool must expose logs and retry paths for the first loop. | High | Add troubleshooting docs and event logs early. |
| Production adoption is personal daily-driver proof first | `research/idea-brief.md` identifies the builder as the primary beneficiary, and `research/devtool-monetization.md` defers productization until daily-driver proof. | Production readiness should be measured by repeated builder use before OSS/team rollout. | High | Defer team and monetization UX. |
| Future OSS users remain unvalidated | Existing artifacts repeatedly note no external interviews, installs, issues, or support data. | Team and public onboarding should stay provisional. | Medium-high | Focus on proof artifacts before adoption programs. |
| Local capture data can be sensitive | Capture design includes screenshots, DOM snippets, console logs, URLs, file paths, browser profile decisions, and command delivery logs. | Trust docs must precede public privacy claims. | High | Document storage, retention, deletion, and captured fields. |

## Assumptions And Confidence Register

| Assumption | Current confidence | Why | What would change it |
| --- | --- | --- | --- |
| The builder will tolerate a macOS-first desktop app if it speeds daily work | Medium | Matches the idea brief and personal-tool scope. | Electron/browser footprint or screen real-estate problems make external Chrome faster. |
| `cmux` can remain the fork base | Low-medium | It is the intended base, but source has not been inspected in this checkout. | Stack spike proves or rejects embedded browser feasibility. |
| `claude -p` is acceptable for v1 delivery | Medium | It is transparent and composable, but may not preserve active session context. | End-to-end testing shows context fragmentation is too costly. |
| File-drop fallback is enough for early recovery | Medium | It keeps payloads inspectable and manually retryable. | Manual retry frequency remains high after daily use. |
| Future OSS users will accept setup once docs exist | Low | No external adoption evidence exists. | External installs or interviews show the problem is shared. |

## Source Coverage Gaps

- No `cmux` source inspection was performed in this pass.
- No runnable Chromux app exists in the active checkout.
- No install, launch, preview detection, capture, or delivery command has been verified.
- No end-to-end payload-to-agent proof exists.
- No external user feedback or OSS support data exists.
