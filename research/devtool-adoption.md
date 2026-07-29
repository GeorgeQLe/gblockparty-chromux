# Chromux — Devtool Adoption Research

_Producing skill: `$devtool-adoption` · Status: canonical approved artifact · Finalized: 2026-07-27 · Evidence snapshot: 2026-07-27 · Concept slug: `chromux`_

- Canonical destination: `research/devtool-adoption.md`
- Archived working packet: `docs/history/archive/2026-07-27/131810/research/_working/preliminary-devtool-adoption-research.md`
- Approved decision horizon: 30–60 days
- Approved activation target: technical solo builders using Claude Code, Codex, or Grok Build on Apple Silicon macOS
- Evidence boundary: current repository and git history, approved interrogation records, adjacent dated research, current GitHub repository/release state, official GitHub and Apple guidance, and four primary-source comparable proof patterns
- Outcome-evidence limitation: no completed daily-driver record, clean-machine first-success report, attributable external user report, or measured retention outcome was supplied

## 1. Approval Record

The final compiled Stage 1 YAML approved:

- The 30–60 day proof-led research scope and stated non-goals.
- The planned source categories, with no decision-critical coverage added.
- The assumptions, confidence levels, and explicit outcome-evidence limitations.
- The flat working path and unchanged canonical destination.
- Archive-before-replace handling and the staged file-mutation boundary.
- A structured, evidence-dense Stage 2 review format.

The final compiled Stage 2 YAML approved the artifact verdict, research completeness, assumptions and confidence treatment, canonical destination, four-file mutation boundary, and review format without requested edits or unresolved feedback. This canonical artifact preserves the approved research substance. The Stage 2 working packet was archived before canonicalization.

## 2. Executive Verdict

### Recommendation

**Hold an actively supported controlled OSS preview until five proof gates are closed.**

Chromux is no longer a feasibility prototype. The current checkout is a feature-rich Electron application with source and packaged-app commands, macOS and Windows/WSL2 routes, paired agent/browser sessions, approval-gated previews, local capture persistence, live-session Composer routing in the current `0.64.0` candidate, troubleshooting and privacy documentation, a first-success issue-form draft, many regression fixtures, and a passing smoke check.

The missing evidence is adoption evidence:

1. No clean Apple Silicon install and first-success record shows that a fresh developer can reproduce the route from the published docs.
2. No dated record shows the builder voluntarily chose Chromux for at least three real sessions in seven days.
3. The repository has real localhost mechanics tests, but no durable user-facing localhost → approved preview → capture → actionable response fixture.
4. Failure behavior is documented and regression-tested, but no preserved operator transcript demonstrates recovery from a real delivery or capture failure.
5. No non-builder has completed the documented first-success loop without synchronous help.

The source repository is already public. “Controlled OSS preview” should therefore mean **an intentionally invited and supported cohort on a named immutable build or source revision**, not the act of making the code visible.

### Go / hold decision

| Decision | Current result | Why |
| --- | --- | --- |
| Continue founder daily-driver proof | **Go now** | Product mechanics and focused checks are credible enough to measure real use. |
| Complete reproducibility and recovery proofs | **Go now** | Exact gaps are known and can be closed without widening product scope. |
| Invite one non-builder | **Hold until internal gates pass** | A self-serve test is useful only after the install route and core fixture are stable enough to observe rather than rescue. |
| Treat the repository as an actively supported preview | **Hold** | The latest release has no attached assets; the issue form is not on the current default branch; no external first-success or support outcome exists. |
| Run a broad public launch | **Excluded** | Explicit Stage 0 non-goal and unsupported by current outcome evidence. |

### Five required proof gates

| Gate | Pass condition | Current state |
| --- | --- | --- |
| Daily-driver value | At least three voluntarily chosen real Chromux sessions in seven days, including one complete preview/evidence/agent-response loop and reasons for choosing or leaving Chromux | **Unproven** |
| Clean install and first success | Fresh Apple Silicon account or machine follows published prerequisites and completes the loop; elapsed time, prompts, failures, and remedies are archived | **Unproven** |
| Durable localhost proof | A stable fixture starts a real HTTP development server, enters the approval queue, opens only after approval, captures evidence, and records the resulting agent action | **Partial mechanism proof only** |
| Recovery proof | A real or deliberately induced failure preserves the payload, exposes the documented next action, and is recovered without hidden intervention | **Documented and tested; not observed** |
| Self-serve preview proof | One non-builder completes first success without synchronous help and files the structured report | **Unproven** |

## 3. Freshness Delta And Current Product State

The Stage 1 page described version `0.61.8`. Research found three distinct states that must not be collapsed:

| State | Evidence on 2026-07-27 | Adoption interpretation |
| --- | --- | --- |
| Latest public GitHub Release | `chromux-v0.61.9`, published 2026-07-26, no attached release assets | Public source snapshot exists; no downloadable supported binary is attached. |
| Current committed `main` / `origin/main` | Commit `bf9d9be`, package version `0.62.0`, including Windows/WSL2 work | Product scope has expanded beyond the approved Apple Silicon cohort. |
| Current dirty working tree | Package version `0.64.0`, pending release notes, full-browser routed Composer and evidence attachments, profile persistence fixes | Strong current capability evidence, but not an immutable adoption target and not yet a released proof surface. |

This packet uses the working tree to describe **present candidate capabilities** and the latest Release/default branch to describe **what an invited user could obtain reproducibly today**.

### Focused current verification

The following commands passed against the current `0.64.0` candidate on 2026-07-27:

- `npm run smoke` → `SMOKE_OK`
- `npm run test:preview-queue-renderer` → `PREVIEW_QUEUE_RENDERER_OK`
- `npm run test:capture-records-renderer` → `CAPTURE_RECORDS_RENDERER_OK`
- `npm run test:projects-renderer` → `PROJECTS_RENDERER_OK`
- `npm run test:github-update-check` → `GITHUB_UPDATE_CHECK_OK`
- `npm run test:user-data-path` → `USER_DATA_PATH_OK`
- `npm run test:full-browser-composer-renderer` → `FULL_BROWSER_COMPOSER_RENDERER_OK`
- `npm run test:composer-renderer` → `COMPOSER_RENDERER_OK`
- `npm run test:restore-session-identity` → `RESTORE_SESSION_IDENTITY_OK`

These checks establish current implementation behavior on the configured machine. They are not usage, retention, clean-install, or external-user evidence.

### Current public-repository observation

GitHub API checks on 2026-07-27 reported:

- Public repository, default branch `main`, MIT license.
- Issues enabled; Discussions disabled.
- Zero open or closed issues returned, zero stars, zero forks, and zero subscribers.
- Community profile health reported `42%`: README and license recognized; no contributing guide, code of conduct, pull-request template, or issue template recognized on the default branch.
- The local `.github/ISSUE_TEMPLATE/first-success-report.yml` exists in the working tree, but the public default-branch community profile does not yet recognize it.

These observations show an absence of attributable public adoption evidence. They do **not** show product rejection: the repository was created on 2026-07-06, no traffic snapshot was inspected, and passive counts do not measure first success.

## 4. Adoption Stance

Use a proof-led, personal-first adoption sequence:

1. **Founder daily-driver proof** — observe whether Chromux replaces terminal-plus-browser behavior voluntarily.
2. **Reproducibility proof** — demonstrate clean setup, one complete localhost loop, and recovery using durable artifacts.
3. **One-person controlled preview** — invite one non-builder on an immutable candidate and collect a structured first-success report.
4. **Supported preview decision** — only after the first report, decide whether to invite a slightly larger cohort.
5. **Broader community growth** — defer until multiple self-serve outcomes and support capacity exist.

Do not use feature count, test count, public repository visibility, release count, screenshots, stars, or traffic as a substitute for activation and retention.

## 5. Three Adoption Loops

### Loop A — Builder Daily-Driver Loop

**Audience:** the founder/builder and, later, a technically similar solo developer.

**Trigger:** a real task requires one or more terminal-native coding agents and a localhost or local HTML review surface.

Flow:

1. Start, resume, detect, or adopt a Claude Code, Codex, Grok Build, or shell session.
2. Let the session produce a loopback URL or local HTML path.
3. Confirm that the preview enters the originating session’s queue without stealing attention.
4. Approve and inspect the preview.
5. Capture or attach bounded page evidence.
6. Route the prompt/evidence through the paired or explicitly selected live session in the current candidate, or use the inspectable file-drop / one-off delivery fallback.
7. Record whether the agent response was actionable and whether Chromux was chosen again.

**Activation event:** one real task completes the approved preview → bounded evidence → inspectable routing → actionable agent-response loop.

**Retention event:** the builder voluntarily chooses Chromux for at least three real sessions in seven days.

**Failure signal:** the builder returns to terminal plus external Chrome because launch, focus, routing, evidence quality, or recovery is slower or less trustworthy.

### Loop B — Reproducibility And Proof Loop

**Audience:** maintainer and invited reviewer.

**Trigger:** a candidate commit is stable enough to test as a named proof target.

Flow:

1. Select one immutable commit or tag.
2. Run the clean Apple Silicon setup from public docs.
3. Start the durable localhost fixture.
4. Complete the approved preview/capture/response loop.
5. Deliberately exercise one recoverable failure.
6. Archive commands, elapsed time, screenshots, payload references, errors, recovery, and final result.
7. Update docs or implementation only for observed friction; rerun until the record is self-consistent.

**Activation event:** the candidate produces a complete archived proof packet.

**Retention event:** later candidate changes preserve the same verification contract and keep its docs current.

**Failure signal:** a clean run requires undocumented maintainer knowledge, destructive workarounds, or unbounded troubleshooting.

### Loop C — Controlled OSS Preview Loop

**Audience:** one invited non-builder matching the approved Apple Silicon technical-solo-builder profile.

**Trigger:** Loops A and B pass, a named candidate is available, and the first-success report form is published.

Flow:

1. Send one invitation with the immutable target, prerequisites, privacy boundary, and supported scenario.
2. Ask the participant to complete exactly one first-success scenario without synchronous help.
3. Collect the structured first-success report and any redacted recovery evidence.
4. Classify each failure as install, preview, capture, routing, agent-response usefulness, docs, or trust.
5. Convert repeated or blocking friction into repo work; do not broaden acquisition.
6. Decide whether to hold, repeat with a second invited user, or graduate to a larger preview.

**Activation event:** one non-builder completes the supported scenario without synchronous help.

**Retention signal:** the participant voluntarily returns for another real session or supplies another attributable usage report.

**Failure signal:** synchronous rescue is required, a wrong-session/data-loss incident occurs, or the participant cannot identify a safe recovery path.

## 6. Activation Path And Decision Rules

### First-success contract

First success requires all of the following:

1. A supported Chromux candidate launches.
2. A real agent or shell session runs in the intended project.
3. A real localhost URL or local HTML path is detected or explicitly opened.
4. The browser opens only after user approval.
5. Bounded evidence is persisted and visibly associated with the intended target.
6. The target agent produces an actionable response, or the fallback leaves an inspectable artifact and exact retry path.

Opening the app, opening a browser pane, running a regression test, producing a screenshot, or sending a prompt alone is not activation.

### Gate rules

| Signal | Advance | Hold |
| --- | --- | --- |
| Daily-driver week | At least 3 real sessions in 7 days and one complete activation loop | Fewer than 3 chosen sessions, unexplained abandonment, or no full loop |
| Pairing safety | No critical wrong-session or wrong-preview evidence delivery | Any unresolved critical routing incident |
| Reproducibility | Clean run completed from docs with all intervention recorded | Maintainer intervention or undocumented prerequisite required |
| Recovery | Failure preserves artifacts and documented next action succeeds | Payload/evidence loss, opaque failure, or undocumented rescue |
| External first success | One invited non-builder completes without synchronous help | Rescue required or report incomplete |

No pass threshold is set yet for time-to-first-success, useful-capture rate, or retry rate. Record the first baseline before deciding what “good” means.

## 7. Examples, Templates, And Proof Artifacts

### Requested proof-artifact inventory

| Requested artifact | Current support | Verdict | Evidence needed to close |
| --- | --- | --- | --- |
| Clean Apple Silicon install / first-success record | Root and prototype quickstarts, `npm run install-app`, troubleshooting, privacy docs, packaging code | **Missing outcome record** | Fresh account/machine run against one immutable candidate |
| Real localhost development-server fixture | Real loopback probe; projects E2E launches a minimal TCP server and queues its URL; old transcript only queues an unserved localhost URL | **Partial mechanism proof** | Stable HTTP fixture with visible page, capture, and agent-response record |
| Capture or delivery failure-recovery transcript | Disk-first capture, retry command, delivery log, recovery docs, failure regression | **Partial implementation proof** | Preserved operator transcript from induced or real failure through successful recovery |
| Daily-driver observation template | Metric obligations exist in `tasks/record-todo.md` | **Incomplete** | Reusable per-session note and seven-day rollup |
| Controlled-preview first-success report template | Local `.github/ISSUE_TEMPLATE/first-success-report.yml` is comprehensive | **Ready locally, unpublished** | Commit to default branch and exercise once with a redacted test submission or invited participant |

### Daily-driver session note template

```markdown
## Session <date/time>

- Project / task class:
- Candidate commit or version:
- Agent sessions used:
- Why Chromux was chosen:
- Preview type: localhost / local HTML / manual URL
- Full activation loop completed: yes / no
- Evidence action: capture / attach / file drop / live-session route / one-off delivery
- Agent response actionable: yes / partly / no
- Manual retry required:
- Wrong-session or wrong-preview incident:
- External Chrome or terminal fallback used:
- Reason for fallback:
- Friction worth repeating:
- Private evidence paths or redacted references:
```

