# Chromux - Devtool Adoption Research

_Producing skill: `$devtool-adoption` · Status: canonical approved artifact · Date: 2026-07-06 · Concept slug: `chromux` · Finalized from Stage 3 approval_

## Executive Adoption Stance

Chromux should use a proof-led adoption strategy. The first adoption loop is not public launch, community growth, or package distribution; it is the builder repeatedly choosing Chromux over manual terminal plus Chrome during real multi-agent work. Until the stack spike and capture-to-agent handoff are proven, public-facing adoption should be limited to repository readiness, proof artifacts, and narrowly scoped examples.

The durable adoption wedge is the same wedge identified by the existing positioning and DX research: each terminal-native Codex or Claude Code session gets a paired preview, the preview is detected or queued without stealing focus, and the user can send a bounded browser evidence payload back to the correct agent. Adoption work should make that loop easy to observe, repeat, and trust.

Recommended adoption sequence:

1. **Private daily-driver proof:** validate the full local loop on the builder's machine with manual records and proof fixtures.
2. **Repo-readiness proof:** add README, capture payload contract, troubleshooting, privacy/local-data docs, and examples only after runnable commands or fixtures exist.
3. **Controlled OSS preview:** publish source or invite a small set of agent-driven developers only after install/run and failure recovery are documented.
4. **Community growth:** enable broader GitHub Issues, Discussions, templates, and recurring adoption reviews only after external users can reach first success without direct handholding.

## Adoption Loops

### Loop 1 - Builder Daily-Driver Loop

**Goal:** prove Chromux is faster and less distracting than manual terminal plus Chrome for the builder's real work.

**Trigger:** the builder starts one or more Codex or Claude Code sessions that may produce `localhost` or local HTML previews.

**Loop:**

1. Launch Chromux locally.
2. Start Codex or Claude Code session commands from existing shell/auth context.
3. Let an agent emit a `localhost`, loopback, or local HTML preview.
4. Detect and route the preview to the originating session's paired pane, or badge it in a review queue.
5. Inspect without leaving Chromux.
6. Capture URL, page title, selected selector/HTML excerpt, console tail, screenshot path, session ID, and optional notes.
7. Deliver via `claude -p` candidate adapter or file-drop fallback.
8. Record whether the agent could act on the evidence and whether the builder stayed in Chromux.

**Activation event:** first successful preview-route-plus-capture-plus-delivery on a real task.

**Retention event:** three real coding sessions in one week where the builder reviews previews in Chromux instead of external Chrome and sends at least one useful capture.

**Do not optimize yet:** onboarding polish, public release packaging, team settings, monetization, broad compatibility claims, or social/community growth.

### Loop 2 - Repo-Readiness Loop

**Goal:** make the wedge inspectable by a future user or contributor without pretending the product is ready before proof exists.

**Trigger:** the stack spike and capture-to-agent spike produce concrete commands, screenshots, payloads, and failure notes.

**Loop:**

1. Update README with current status and first local loop quickstart.
2. Publish `docs/capture-payload.md` with the versioned YAML schema and one complete sample.
3. Add `examples/` fixtures: payload, screenshot path, demo transcript, and a failure-recovery example.
4. Add troubleshooting and privacy/local-data docs before making local-first or private-by-default claims.
5. Re-run the first local loop from a clean checkout and revise docs until the commands match reality.

**Activation event:** a developer can understand what Chromux does, run or inspect the first loop, and find where capture data lives.

**Retention event:** quickstart/docs are updated after each stack or payload proof, rather than drifting behind the implementation.

### Loop 3 - Controlled OSS Preview Loop

**Goal:** test whether the problem exists beyond the builder without opening a support-heavy public launch.

**Trigger:** the builder has daily-driver proof and repo-readiness artifacts are present.

**Loop:**

