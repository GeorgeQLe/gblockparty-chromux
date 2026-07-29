# Chromux — Developer DX Journey

_Producing skill: `$devtool-dx-journey` · Status: canonical · Evidence snapshot: 2026-07-18 · Confirmed: 2026-07-25 · Concept slug: `chromux`_

Decision horizon: 30–60 days
Evidence boundary: repository-only; no external research, telemetry collection, interviews, or support outreach
## Executive Journey Stance

Chromux now has a runnable and documented developer journey. The canonical report's pre-implementation baseline is obsolete: the repository contains an Electron prototype at `prototype/package.json` version 0.30.2, source and packaged-app quickstarts, paired terminal/browser sessions, approval-gated preview routing, browser evidence capture, local-first persistence, recovery documentation, scripted proof artifacts, targeted regression suites, and a release history through `chromux-v0.30.2`.

The current route is credible for its intended primary user—a technical solo builder on Apple Silicon macOS—but it is not yet reproducible evidence for a fresh developer. The repository proves that the configured development machine can complete the loop. It does not prove that a clean Mac can satisfy the prerequisites, build `node-pty`, launch the unsigned app, preserve CLI PATH/auth, complete delivery, and recover using only the published docs.

The next 30–60 days should therefore optimize proof rather than add breadth. The critical path is: make clean-machine setup observable, package one repeatable first-success verification path, state the one-off `claude -p` delivery boundary unmistakably, and record real daily-driver outcomes. Managed cloud execution, Windows/Linux support, team administration, and collaboration remain non-goals for the primary current-state journey.

## Journey Readiness Snapshot

| Journey | Readiness | Repository-backed conclusion |
| --- | ---: | --- |
| Source install and first launch | 3/5 | Commands and prerequisites exist; no clean-machine run or preflight proves them. |
| Quickstart to first success | 4/5 | The complete paired loop is documented and a scripted real-app transcript proves preview, capture, screenshot, and file-drop on the configured machine. |
| Error recovery and debugging | 4/5 | Troubleshooting and UI fallbacks cover ordinary failures; recovery has targeted regression coverage but no fresh-user observation. |
| Production adoption for the solo builder | 3/5 | Packaging, restore, saved projects, favorites, updates, attention signals, and repeated-session affordances exist; sustained daily-driver evidence is absent. |
| Team rollout | 1/5 | Explicitly out of scope and unsupported by current controls or evidence. |
| Retention and repeated use | 3/5 | Product hooks exist, but the planned adoption metrics have not been recorded. |

These scores are comparative decision aids, not externally benchmarked measurements.

## Journey 1 — Source Install And First Launch

### Current route

1. Use Apple Silicon macOS with Node 22.12+ and Xcode command-line tools.
2. Clone or open the repository and enter `prototype/`.
3. Run `npm install`; `postinstall` rebuilds `node-pty` against Electron.
4. Run `npm start` for development, or `npm run install-app` to build an arm64 unsigned `Chromux.app` and replace `/Applications/Chromux.app`.
5. Launch Chromux and create, detect, resume, or adopt a Claude Code, Codex, Grok Build, or shell session.

### What is strong

- `README.md` gives a three-command source quickstart and links to the full prototype guide.
- `prototype/README.md` names macOS, Node 22.12+, Xcode command-line tools, and the Claude CLI delivery dependency.
- `prototype/package.json` declares `engines.node >=22.12.0`, rebuilds `node-pty` after install, and exposes start, package, install, rebuild, smoke, capture, and targeted test scripts.
- `npm run install-app` packages an arm64 app and records its local update source. The full guide explains that the bundle is unsigned and that login-shell behavior is intended to preserve PATH and CLI auth when launched from Finder.
- Session creation is not limited to a blank start: DETECT, RESUME, FRESH, OPEN SHELL, saved projects, and restore snapshots reduce repeated setup.

### Verified friction and risk

