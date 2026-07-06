# Chromux - Devtool Docs Audit

_Producing skill: `$devtool-docs-audit` · Status: approved canonical research · Date: 2026-07-05 · Concept slug: `chromux`_

## Approval Record

Final artifact approval was received from `alignment/devtool-docs-audit-chromux.html` with no unanswered required questions and accepted section feedback.

| Gate | Decision | Impact |
| --- | --- | --- |
| Artifact Approval | `approve` | Approve this docs audit as the canonical artifact. |
| Backlog Priority | `readme` | Lead follow-up documentation work with the README quickstart. |
| Canonical Path | `approve` | Keep the approved artifact at `research/devtool-docs-audit.md`. |

Accepted sections: Executive Findings and Prioritized Documentation Backlog.

## Executive Findings

Chromux does not yet have developer-facing product documentation. The current documentation surface is strategy and research: `research/idea-brief.md`, `research/devtool-positioning.md`, `research/devtool-monetization.md`, the original interview notes, and the alignment pages. That is appropriate for pre-implementation planning, but it is not enough for a developer to install, run, evaluate, contribute to, or debug Chromux.

The highest-risk docs gap is the absence of a quickstart that proves the intended loop: launch Chromux, start a Codex or Claude Code session, detect a `localhost` or `file://` preview, review it in the paired pane, and send a browser evidence payload to the right agent. Until that path is documented as a concrete command sequence, the value wedge remains conceptual.

The second adoption blocker is the missing capture payload contract. Existing research repeatedly names the payload contents: URL, selected element selector/HTML, console tail, screenshot path, timestamp, and originating session ID. But there is no schema, sample YAML, retention note, path convention, or delivery-mode contract. That blocks implementation alignment and makes future trust claims harder to defend.

The third blocker is missing troubleshooting and trust documentation. Chromux will touch terminal sessions, local URLs, `file://` pages, screenshots, DOM snippets, console logs, CLI auth state, and possibly cookies or browser profiles. The docs need to explain what is captured, where it is stored, what is never uploaded in local-only v1, how to delete captures, and how to debug failed preview detection or failed `claude -p` delivery.

## Scope And Source Basis

This audit reviews the current repository documentation artifacts, not a shipped README or API reference, because no `README.md`, `docs/`, package manifest, implementation source, or task queue exists in the active checkout.

Reviewed artifacts:

- `research/idea-brief.md`
- `research/idea-brief-interview.md`
- `research/devtool-positioning.md`
- `research/devtool-monetization.md`
- `alignment/idea-scope-brief-chromux.html`
- `alignment/devtool-positioning-chromux.html`
- `alignment/devtool-monetization-chromux.html`
- `alignment/index.html`

## Quickstart Clarity

**Finding:** No quickstart exists.

**Evidence:** The active checkout has no `README.md`, no `docs/` guide, no package manifest, and no runnable app instructions. The current research says v1 should reduce setup to "add commands, launch sessions, auto-detect previews, review, capture," but that is product guidance rather than user documentation.

**Impact:** A future OSS user or contributor cannot reach first success. Even the builder lacks a written acceptance path for validating the stack spike.

**Recommended docs:**

- `README.md` with a "First local loop" quickstart.
- "Prerequisites" for macOS, Node/Electron or the chosen stack, Codex CLI, Claude Code CLI, and authenticated CLI state.
- "Run from source" once implementation exists.
- "Start a paired session" using concrete example commands.
- "Open a preview" for both `localhost` and local `file://` HTML.
- "Send browser evidence to agent" with the exact click/command path and expected output.
- "Verify success" with observable checks: paired pane loads, review queue badge appears, screenshot file is written, YAML payload is visible, `claude -p` invocation succeeds or fails with a clear log.

## Examples

**Finding:** Existing examples describe intent but not executable usage.

**Evidence:** The idea brief and positioning research repeatedly describe the target loop and payload contents, but there is no example session transcript, capture YAML, screenshot path, or failure case.