1. Publish or invite a small set of developers already using terminal-native coding agents.
2. Ask them to run exactly one first-success scenario: start an agent, detect a preview, capture evidence, and retry manually if delivery fails.
3. Collect structured feedback through a GitHub issue form or private notes, with required fields for OS, CLI, auth state, preview type, capture result, and fallback path.
4. Convert repeated failures into docs or implementation tasks.
5. Avoid broad launch until at least two external users reach first success without synchronous help.

**Activation event:** first non-builder user completes the first-success scenario.

**Retention event:** a non-builder user returns for a second real session or files a concrete improvement issue after using Chromux.

### Loop 4 - Public Community Loop

**Goal:** support pull-based discovery and maintainable feedback once the project can absorb it.

**Trigger:** install/run path, examples, privacy docs, troubleshooting, and at least one external first-success proof exist.

**Loop:**

1. Enable GitHub Issues with structured templates for bug, first-success report, and capture-delivery failure.
2. Enable GitHub Discussions only when there is enough demand for open-ended questions, ideas, or usage reports.
3. Track repository traffic, referring sites, clone counts, stars, issues, and first-success reports.
4. Publish release notes only when a build or source snapshot is genuinely usable.
5. Periodically prune stale claims and route recurring support questions back into docs.

**Activation event:** a new visitor can self-serve through README, examples, and issue templates.

**Retention event:** external users file actionable reports, return after fixes, or share reproducible examples.

## Examples To Build First

| Example | Purpose | Required evidence | Readiness gate |
| --- | --- | --- | --- |
| Vite or equivalent localhost preview | Demonstrates the core dev-server path | Terminal transcript, detected URL, paired pane screenshot, capture payload, delivery log | After preview detection works |
| Local alignment-page HTML review | Demonstrates `file://` or local-path preview, which is central to this repo's workflow | Local file path, paired pane screenshot, selected element capture, payload excerpt | After local file loading behavior is understood |
| Multiple previews detected | Shows attention-safe routing instead of wrong-pane updates | Event log, picker or queue screenshot, selected route record | After dedupe/picker behavior exists |
| Capture delivery failure | Proves recovery when `claude -p` exits non-zero or auth is missing | Payload path, command attempted, exit status, manual retry instructions | During payload spike |
| Manual baseline comparison | Shows why Chromux beats terminal plus Chrome copy/paste | Timed or narrated transcript for manual path vs. Chromux capture path | After first end-to-end proof |

The examples should be concrete fixtures, not marketing screenshots. For each example, store enough artifact detail that a developer can tell what happened: command, preview URL/path, originating session ID, screenshot path, payload path, delivery target, and failure or success state.

## Templates And Reusable Artifacts

### Capture Payload Fixture

Create `examples/captures/sample-capture.yaml` after the payload proof. It should match the eventual `docs/capture-payload.md` schema and include bounded placeholders rather than private data.

Minimum fields:

```yaml
schema_version: "chromux.capture.v1"
captured_at: "2026-07-06T00:00:00Z"
originating_session_id: "session_example"
project_path: "/path/to/project"
url: "http://localhost:5173/"
page_title: "Example App"
selected_element:
  selector: "main button[data-testid='submit']"
  outer_html_excerpt: "<button data-testid=\"submit\">Submit</button>"
console_tail:
  truncated: false
  lines:
    - level: "error"
      message: "Example bounded console entry"
screenshot_path: "examples/captures/sample-screenshot.png"
delivery:
  target: "claude -p"
  status: "not_sent_sample"
capture_notes: "Example fixture; not real project data."
```

### Demo Transcript Template

Create `examples/transcripts/first-local-loop.md` once commands exist:

| Section | Contents |
| --- | --- |
| Setup | macOS version, Chromux command, agent CLI command, project path redacted if needed |
| Preview detection | Terminal output that emitted the URL/path, parsed candidate, selected route |
| Review | Pane state, queue state, screenshot reference |
| Capture | Payload path, screenshot path, selected element, console-tail bound |
| Delivery | Adapter, target, exit status, fallback if any |
| Outcome | Agent response summary and whether manual Chrome was avoided |