- Fresh-machine reproducibility is unproven. There is no clean macOS run log covering prerequisite detection, native module build, first launch, permissions, and delivery.
- The root quickstart omits prerequisites and the unsigned/arm64 constraint before the commands. It links to the full guide, but a developer can begin `npm install` before learning why the native build may fail.
- `engines.node` documents the version requirement but does not itself provide a purpose-built preflight or remediation flow.
- `install-app` is source-based, Apple Silicon-only, unsigned, and replaces an existing `/Applications/Chromux.app`. That is acceptable for the named personal-tool audience, but it is not a general public installer.
- Automation permission for Terminal/iTerm2 tab titles is discovered only when DETECT lacks titles. Process detection still works, but the degraded state is a first-run surprise.

### Acceptance criteria for the next proof

- A clean Apple Silicon Mac can follow the public docs without repository-author intervention.
- Missing Node, an old Node version, missing Xcode tools, a failed `node-pty` rebuild, unavailable agent CLI, and Automation denial each produce a visible diagnosis and exact next action.
- The proof records elapsed time, failed steps, remediation, and whether Finder launch preserves the expected login-shell CLI environment.

## Journey 2 — Quickstart To First Success

### Definition of first success

First success is not merely opening the app. It is completing one session-paired browser evidence loop:

1. Start, adopt, or resume a session.
2. Produce a localhost/loopback URL or local HTML path.
3. See the preview enter that session's approval queue without automatic navigation.
4. Approve and open it in the paired browser.
5. Inspect the page and capture page-level or selected-element evidence.
6. Review the bounded YAML payload and screenshot state.
7. Save it through FILE-DROP ONLY or send it through the one-off `claude -p` adapter.
8. Confirm the payload path and delivery outcome.

### Repository proof

- `prototype/examples/transcripts/first-local-loop.md` records a scripted real-app run through the actual PTY and live webview: session creation, terminal output, `file://` preview queueing, explicit OPEN, three console messages with one error, a second localhost preview queued without auto-open, YAML capture preview, screenshot capture, and persisted file-drop all pass.
- The same transcript separately verifies the login-shell `claude -p` adapter and preserves a sample payload and screenshot fixture.
- `prototype/docs/capture-payload.md` defines the bounded YAML v1 contract and manual retry command.
- `prototype/scripts/test-preview-queue-renderer.js` and `prototype/scripts/test-capture-records-renderer.js` pass on 2026-07-18.
- Terminal links, saved projects, favorites, and browser restoration reduce the number of steps after the first loop.

### Remaining friction and risk

- The proof is scripted on the configured machine, not a clean-user install.
- Delivery is a new one-off `claude -p` process in the target project directory; it is not injection into the paired live Claude, Codex, or Grok conversation. The UI and docs call it one-off, but the session-paired product framing can still create a stronger continuity expectation than the adapter provides.
- Codex and Grok can be first-class terminal sessions, but direct send remains named and implemented as `claude -p`; their reliable fallback is the inspectable file drop/manual handoff.
- DETECT resume selects the latest saved conversation for a project directory. Two live agents in the same directory cannot be distinguished by saved-session lookup.

### Near-term acceptance criteria

- One documented verification command or checklist exercises the same first-success contract and produces a pass/fail summary without requiring knowledge of internal smoke-driver setup.
- The capture modal states before send that `SEND — claude -p` creates a separate one-off Claude invocation and does not append to the paired live session.
- Codex/Grok routes explicitly present file-drop/manual handoff as the supported current path rather than implying live-context delivery.

## Journey 3 — Error Recovery And Debugging

### Current recovery map