**Impact:** The product wedge depends on reducing manual evidence assembly. Without examples, the user cannot tell whether Chromux is simpler than terminal plus Chrome.

**Recommended docs:**

- "Example: Vite app preview" showing an agent emits `http://localhost:5173`, Chromux queues or opens it, and capture sends evidence.
- "Example: local alignment page" showing a `file://` HTML preview with no dev server.
- "Example capture payload" with URL, timestamp, session ID, selected element selector, selected element HTML excerpt, console log tail, screenshot path, and delivery target.
- "Example failure" where preview detection finds multiple ports and asks the user to pick the intended one.

## API Reference And Contracts

**Finding:** There is no API reference or implementation contract for the main integration surfaces.

**Evidence:** Current docs identify likely contracts but leave them prose-only: preview detection, session-to-pane pairing, review queue behavior, capture payload shape, `claude -p` delivery, file-drop fallback, local retention, and future stdin injection.

**Impact:** Implementation can drift. Contributors will not know what is stable. Users cannot build workflow automation around captures.

**Recommended docs:**

- Capture payload schema, initially as versioned YAML.
- Session identity and pairing model.
- Preview detection rules: stdout parsing, explicit open command, `localhost` patterns, `file://` paths, deduping, and queue behavior.
- Delivery adapters: `claude -p` v1, file-drop fallback, and deferred live-session stdin injection.
- Storage paths for screenshots, payload logs, browser profiles, and local history.
- Security/trust notes for each captured field.

## Troubleshooting

**Finding:** No troubleshooting guide exists for the highest-risk operational surfaces.

**Evidence:** The positioning and monetization research both identify trust, install, support, browser capture permissions, CLI auth state, local ports, file permissions, retention, and Electron/Chromium issues as important future documentation or support costs. None are yet translated into troubleshooting steps.

**Impact:** Early users will fail in ambiguous ways: no preview appears, wrong pane gets updated, capture cannot take a screenshot, `claude -p` is not authenticated, local file access is blocked, or captures include more data than expected.

**Recommended docs:**

- Preview does not open.
- Wrong preview opened or replaced current review.
- `file://` preview cannot load.
- Capture button disabled.
- Screenshot failed.
- Console logs missing or too large.
- `claude -p` command failed.
- CLI auth state not found.
- Payload sent to wrong session.
- Where captures are stored and how to delete them.

## Migration Paths

**Finding:** No migration docs exist from the current baseline workflows.

**Evidence:** Current research defines the baseline as manual terminal plus Chrome, and compares Chromux against Cursor, Claude Code Desktop/Web/CLI, Playwright MCP, Chrome DevTools MCP, browser-use, VS Code preview panes, and `cmux`. But no migration guide turns that competitive framing into adoption steps.

**Impact:** A developer cannot map current habits to Chromux. The key switching-cost question remains unanswered: "What do I stop doing, what do I keep, and what changes on day one?"

**Recommended docs:**

- "From terminal plus Chrome" guide.
- "From cmux" guide once the fork base is validated.
- "From Cursor or IDE preview panes" guide focused on when terminal-native session pairing is better.
- "From Playwright MCP or Chrome DevTools MCP" guide explaining that Chromux is a human review cockpit, not a replacement automation server.

## Missing Proof Artifacts

**Finding:** The docs lack proof artifacts that would make the wedge credible.

**Evidence:** The research identifies two riskiest unknowns: `cmux` extensibility for embedded Chromium and payload-to-agent handoff. It also says no hands-on trials of key alternatives were run, and no current `cmux` codebase inspection was available.

**Impact:** Docs cannot yet support strong claims like "works with cmux," "private by default," "works with any agent," "secure browser automation," or "capture sends exactly what you expect."

**Recommended proof artifacts:**

- Stack spike note proving whether the `cmux` base can host the browser pane and capture hooks.
- End-to-end demo transcript for `localhost` preview detection and capture to `claude -p`.
- Example payload fixture stored in the repo.
- Screenshot fixture showing the paired pane and review queue.
- Storage and retention map for local captures.
- Manual baseline timing comparison: terminal plus Chrome copy-paste vs. Chromux capture.