Seven-day rollup:

```markdown
- Real Chromux sessions:
- Sessions with complete activation:
- Sessions using external-browser fallback:
- Useful captures / total captures:
- Manual retries:
- Critical pairing incidents:
- Voluntary return reason:
- Abandonment reason:
- Decision: continue daily-driver proof / fix and repeat / ready for clean-install gate
```

### Clean-install / first-success record template

```markdown
## Candidate

- Commit/tag:
- macOS version and Apple Silicon model:
- Account state: fresh account / fresh machine / existing account with state removed
- Start and finish time:
- Installation route:
- Prerequisites already present:
- Prerequisites installed during run:

## Steps

| Time | Command or action | Expected | Observed | Intervention | Evidence |
| --- | --- | --- | --- | --- | --- |

## First-success result

- App launched:
- Agent session launched:
- Preview queued:
- Preview explicitly approved:
- Evidence persisted:
- Agent response actionable:
- Failure exercised:
- Recovery succeeded from docs:
- Synchronous maintainer help used:
- Final verdict: pass / hold
```

### Failure-recovery transcript template

```markdown
## Failure

- Candidate:
- Failure class: preview / screenshot / capture / delivery / routing / update
- Induction or natural occurrence:
- Visible UI state:
- Persisted artifact paths:
- Log/event references:

## Recovery

1. Documented action attempted:
2. Result:
3. Additional undocumented action, if any:
4. Data or context lost:
5. Final state:

## Decision

- Recovery contract passed: yes / no
- Documentation correction:
- Implementation correction:
- Promotion rule: promote after one critical incident or two repetitions
```

### Controlled-preview first-success summary

The existing issue form already asks for macOS version, agent and version, preview type/result, capture result, delivery result, journey narrative, recovery/workaround, docs gap, and a privacy check. Preserve that structure. For the approved cohort, add the immutable Chromux version/commit and whether synchronous help was used; do not broaden it into general support intake yet.

## 8. Comparable Primary-Source Proof Patterns

These are proof-pattern comparables, not popularity rankings or feature parity claims.

| Comparable | Primary-source pattern | Transferable implication for Chromux | Limit |
| --- | --- | --- | --- |
| OpenHands local GUI | Separates platform requirements and prerequisites, recommends one launcher, distinguishes stable releases from `main`, and names setup/API-key steps after launch | Put prerequisites before commands; name one supported preview candidate; keep development state distinct from the user target | Containerized agent platform, not a paired desktop cockpit |
| Aider | Defines first use as one command plus one concrete request; shows changes, commits them, supports undo, and routes test/run output back into the loop | Make activation observable and reversible; capture the command, changed state, result, and recovery—not merely a screenshot | Terminal pair programmer, not browser-evidence routing |
| Playwright Trace Viewer | Produces a portable local artifact with action timeline, screenshots, DOM snapshots, logs, console, network, source, metadata, and retain-on-failure policies | Treat proof as an inspectable bundle; preserve failure artifacts and metadata while avoiding always-on collection | Automated test trace, richer and more invasive than Chromux’s approved bounded capture |
| Zed on macOS | Separates stable and preview channels, provides DMG/Homebrew/source routes, states requirements, documents CLI installation, Gatekeeper recovery, logs, and system information for reports | A controlled preview needs a named channel/target, explicit install boundary, and a “copy diagnostic context” pattern | Mature signed editor distribution; Chromux should not imitate its breadth before evidence |

Comparable conclusion: the strongest proof surfaces couple a narrow first action with a durable, inspectable outcome and an explicit recovery path. Chromux already has the ingredients; it lacks the observed proof packet and immutable preview target.

## 9. Community Channels And Support Boundaries

| Channel | Current decision | Entry condition | Evidence use | Boundary |
| --- | --- | --- | --- | --- |
| Root README and prototype guide | **Use now** | Keep aligned with current release/candidate | First-success instructions and trust boundary | Do not imply validated self-serve success |
| Releases and release notes | **Use now, but distinguish source snapshot from supported candidate** | Exact tag/title and complete stated install route | Immutable proof target | Latest release currently has no attached assets |
| Private daily-driver notes | **Use now** | Next real session | Retention and abandonment evidence | No forced telemetry |
| Proof fixtures and transcripts | **Use now** | Stable scenario and redacted data | Reproducibility and recovery | Fixtures are not user outcomes |
| GitHub Issues with first-success form | **Enable for the one-person preview** | Form is on default branch and internal gates pass | Structured attributable feedback | Do not open an unbounded support promise |
| GitHub Discussions | **Defer** | Repeated open-ended questions or a real community need | Q&A and direction later | GitHub defines Discussions as open-ended conversation; current evidence needs structured reports |
| GitHub traffic | **Record only after deliberate sharing** | Supported preview begins | Discovery/interest only | GitHub exposes a recent 14-day window; traffic is not activation |
| Product Hunt, Hacker News, Reddit, Discord, broad social | **Excluded / defer** | Multiple self-serve outcomes and support capacity | Later acquisition learning | Outside approved scope |