### Issue And Feedback Templates

Use GitHub issue forms only after external preview is appropriate. GitHub's current docs support issue and pull request templates as a way to standardize contributor input, and issue forms can require structured fields. That maps well to Chromux failures because support quality depends on OS, CLI, auth state, preview type, payload path, screenshot outcome, and delivery adapter.

Proposed templates:

| Template | Use | Required fields |
| --- | --- | --- |
| First-success report | Confirms an external user completed the wedge | macOS version, agent CLI, preview type, capture result, delivery result, docs gap |
| Preview routing bug | Debugs missing or wrong previews | terminal output excerpt, expected URL/path, actual pane/queue state, session count |
| Capture delivery bug | Debugs payload or `claude -p`/file-drop failures | payload path, schema version, delivery adapter, exit status, manual retry result |
| Docs gap | Routes adoption friction into docs | page/path, attempted step, missing or misleading detail |

### Community Health Files

Before broad OSS:

- `README.md` with status, first loop, examples, help path, and maintainer status.
- `LICENSE` once the release posture is chosen.
- `CONTRIBUTING.md` only when the maintainer is willing to review external contributions.
- `SECURITY.md` before encouraging external use, because captures may include sensitive local evidence.
- `CODE_OF_CONDUCT.md` if broad community participation is invited.
- `.github/ISSUE_TEMPLATE/*.yml` after the first external preview cohort.
- `.github/PULL_REQUEST_TEMPLATE.md` after contribution workflow exists.

## Community Channels

| Channel | When to use | What to publish | Do not use for |
| --- | --- | --- | --- |
| Private repo or private notes | Now | Builder daily-driver records, stack and payload spike notes | Public adoption claims |
| Public GitHub repository | After runnable source or credible proof fixtures | README, examples, docs, issues if supportable | Broad launch without quickstart |
| GitHub Issues | Controlled OSS preview | Structured bug reports, first-success reports, docs gaps | Open-ended ideation or support chat |
| GitHub Discussions | After repeated open-ended questions or ideas | Q&A, roadmap input, usage patterns, polls | Replacing missing docs or debugging templates |
| Release notes | After a usable build/source snapshot | Changes that affect install/run/capture behavior | Marketing updates with no runnable artifact |
| Blog/post/social thread | After daily-driver proof and self-serve docs | One concrete demo of the wedge and what is not ready | Acquisition before support paths exist |
| GBlockParty surface | Deferred | Managed-infra story only after Chromux is part of daily workflow | V1 adoption or monetization |

GitHub Discussions should be deliberately delayed. GitHub positions Discussions as a central place for project direction, Q&A, announcements, and community conversation. Chromux does not yet have enough public usage to justify that surface; early feedback should be structured so preview/capture failures become actionable.

## Proof Artifacts

| Proof artifact | Question answered | Owner/status | Blocks |
| --- | --- | --- | --- |
| `cmux` stack spike note | Can the chosen base embed Chromium and expose capture hooks? | Missing | README quickstart, public stack claims |
| Capture-to-agent spike transcript | Does payload generation plus `claude -p` or file-drop delivery work? | Missing | examples, payload docs, adoption claims |
| Sample capture YAML | What exactly does one-click capture create? | Missing | docs/capture-payload.md, issue templates |
| Paired-pane screenshot | Can a user see terminal session and preview association? | Missing | README visual proof, public demo |
| Review queue screenshot/transcript | Does Chromux avoid hot-swapping active review? | Missing | attention-safety claim |
| Failure-recovery transcript | Can a failed detection/capture/delivery be retried manually? | Missing | troubleshooting docs |
| Local data map | Where do payloads, screenshots, logs, browser profiles, and history live? | Missing | privacy/local-data docs |
| Manual baseline comparison | Is Chromux faster or clearer than terminal plus Chrome copy/paste? | Missing | adoption confidence |