## Prioritized Documentation Backlog

1. Create `README.md` with positioning, prerequisites, current status, and the first local loop once runnable commands exist.
2. Create `docs/capture-payload.md` with a versioned YAML schema and one complete sample payload.
3. Create `docs/troubleshooting.md` covering preview detection, `file://`, screenshots, console logs, `claude -p`, and storage cleanup.
4. Create `docs/privacy-and-local-data.md` before any "private/local-first" trust claim is published.
5. Create `docs/migration/manual-browser.md` for the manual terminal plus Chrome baseline.
6. Add proof artifacts under `examples/` after the stack spike: sample payload, sample screenshot path, and a short demo transcript.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| Developer-facing docs do not yet exist | Active checkout has research and alignment artifacts but no `README.md`, no active `docs/`, and no implementation/package manifest. | The repo is still pre-implementation and pre-adoption-docs. | High | Evidence-backed | Treat docs audit as a gap map, not a polish pass. |
| Quickstart is the top blocker | Positioning research says v1 must reduce setup to "add commands, launch sessions, auto-detect previews, review, capture." No command sequence exists. | First success cannot be evaluated until this path is documented and later implemented. | High | Evidence-backed locally | Write README quickstart immediately after stack spike produces real commands. |
| Capture payload contract is the most important API doc | Idea brief and positioning research both name URL, selected DOM/selector, console tail, screenshot, timestamp/session context, and `claude -p` delivery. | The product wedge depends on a stable evidence bundle. | High | Evidence-backed locally | Create `docs/capture-payload.md` before broad contributor work. |
| Trust/troubleshooting docs are required before public claims | Monetization and positioning research warn against broad privacy/security claims without storage, screenshot retention, payload logs, and command behavior docs. | Local-first tooling still handles sensitive local evidence. | High | Evidence-backed locally | Document storage, deletion, and captured fields before publishing. |
| Migration docs can reuse positioning research | Positioning research already defines the alternatives and the manual baseline. | The comparison set can become practical migration guidance. | Medium-high | Evidence-backed locally | Create migration docs after the quickstart and payload schema. |
| Proof artifacts are missing | Research says `cmux` stack feasibility and payload handoff remain unverified. | Docs should not overclaim until these are tested. | High | Evidence-backed locally | Run stack and payload spikes before marketing/adoption docs. |

## Confidence And Assumption Register

| Item | Status | Confidence | What would change it |
| --- | --- | --- | --- |
| Current repo is pre-implementation | Evidence-backed | High | Discovery of hidden runnable source/docs outside the visible checkout. |
| `cmux` will be the fork base | Unproven | Medium | Stack spike rejects `cmux` and selects Chromium or VS Code. |
| `claude -p` is the v1 delivery path | Provisional | Medium | End-to-end payload test shows one-off prompts lose too much session context. |
| Future OSS users need installation docs | Assumed | Medium | Project stays permanently private/personal-only. |
| Local capture data can include sensitive material | Evidence-backed by feature design | High | Capture payload scope is reduced to non-sensitive metadata only. |

## Alternatives Considered

| Alternative | Why not selected |
| --- | --- |
| Treat current research as sufficient docs | It helps strategy, but it cannot get a developer to first success. |
| Wait for full implementation before writing any docs | Quickstart and payload contracts can guide the implementation spike and prevent drift. |
| Lead with migration docs | Migration depends on first having a working quickstart and capture contract. |
| Lead with API reference only | The product value is workflow-first; API docs without a working loop would be too abstract. |

## Source Coverage Gaps

- No implementation source was present in the active checkout.
- No `cmux` repository inspection was available in this audit.
- No runnable commands, package scripts, or app screenshots were available.
- No external user feedback or OSS issue data was available.
- No current task queue existed at `tasks/todo.md`.