| Failure | Visible or documented recovery | Evidence |
| --- | --- | --- |
| `node-pty` build failure | Install Xcode CLT, then run `npm run rebuild`. | `prototype/README.md`; `prototype/docs/troubleshooting.md` |
| Preview not detected | Reprint one complete URL, include port/path, check QUEUE, or paste into URL bar. | Troubleshooting; preview-queue test |
| Local file not detected | Use an existing absolute `.html`/`.htm` path or a supported clickable relative path. | Troubleshooting; first-loop transcript |
| Browser shut or stale | Opening an approved, typed, clicked, or favorited URL restores the pane; repeated same URL refreshes. | README; browser/queue behavior tests |
| Screenshot failure | Persist payload with `screenshot.mode: unavailable`; retry after page load. | README; troubleshooting; capture implementation |
| Missing console context | Reproduce after pane open, inspect counters, capture within the last-50 window, add a note. | Troubleshooting; payload bounds |
| `claude -p` failure | Keep payload, show exact retry command, use FILE-DROP ONLY, inspect delivery log. | `main.js`; `renderer.js`; troubleshooting; capture-record test |
| Wrong-session delivery | Review target and cwd; understand DETECT's project-based latest-session limitation. | Troubleshooting |
| Resume exits immediately | Show retry command with RETRY RESUME and dismiss controls. | `renderer.js`; resume-retry test |
| Malformed favorites/projects | Treat invalid records safely; reset documented local files. | implementation; favorites/projects tests |
| Update failure or blocker | Preserve staged state, show retry/release path, and require explicit confirmation. | releases; update tests |

### Assessment

Ordinary recovery is a current strength. The app generally preserves inspectable artifacts and provides manual fallback rather than losing work. Nine targeted suites run in this research pass all succeeded: preview queue, capture records, resume retry, projects, favorites, GitHub update check, update queue, shell adoption, and turn signals.

The evidence remains implementation-centric. It shows that recovery logic exists and regression tests pass, not that a first-time developer notices, understands, and successfully uses each recovery path. The missing next layer is a clean-user failure rehearsal.

## Journey 4 — Production Adoption For The Solo Builder

### Current meaning of production

For the approved scope, production means that a solo builder can use Chromux across real coding-agent sessions for several days without routinely returning to a separate terminal/browser workflow. It does not mean enterprise deployment.

### Adoption capabilities already present

- Source packaging into a local macOS app and managed updates based on the recorded source plus GitHub Release metadata.
- Session restore snapshots and retry behavior.
- External terminal/agent detection plus project-based resume/fresh adoption.
- Saved project start configurations derived from validated `package.json` scripts.
- Global favorites and per-session paired browser state.
- Attention signals, queueing, activity indicators, dynamic titles, and multi-session tabs.
- Four themes with independent light/dark modes and persistent selection.
- Local-data inventory, troubleshooting, delivery logs, and explicit capture artifacts.

### Adoption blockers and unknowns

- No sustained daily-driver record shows sessions launched, previews reviewed in Chromux, useful captures, manual retries, wrong-session incidents, or reasons for leaving Chromux.
- `tasks/record-todo.md` already defines these metrics, and its original condition—“runnable Chromux app exists”—is now satisfied. The record has not been executed.
- The repository has a controlled-preview first-success issue form but no repository evidence of external submissions or support outcomes.
- A source-built unsigned arm64 app is appropriate for the current builder route but remains a distribution and trust boundary for broader OSS use.
- Capture storage and delivery logs never expire automatically; the browser profile has no in-app reset. These are documented but create maintenance burden over repeated use.

### 30–60 day production gate

Treat the current prototype as a daily-driver candidate, not as broadly validated production DX, until at least five real workdays are recorded and repeated friction is promoted from observation into actionable fixes.

## Journey 5 — Team Rollout

Team rollout remains explicitly out of scope. Current evidence does not support shared workspaces, access controls, audit exports, managed retention, policy enforcement, signed deployment, administrator controls, or collaborative capture history.

Do not add team onboarding work during this horizon. Revisit only when more than one developer repeatedly completes the solo route and requests shared evidence or managed policy.

## Journey 6 — Retention And Repeated Use

### Retention hypothesis

Chromux will retain the primary user if session pairing, approval-gated previews, attention state, capture artifacts, and recovery make parallel agent work easier to resume and supervise than separate terminal and browser windows.

### Product hooks already present

- Saved projects, favorites, session restore, external detection, resume/fresh actions, and terminal links reduce re-entry cost.
- Approval queues preserve attention and prevent unexpected browser replacement.
- Activity indicators and authenticated attention signals make background sessions legible.
- Capture files and delivery logs make evidence inspectable and retryable.
- Managed updates and persistent themes reduce maintenance and personalization cost.

### Missing retention evidence