Official GitHub guidance supports the current narrow approach:

- A README should explain purpose, usefulness, getting started, help, and maintainers.
- Community health files communicate contribution expectations.
- Issue forms standardize required structured input.
- Discussions support open-ended questions, announcements, polls, and project direction.
- Releases are tag-based deployable iterations and can carry binary assets.

## 10. Distribution And Trust Boundary

The current macOS source install is unsigned. Apple states that Developer ID signing lets Gatekeeper verify software distributed outside the Mac App Store, and notarization scans Developer ID-signed software and supplies a ticket for Gatekeeper.

Decision implication:

- A clean source-build record is sufficient to test the approved technical cohort if the exact unsigned/source boundary is explicit.
- If the controlled preview distributes a downloaded `.app`, DMG, PKG, or ZIP as the supported route, signing, hardened runtime compatibility, notarization, and first-launch testing become part of the reproducibility gate.
- Do not present signing/notarization as evidence of product value; it is distribution trust and friction evidence.
- Do not expand this run into universal binaries, cross-platform packaging, enterprise deployment, or procurement.

## 11. Lightweight Team-Conversion Trigger Register

Record these signals; do not design packaging, pricing, procurement, or administration in this run.

| Signal | Evidence to record | Revisit rule | Current state |
| --- | --- | --- | --- |
| Shared-workflow demand | Attributable request to share sessions, captures, or review state | Two independent requests or repeated use by more than one developer | None |
| Managed deployment and updates | Request for controlled install, update ring, or fleet rollout | First real organization treats this as a preview blocker | None |
| Policy and retention | Request for deletion policy, encryption, audit export, or enforced retention | First attributable security/policy blocker | None |
| Support expectation | Time spent and repeated categories during preview | Same friction across two users or support exceeds a bounded maintainer budget | None |
| Hosted infrastructure | Repeated inability to run or persist local work | Two attributable requests where local-only is the blocking cause | None |

The trigger register records future demand. It must not be used to infer a buyer, price, or team package before the signal exists.

## 12. Activation, Retention, And Proof Metrics

Start with voluntary local records, not telemetry.

| Metric | Source | Current threshold or treatment | Decision use |
| --- | --- | --- | --- |
| Complete activation loops | Daily-driver note | At least one during the seven-day window | Confirms the wedge, not mere app launch |
| Real sessions chosen | Daily-driver note | At least 3 in 7 days | User-approved retention gate |
| Actionable agent responses | Session note | Record yes / partly / no; no threshold until baseline | Tests evidence usefulness |
| External-browser fallback | Session note | Record reason every time | Identifies why habit breaks |
| Useful capture rate | Useful captures / total captures | Baseline only | Guides payload/evidence changes |
| Manual retry rate | Delivery log plus note | Baseline only | Tests delivery trust |
| Wrong-session / wrong-preview incidents | Incident note | Zero unresolved critical incidents before invite | Safety gate |
| Clean-install elapsed time | Clean-install record | Baseline only | Quantifies setup burden |
| Undocumented interventions | Clean-install record | Zero for a pass | Reproducibility gate |
| Non-builder first success | First-success form | One without synchronous help | Controlled-preview gate |
| Return use | Second attributable session/report | Signal, not required for first invite | Early retention evidence |
| GitHub traffic | Repository Insights after sharing | Interest only | Discovery, never activation |

## 13. Proposed 30–60 Day Proof Plan

### Days 0–7 — Freeze the proof target and begin real-use evidence

- Choose one immutable candidate commit or tag for the proof work.
- Begin the seven-day daily-driver record on the next real session.
- Keep scope Apple Silicon for this adoption decision even though Windows/WSL2 mechanics now exist.
- Reconcile public docs to the named candidate; do not describe unreleased working-tree behavior as generally available.

Exit: three real sessions are attempted and every fallback/abandonment reason is recorded.

### Days 7–14 — Close reproducibility artifacts

- Run and archive the clean Apple Silicon install/first-success record.
- Turn the current localhost mechanism tests into one stable HTTP fixture and preserved first-success transcript.
- Run and preserve one failure-recovery transcript.
- Ensure the first-success form is on the immutable preview branch/default branch intended for the invited cohort.

Exit: clean run, localhost proof, and recovery proof pass without undocumented intervention.