## Activation And Retention Metrics

Start with local/manual metrics. Do not add telemetry until storage, privacy, retention, and disclosure docs exist.

### Builder Metrics

| Metric | How to record | Target signal | Risk indicated |
| --- | --- | --- | --- |
| Real sessions launched in Chromux | Manual daily note or local event log | Chromux becomes default cockpit | Builder keeps launching agents outside Chromux |
| Previews reviewed in Chromux vs. Chrome | Manual tally per day | Chromux reduces alt-tab review | External browser remains faster |
| Capture payloads generated | Local payload log count | Evidence capture becomes habitual | Capture is unused or too slow |
| Useful capture rate | Manual mark after agent response | Payload reaches actionable context | Delivery fragments context or lacks evidence |
| Manual retry rate | Delivery log and notes | Low retry indicates trust | High retry means detection/delivery is not reliable |
| Wrong-session or wrong-preview incidents | Event log | Pairing model holds | Wedge becomes unsafe |
| Time to first local loop | Stopwatch during clean run | Quickstart can later be credible | Setup remains too fragile |

### OSS Preview Metrics

| Metric | Source | Target signal | Caveat |
| --- | --- | --- | --- |
| First-success reports | GitHub issue form or private feedback | Non-builder can complete the wedge | Requires docs and runnable path first |
| Unique clone/view/referrer trends | GitHub repository traffic | Interest after public sharing | GitHub traffic is a 14-day window and not product activation |
| Issues by category | Labels/forms | Repeated failure modes surface | Needs maintainer capacity |
| Discussion Q&A answered | GitHub Discussions, later | Community can self-help | Only useful after enough public users exist |
| Return users or repeat reporters | Issues/discussions/releases | Retention beyond curiosity | Hard to infer without telemetry |

## Follow-Up File Changes Applied In Stage 3

These approved follow-up changes were applied during Stage 3 finalization.

### `research/devtool-adoption.md`

Canonical artifact written, preserving:

- Executive adoption stance.
- Adoption loops.
- Examples and templates.
- Community channels.
- Proof artifacts.
- Activation and retention metrics.
- Evidence matrix.
- Assumptions/confidence register.
- Source coverage gaps.

### `tasks/todo.md`

Remove the completed priority documentation item for `$devtool-adoption`.

Add implementation/documentation tasks, unless already present:

- Add `examples/transcripts/first-local-loop.md` after the stack and payload spikes produce real commands. _(source: `research/devtool-adoption.md`)_
- Add `examples/captures/sample-capture.yaml` and matching screenshot fixture after the payload schema is proven. _(source: `research/devtool-adoption.md`)_
- Create `.github/ISSUE_TEMPLATE/first-success-report.yml` after the project is ready for controlled OSS preview. _(source: `research/devtool-adoption.md`)_

### `tasks/record-todo.md`

Create if absent, with non-blocking records:

- Record builder daily-driver adoption metrics after a real Chromux build exists: sessions launched, previews reviewed in Chromux, captures generated, useful capture rate, manual retry rate, and wrong-session incidents. Source: `research/devtool-adoption.md`. Condition: runnable Chromux app exists. Promotion rule: promote failures to `tasks/todo.md` when the same friction occurs in two real sessions.
- Record OSS preview first-success reports after public or invited preview begins. Source: `research/devtool-adoption.md`. Condition: at least one external user is invited. Promotion rule: promote repeated failure categories to implementation or docs tasks.

### `tasks/recurring-todo.md`

Create if absent, with cadence-based review:

- Monthly adoption-readiness review after runnable app exists. Owner/agent: `$devtool-adoption` or current devtool workflow. Evidence path: `research/devtool-adoption.md`, GitHub traffic, issue labels, examples, and local adoption notes. Escalate if docs lag implementation or first-success failures repeat.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Decision impact |
| --- | --- | --- | --- | --- |
| Adoption should be proof-led, not launch-led | Local `research/idea-brief.md`, `research/devtool-positioning.md`, `research/devtool-dx-journey.md`, and `research/devtool-docs-audit.md` all say the repo is pre-implementation and the first loop is unproven. | Public adoption before stack and payload proof would create trust/support debt. | High | Prioritize proof artifacts and private daily-driver metrics. |
| The adoption wedge is session-paired review plus capture routing | Local idea brief, positioning, DX journey, and integration map all identify 1:1 session-preview pairing, preview detection, review queue, and browser evidence capture. | Examples and metrics should measure the full loop, not app launch or browser co-location. | High | First-success definition stays preview-route-capture-deliver. |
| README and community files are public adoption basics | GitHub docs say READMEs explain project purpose, usefulness, getting started, help, and maintainers, and that README plus license, contribution guidelines, and code of conduct communicate expectations. Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes | Repo readiness should precede public OSS outreach. | High | Add README and community files only when the project is ready to support their promises. |
| Issue forms are appropriate once external users are invited | GitHub docs describe issue/PR templates and issue forms for standardizing contributor input and requiring structured fields. Source: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates | Chromux support reports need structured data about OS, CLI, preview, capture, and delivery state. | High | Use issue forms for controlled OSS preview, not free-form bugs first. |
| Discussions should be delayed until open-ended community conversation exists | GitHub docs frame Discussions as project direction, Q&A, announcements, polls, and open-ended conversation. Source: https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions | Early Chromux feedback is better handled through structured reports until usage patterns emerge. | Medium-high | Defer Discussions until repeated questions/ideas appear. |
| GitHub traffic is useful interest data but not activation | GitHub docs say repository traffic includes clones, visitors from the past 14 days, referrers, and popular content. Source: https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository | Traffic can show discovery after public sharing, but cannot prove first success or retention. | High | Pair traffic with first-success reports and local usage records. |
| Trust docs are required before public local-first claims | Local docs audit and integration map say captures include screenshots, DOM, console logs, URLs, file paths, browser profile decisions, and command logs. | Local-only is not automatically safe or understandable. | High | Publish privacy/local-data docs before broad claims. |

## Assumptions And Confidence Register

| Assumption | Current confidence | Why | What would change it |
| --- | --- | --- | --- |
| The builder is the only validated user right now | High | Local idea brief explicitly defines n=1 primary beneficiary and no external validation. | External interviews, installs, or issue reports show repeated demand. |
| Private daily-driver proof should precede OSS preview | High | No runnable app, README, package manifest, or proof artifacts exist in this checkout. | Hidden implementation or working release artifacts are added. |
| Issue forms will be better than free-form issues for early preview | Medium-high | Chromux failures depend on structured environment and workflow details. | Maintainer prefers conversational support and support volume is tiny. |
| GitHub Discussions are premature | Medium-high | The project has no public users yet and no broad Q&A demand. | Repeated external questions appear after README/examples exist. |
| Manual/local metrics are enough before telemetry | High | Trust docs are missing and monetization is deferred. | User explicitly approves telemetry design plus disclosure work. |
| Public community health files should wait for maintainership capacity | Medium | Contribution, security, and code-of-conduct files imply process commitments. | User chooses an immediate public OSS release posture. |

## Source Coverage Gaps

- No runnable Chromux implementation, package manifest, README, docs folder, example fixtures, or screenshots exist in this checkout.
- No `cmux` source or stack spike was inspected in this pass.
- No end-to-end preview detection, capture generation, screenshot, or delivery command was run.
- No external user interviews, OSS installs, issues, or community feedback exist.
- Public-source checks were intentionally narrow and limited to current GitHub primary documentation for repository/community surfaces.
- No social media, Discord/Slack, Hacker News, Reddit, Product Hunt, or launch-channel research was performed; those channels are premature for the approved balanced scope.