- No recorded daily usage baseline.
- No measured time-to-first-success on a clean machine.
- No observed useful-capture rate, manual retry rate, wrong-session incident rate, or abandonment reason.
- No external first-success reports.

The repository therefore supports a retention mechanism hypothesis, not a retention conclusion.

## Prioritized 30–60 Day DX Backlog

1. **P0 — Run and archive a clean-machine install/first-success rehearsal.** Use a fresh Apple Silicon macOS account or machine; capture prerequisites, commands, elapsed time, permission prompts, native-build failures, Finder launch behavior, preview approval, capture, file-drop, `claude -p`, and recovery. This is the highest-value missing evidence.
2. **P0 — Put prerequisite and distribution boundaries before the root quickstart commands.** State Apple Silicon macOS, Node 22.12+, Xcode CLT, unsigned source build, and `claude`-only direct delivery before `npm install` so failures are not discovered out of sequence.
3. **P1 — Provide one supported first-success verification entry point.** Wrap or document the existing smoke/E2E route so a contributor can obtain an explicit result for session creation, preview queue, approved open, console capture, screenshot, file-drop, and optional delivery.
4. **P1 — Make delivery continuity explicit at the decision point.** State in the capture modal that `SEND — claude -p` starts a separate one-off Claude process; show file-drop/manual handoff as the current Codex/Grok-safe route.
5. **P1 — Execute the existing daily-driver measurement record.** Record at least five workdays using the fields already defined in `tasks/record-todo.md`; promote only repeated friction into implementation or documentation tasks.
6. **P2 — Add first-run diagnostics if the rehearsal shows repeated setup failures.** Prefer a small preflight for Node, Xcode tools, agent CLI availability, PATH, Automation permission status, and writable local storage rather than speculative onboarding UI.
7. **P2 — Defer signed/universal distribution and automatic retention controls until controlled-preview evidence proves they block adoption.** Both are real broader-OSS concerns but are not yet verified blockers for the current solo-builder route.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| Chromux now has a runnable source and packaged-app journey. | `README.md`; `prototype/README.md`; `prototype/package.json`; `prototype/main.js`; `prototype/renderer/`; tag list through `chromux-v0.30.2`. | The canonical pre-implementation claim is obsolete. | High | Evidence-backed | Replace the old acceptance-map framing in the eventual canonical artifact. |
| The paired preview/capture loop works on the configured machine. | `prototype/examples/transcripts/first-local-loop.md`; sample payload/screenshot; preview-queue and capture-record tests passing 2026-07-18. | The core first-success route is technically feasible and exercised. | High | Evidence-backed, environment-bounded | Shift from feasibility work to reproducibility and user-comprehension proof. |
| A clean developer can reproduce the install path from docs alone. | Commands and prerequisites exist, but no clean-machine run log or external report exists. | Repository completeness is insufficient to claim fresh-user reproducibility. | Low | Unproven | Make a clean-machine rehearsal the top priority. |
| Ordinary preview/capture/delivery failures preserve a next action. | Troubleshooting guide; disk-first capture; manual retry command; delivery log; targeted tests. | Recovery architecture is strong and inspectable. | High | Evidence-backed for implementation; unproven for novice comprehension | Validate recovery with a first-time-user rehearsal rather than redesigning it speculatively. |
| Direct capture delivery preserves the paired live agent conversation. | `deliver-claude` starts a one-off `claude -p`; docs call it one-off; file drop is the fallback. | Project-directory targeting is not live-session context injection. | High | Evidence-backed | Clarify continuity before send and avoid implying cross-agent live delivery. |
| Chromux is a daily-driver candidate. | Restore, projects, favorites, attention, queue, capture, updates, themes, and tests exist. | The product has the mechanics required for repeated use. | Medium-high | Evidence-backed capability; usage unproven | Begin a bounded five-day usage record. |
| Chromux currently improves daily productivity or retention. | No completed metrics, telemetry, user reports, or multi-day observation in the repository. | Capability breadth cannot establish benefit or retention. | Low | Unproven | Do not claim productivity or retention; collect local observation first. |
| Team rollout should remain deferred. | Approved scope; privacy doc lists absent enterprise controls; no multi-user evidence. | Team work adds unsupported policy and distribution scope. | High | Evidence-backed boundary | Keep the 30–60 day backlog focused on the solo route. |