### Days 14–30 — Make the one-person invite decision

- Review daily-driver and reproducibility evidence.
- If any critical pairing/data-loss issue exists, hold and fix.
- If internal gates pass, invite one matching non-builder to the named candidate.
- Collect the structured report without synchronous rescue.

Exit: one self-serve report or an explicit hold reason.

### Days 31–60 — Repeat narrowly or hold

- If first success passes, decide whether to repeat with one additional invited user.
- If it fails, convert the observed blocker into docs or implementation work and rerun the same scenario.
- At day 60, decide: supported small preview, another proof cycle, or stop investing in adoption until the product premise changes.

No broad launch work is part of this plan.

## 14. Alternatives Considered

| Alternative | Disposition | Evidence-based reason |
| --- | --- | --- |
| Invite users immediately because the repo is public | Rejected | Source visibility is not self-serve or support readiness. |
| Count tests/releases/features as adoption proof | Rejected | They prove mechanisms and activity, not chosen use or user outcomes. |
| Require signing/notarization before any proof | Rejected as universal rule | A technical source-build cohort can validate value first; binary distribution changes the requirement. |
| Add forced telemetry | Rejected | User-approved non-goal; local records answer the immediate decision. |
| Enable Discussions now | Deferred | Current feedback needs structured first-success and failure fields, not open-ended community management. |
| Run broad launch-channel research | Excluded | Approved scope explicitly excludes it. |
| Design team packaging or pricing | Deferred | No team-demand evidence exists and the approved run allows only a trigger register. |
| Approve the 2026-07-06 packet unchanged | Rejected | Product, packaging, docs, release, and workflow evidence are materially fresher. |

## 15. Evidence Matrix

| Claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| Chromux is ready for real daily-driver measurement | Current source/docs, `0.64.0` candidate, smoke and eight focused checks passing 2026-07-27 | The mechanics are credible enough to observe real use; more feature feasibility work is not the immediate adoption bottleneck | High for capability | Evidence-backed, configured-machine bounded | Start the seven-day record now |
| Chromux is not yet ready for an actively supported controlled preview | No clean-install record, no daily-driver outcome, no non-builder report, latest release has no assets, issue form not on public default branch | An invite now would test maintainer rescue and candidate drift as much as the product | High | Evidence-backed gaps | Hold invitation until internal gates pass |
| The durable wedge remains session-paired review and evidence routing | Approved intake, README, current candidate Composer route, capture contract, positioning and DX artifacts | Features have expanded, but the activation event still depends on pairing, approval, bounded evidence, and the right agent response | High | Evidence-backed | Measure the complete loop, not app launch |
| Live-session routing in the current candidate reduces the old one-off-delivery continuity gap | Current README diff, renderer implementation changes, full-browser Composer and restore tests | Evidence can now route through normal terminal-input paths, but the behavior is unreleased and unvalidated in real work | Medium-high | Candidate capability, outcome unproven | Include in daily-driver proof; do not claim released benefit |
| Clean-install reproducibility is unproven | Commands/docs exist; no fresh account/machine record; unsigned source install; Apple distribution requirements | Configured-machine success cannot establish fresh-user success | High | Unproven outcome | Make clean install the first reproducibility gate |
| Localhost support is real but the requested proof fixture is incomplete | Loopback probe and projects E2E start real local listeners and queue URLs; preserved transcript does not serve/capture a real localhost page | Mechanisms work, but a durable end-to-end adopter artifact is absent | High | Partially proven | Build one stable HTTP fixture and transcript |
| Recovery architecture is strong but user comprehension is unproven | Disk-first payload, retry command, delivery log, troubleshooting, failure tests | Artifacts should survive failure, but no observed operator followed the route | High for implementation, low for comprehension | Partially proven | Preserve one failure-recovery transcript |
| Public repository metadata supplies no adoption outcome | Public repo has no issues/stars/forks/subscribers and was created 2026-07-06; traffic not inspected | Absence of public signals is not rejection and cannot replace first-success evidence | High | Evidence-backed limitation | Do not claim users, retention, or demand |
| Issue forms are the right initial public support surface | GitHub docs; local structured first-success form | Required fields fit Chromux’s platform/preview/capture/routing failure modes | High | Evidence-backed pattern | Publish only when the one-person invite begins |
| Discussions should stay disabled | GitHub defines Discussions as open-ended Q&A, announcements, polls, and project conversation; no open-ended demand exists | Structured reports are more decision-useful at this stage | High | Evidence-backed pattern | Revisit after repeated open-ended questions |
| A portable proof bundle is stronger than a marketing screenshot | Playwright trace pattern; current capture payload/screenshots/logs | Decision-quality proof needs sequence, metadata, outcome, and recovery | Medium-high | Inference from comparable plus local evidence | Archive install and recovery packets |
| Apple signing/notarization matters if a binary is distributed | Apple Developer ID and notarization guidance; current macOS route is unsigned | Binary preview friction and trust differ from source-build proof | High | Conditional on distribution choice | Add signing/notarization to binary-preview gate only |

## 16. Assumptions And Confidence Register

| Statement | Status | Confidence | What would change it |
| --- | --- | --- | --- |
| The approved Apple Silicon technical-solo-builder cohort remains the activation target for this run | User-owned scope | High as intent | Explicit audience or platform change |
| Three real sessions in seven days is a useful retention gate | User-owned threshold | High as decision rule; outcome unproven | Measured use shows it is too weak or too strong |
| The paired cockpit/evidence loop creates recurring value after novelty | Core hypothesis | Low | Dated chosen-use and abandonment records |
| Current candidate live-session Composer routing is preferable to one-off delivery | Reasonable product hypothesis | Medium | Real use shows routing confusion, draft blocking, or low response usefulness |
| One clean source-build route is sufficient for the first invited technical user | Conditional method assumption | Medium | Participant cannot complete it or binary friction dominates |
| One non-builder self-serve success is enough to decide whether to continue a small preview | User-approved preview threshold | Medium-high | First result is too atypical or incomplete |
| GitHub Issues can contain the initial support load | Method assumption | Medium | Participant requires synchronous/private support or sensitive reports cannot be safely redacted |
| No decision-critical Stage 0 context is missing | User-confirmed | High | New evidence changes horizon, cohort, thresholds, channels, or non-goals |
| Adjacent canonical research is directionally useful but not current-state authority | Observed | High | Those artifacts are refreshed against the present candidate/release |

## 17. Rejected Or Lower-Confidence Findings

- **Rejected:** “The number of releases proves retention.” Release cadence is maintainer activity.
- **Rejected:** “Zero stars or issues means no demand.” The repository is new, traffic was not inspected, and stars/issues do not measure activation.
- **Rejected:** “The first-success form proves preview readiness.” It proves support-field design; it has not been published or used.
- **Rejected:** “The localhost fixture already exists.” The tests prove listeners, detection, readiness, and queue mechanics; they do not preserve a complete real-page capture and response artifact.
- **Rejected:** “Signing and notarization must precede any founder proof.” They matter for downloaded binary trust, not for deciding whether the local workflow creates recurring value.
- **Lower confidence:** the live-session Composer will materially improve retention. It is a fresh candidate feature with passing focused checks but no real-use evidence.
- **Lower confidence:** one invited participant will represent the broader OSS audience. The result is a directional gate, not a market estimate.
- **Lower confidence:** the first controlled cohort should remain macOS-only after Windows/WSL2 support. This is the approved scope, not a conclusion that Windows lacks potential.

## 18. Source Coverage Gaps

- No completed daily-driver notes, clean-install record, first-success report, support transcript, user quote, or interview was supplied.
- No GitHub traffic snapshot was inspected; public stars/issues/forks are not a substitute.
- No downloaded macOS binary, Developer ID signature, notarization ticket, or Gatekeeper first-launch run was inspected.
- No clean Apple Silicon account or machine was used in this pass.
- No real participant was contacted or invited.
- No broad launch-channel, social, trend, pricing, procurement, or enterprise research was performed.
- Windows/WSL2 exists in current product state but adoption readiness for that cohort was intentionally not researched.
- Comparable tools were inspected through current primary-source documentation, not hands-on comparative trials.
- Adjacent canonical positioning, docs, integration, and DX research contains stale versions or superseded “missing implementation/docs” statements; only reverified principles were reused.
- The current `0.64.0` candidate is in a dirty working tree. Passing focused checks do not make it an immutable preview target.

## 19. Downstream Implications

### Product and docs

- Freeze one candidate before asking an external person to test it.
- Treat the complete preview/evidence/response loop as the activation unit.
- Keep explicit preview approval, pairing safety, inspectable capture paths, and recovery as trust-critical.
- Keep Windows/WSL2 out of this proof run unless the scope is reopened.
- If distributing a downloaded macOS binary, add signing/notarization and first-launch proof to the gate.
- Add only evidence-driven first-run diagnostics; do not build speculative onboarding before the clean-install record shows where failure occurs.

### Adoption operations

- Start the daily-driver record on the next real work session.
- Use one immutable candidate for clean install, recovery, and external first success.
- Publish the structured issue form only when the invited cohort begins.
- Keep Discussions and broad launch channels off.
- Treat public counts and traffic as interest context only.