## Assumptions And Confidence Register

| Assumption | Confidence | What is known | What remains unknown | Evidence that would change it |
| --- | --- | --- | --- | --- |
| Apple Silicon source install is tolerable for the primary builder. | Medium | The configured repo builds and documents the route. | Clean-machine time, failure rate, and remediation burden. | Archived clean-machine rehearsal. |
| Explicit preview approval is less disruptive than auto-open. | Medium-high | The behavior is implemented, documented, and tested; it preserves queue state. | Whether users perceive approval as safety or extra friction. | Daily-driver observations or first-success reports. |
| One-off `claude -p` plus file drop is sufficient for current capture delivery. | Medium | Delivery and retry are implemented and proven on the configured machine. | Context fragmentation and Codex/Grok handoff cost in real work. | Useful-capture and manual-handoff observations. |
| Saved projects, restore, favorites, and attention signals improve retention. | Medium | The mechanisms exist with regression coverage. | Frequency of use and reduction in re-entry/cognitive cost. | Five-day usage record and abandonment reasons. |
| Broader OSS users will accept unsigned arm64 source distribution. | Low | A controlled-preview form and install docs exist. | External setup tolerance, Gatekeeper expectations, Intel needs. | External first-success reports. |
| Automatic cleanup is not yet a primary blocker. | Medium-low | Manual cleanup is documented; artifacts never expire. | Real storage growth and user maintenance burden. | Multi-day capture volume and cleanup incidents. |

## Alternatives Considered

### Expand the primary route to managed GBlockParty workspaces

Rejected for this pass. `docs/gblockparty-iaas-integration.md` describes a proposed boundary, but the approved scope is the current local cockpit. Managed execution would mix future architecture with current DX evidence.

### Prioritize signed/notarized distribution now

Deferred. Signing is likely necessary for broader public distribution, but no external install evidence shows it is the current 30–60 day bottleneck. Clean-machine proof comes first.

### Add telemetry to answer retention questions

Rejected for now. The project explicitly has no product telemetry, and the primary-user scope can be evaluated through the existing opt-in local observation record without creating a new data surface.

### Auto-open detected previews to reduce clicks

Rejected. Approval-gated previews are an intentional, tested attention and safety boundary. Measure whether the click causes material friction before reversing it.

### Build direct live-session injection for every agent immediately

Deferred. The current adapter boundary should be made explicit first. Promote live injection only if repeated manual handoff or context fragmentation is observed.

## Rejected Or Lower-Confidence Findings

- **Rejected:** “No runnable app exists.” This is contradicted by the prototype, package scripts, docs, proof artifacts, tests, and releases.
- **Rejected:** “Install and launch are verified for a fresh developer.” The evidence proves one configured environment, not reproducibility.
- **Rejected:** “Capture delivery returns evidence to the paired live agent session.” Current direct delivery starts a separate `claude -p` process; pairing identifies project/session metadata but not live conversational continuity.
- **Lower confidence:** “Approval gating improves productivity.” It is an intentional and coherent design choice, but no usage evidence compares it with auto-open or external-browser habits.
- **Lower confidence:** “Themes and activity indicators improve retention.” These features plausibly reduce friction and increase legibility, but no retention observation exists.
- **Rejected:** “Team rollout is the next maturity step.” The approved route and evidence support a solo-builder proof phase first.

## Source Coverage Gaps

- No clean-machine or clean-user macOS install log.
- No verified Intel Mac, Windows, or Linux route; these are outside the approved primary scope.
- No external first-success issue, interview, support conversation, or usability observation supplied in the repository.
- No completed five-day daily-driver record despite the runnable-app condition now being met.
- No comparative measurement against separate Terminal plus Chrome.
- No evidence that the current `claude -p` delivery preserves or should preserve live-session context.
- No direct verification in this pass that GitHub `/releases/latest` exposes `chromux-v0.30.2`; the evidence boundary was repository-only.
- No storage-growth measurement for captures, logs, browser profile, or favorites during repeated use.