### Team conversion

- Record signals in the lightweight register.
- Do not create pricing, packaging, procurement, SSO, audit, or managed-retention work without attributable demand.

## 20. Applied Stage 3 Canonical And Task Changes

The final artifact-approval YAML authorized these changes on 2026-07-27.

### `research/devtool-adoption.md`

Replace the stale 2026-07-06 state with the approved substance of this packet:

- Current capability/release freshness distinction.
- Hold verdict and five proof gates.
- Three adoption loops and activation contract.
- Requested proof-artifact inventory and reusable templates.
- Community/support boundaries.
- Conditional signing/notarization boundary.
- Team-conversion trigger register.
- Metrics, 30–60 day plan, evidence matrix, alternatives, gaps, and confidence register.

### `tasks/todo.md`

Add only immediately actionable proof construction:

- Create one durable real-HTTP localhost first-success fixture and archived transcript covering queue, explicit open, capture/attach, correct target, and actionable response.
- Create one induced failure-recovery transcript proving persisted artifacts and the documented retry route.

Do not add broad launch, Discussions, pricing, team rollout, cross-platform adoption, or speculative onboarding work.

### `tasks/record-todo.md`

Replace the satisfied “after a real Chromux build exists” condition with:

- Begin the seven-day daily-driver record on the next real work session using the supplied template.
- Record one clean Apple Silicon install/first-success baseline after an immutable candidate is selected.
- Keep the invited-user first-success record conditional on internal gate completion and one participant invitation.
- Promote any critical pairing/data-loss incident immediately; promote non-critical friction after two occurrences.

### `tasks/recurring-todo.md`

Replace the satisfied “after a runnable app exists” trigger with:

- Review adoption readiness at day 30 (2026-08-26) or immediately before any invitation, whichever comes first.
- Review again at day 60 (2026-09-25) if the decision remains on hold.
- Evidence path: canonical adoption artifact, daily-driver rollup, clean-install packet, recovery transcript, first-success report, release state, and issue categories.
- Escalate on docs/candidate drift, any critical pairing/data-loss event, required synchronous rescue, or repeated first-success failure.

### Files intentionally unchanged

- App source and package metadata.
- `RELEASES.md`, Git tags, and GitHub Releases.
- Specs.
- `.github/ISSUE_TEMPLATE/first-success-report.yml` content, unless artifact feedback explicitly approves a cohort/version field amendment.
- `tasks/manual-todo.md`.

## 21. Sources

### Approved intake and local evidence

- `research/_working/interrogation-devtool-adoption-r1.yaml`
- `interrogation/devtool-adoption-r2-chromux.html`
- `alignment/devtool-adoption-chromux.html` Stage 1 archive at `docs/history/archive/2026-07-27/112331/alignment/devtool-adoption-chromux.html`
- `README.md`
- `prototype/README.md`
- `prototype/package.json`
- `prototype/main.js`
- `prototype/preload.js`
- `prototype/renderer/renderer.js`
- `prototype/docs/capture-payload.md`
- `prototype/docs/privacy-and-local-data.md`
- `prototype/docs/troubleshooting.md`
- `prototype/examples/transcripts/first-local-loop.md`
- `prototype/examples/captures/sample-capture.yaml`
- `prototype/examples/captures/sample-screenshot.png`
- `.github/ISSUE_TEMPLATE/first-success-report.yml`
- `tasks/todo.md`
- `tasks/record-todo.md`
- `tasks/recurring-todo.md`
- `research/devtool-positioning.md`
- `research/devtool-dx-journey.md`
- `research/devtool-docs-audit.md`
- `research/devtool-integration-map.md`
- `research/devtool-monetization.md`
- `RELEASES.md`
- Git history and tags through 2026-07-27
- Focused verification commands listed in Section 3
- GitHub CLI/API observations of the public repository, community profile, issues, and Releases on 2026-07-27

### Official GitHub sources

- [About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [About community profiles for public repositories](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [About issue and pull request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates)
- [About Discussions](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions)
- [About Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Viewing traffic to a repository](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)
- [GBlockParty Chromux v0.61.9](https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.61.9)

### Official Apple sources

- [Signing Mac Software with Developer ID](https://developer.apple.com/developer-id/)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)

### Comparable primary sources

- [OpenHands local setup](https://docs.openhands.dev/openhands/usage/run-openhands/local-setup)
- [Aider usage](https://aider.chat/docs/usage.html)
- [Aider linting and testing](https://aider.chat/docs/usage/lint-test.html)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Zed on macOS](https://zed.dev/docs/macos)
- [Zed troubleshooting](https://zed.dev/docs/troubleshooting)
