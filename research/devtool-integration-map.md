# Chromux - Devtool Integration Map

_Producing skill: `$devtool-integration-map` · Status: approved canonical research · Date: 2026-07-05 · Concept slug: `chromux`_

## Approval Record

Final artifact approval was received from `alignment/devtool-integration-map-chromux.html` with all required gates answered and no section feedback.

| Gate | Approved answer | Effect |
| --- | --- | --- |
| Scope Approval | `approve` | Use the proposed layer model and synthesize the canonical artifact. |
| Canonical Path | `research/devtool-integration-map.md` | Write the approved artifact to this path. |
| Research Emphasis | `balanced` | Cover setup, CLI agents, browser embedding, capture payloads, and migration risks evenly. |

## Executive Integration Stance

Chromux should integrate as a local macOS cockpit around existing terminal-native coding agents, not as a replacement runtime. Its v1 stack should preserve Codex and Claude Code CLI behavior, pair each active agent session with a browser preview pane, detect `localhost` and `file://` previews, queue review events without stealing attention, and send explicit browser evidence back to the paired agent.

The most important integration decision is to keep the first loop narrow and inspectable:

1. Launch unchanged CLI agents with their normal shell and auth state.
2. Detect or explicitly open previews for the originating session.
3. Let the user inspect the paired browser pane.
4. Capture URL, selected element selector/HTML, console tail, screenshot path, timestamp, and originating session ID.
5. Deliver that payload through a transparent v1 adapter, likely `claude -p`, with file-drop fallback and live-session injection deferred.

MCP, GBlockParty managed infrastructure, cross-machine sync, and team controls are future ecosystem surfaces. They should shape compatibility choices, but they should not become prerequisites for proving the daily-driver loop.

## Required Integrations By Layer

### 1. Host App And Desktop Shell

Chromux is currently scoped as macOS-first desktop software, likely from the intended `cmux` fork base. The host layer must support terminal panes, an embedded Chromium preview pane, local file preview handling, screenshot capture, keyboard focus discipline, and a compact layout that works on a laptop screen.

Required host behaviors:

- Run as a local desktop app on macOS first.
- Preserve terminal multiplexer ergonomics for parallel agent sessions.
- Embed browser previews without forcing a separate external Chrome window for the core loop.
- Avoid hot-swapping the active preview when a background session emits a new URL.
- Maintain a review queue or badge for pending previews.
- Store captures locally with visible paths and deletion guidance.

Unverified dependency: the real `cmux` codebase is not present in this checkout, and the idea brief labels fork-base extensibility as the riskiest unknown. BrowserView, webview, or equivalent support must be proven by a stack spike before implementation docs or product claims harden.

### 2. CLI Agent Runtime

Chromux should wrap Codex and Claude Code CLIs without modifying them or owning their credentials. Agent launch should behave like a normal terminal session: same shell expectations, same authenticated CLI state, same project directory, and clear process lifecycle.

Required agent-runtime behaviors:

- Configurable launch commands for Codex and Claude Code.
- Project/session identity tied to the terminal pane and paired browser pane.
- Environment passing that does not silently break CLI auth, PATH, or project-local tooling.
- Legible failure states when a CLI is not installed, not authenticated, or exits.
- Separation between session orchestration and agent logic.

The shared abstraction should be session-oriented rather than vendor-oriented: Chromux can treat Codex and Claude Code as terminal processes with metadata, while delivery adapters can vary by agent when needed.

### 3. Preview Detection And Review Queue

Preview detection is part of the product wedge. Chromux should map URLs and local HTML paths to the originating agent session, then open or queue the preview in that session's paired browser pane.

Required detection inputs:

- Terminal stdout/stderr URL parsing for `localhost`, `127.0.0.1`, and likely `0.0.0.0` dev-server URLs.
- Local `file://` or filesystem path detection for generated HTML such as alignment pages.
- Explicit user or agent open commands as a lower-ambiguity path.
- Deduping so repeated dev-server logs do not spam the queue.
- Redirect or picker behavior when multiple candidate previews appear.

Required queue behavior:

- If the paired pane is idle or already showing that session's preview, open or refresh.
- If the user is actively reviewing another preview, badge and queue instead of stealing focus.
- Preserve originating session ID so capture payloads route back to the right agent.
- Keep enough event history to explain why a preview opened or queued.

### 4. Embedded Browser Evidence

Chromux's browser pane should prioritize review and evidence capture over general browsing. The evidence payload should be stable, inspectable, bounded, and local by default.

Minimum v1 capture fields:

- `schema_version`
- `captured_at`
- `originating_session_id`
- `project_path`
- `url`
- `page_title`
- `selected_element.selector`
- `selected_element.outer_html_excerpt`
- `console_tail`
- `screenshot_path`
- `delivery_target`
- `capture_notes` or user-entered context

Boundaries:

- Full network/HAR capture is deferred.
- Cookie and storage capture should be avoided unless explicitly designed and documented.
- DOM and console payloads should be bounded to prevent huge prompts and accidental data sprawl.
- Screenshot paths and payload files should be visible before delivery where practical.

### 5. Payload Delivery

The intended v1 delivery path is one-off `claude -p` invocation. That fits the current idea brief and the positioning research's conclusion that Claude Code's CLI composition is a plausible first target. It is still provisional because it may fragment context if the user expects captured evidence to land inside an already-running session.

Delivery priorities:

- Start with transparent `claude -p` delivery or file-drop fallback.
- Log the exact target, payload path, exit status, and failure reason.
- Keep payload files inspectable so users can retry manually.
- Avoid claiming "works with any agent" until Codex and Claude delivery are both proven.
- Defer live stdin injection into a running terminal session until the basic capture loop works.

Adapter model:

| Adapter | Timing | Purpose | Risk |
| --- | --- | --- | --- |
| `claude -p` one-off | V1 candidate | Fastest proof of browser evidence delivery | May not preserve active session continuity |
| File-drop payload | V1 fallback | Lets the user manually paste or attach evidence | More manual than the wedge promises |
| Live terminal injection | Fast follow | Sends evidence into the active paired session | Higher risk around focus, control, and shell state |
| MCP exposure | Later | Exposes browser state through ecosystem-standard tools | Adds protocol complexity before the loop is proven |

### 6. Storage, Privacy, And Local Data

Chromux's local-first trust story depends on documenting exactly what is captured, where it lives, and how it is deleted. The tool may handle local URLs, file paths, screenshots, selected DOM, console logs, auth-adjacent browser state, and project names.

Required storage decisions:

- Capture payload directory.
- Screenshot directory.
- Console-tail retention.
- Browser profile isolation or sharing model.
- Local history retention and deletion behavior.
- Whether captures are per-project, per-session, or global.

V1 should not upload captures by default. "Private by default" should not be claimed until local storage, screenshot retention, profile state, and command invocation behavior are documented.

### 7. Future Ecosystem Surfaces

MCP is the natural later compatibility layer if Chromux needs to expose browser state to multiple agents or external clients. It should not be required for the first local loop.

GBlockParty managed infrastructure is a deferred monetization and productization surface. It becomes relevant only after Chromux is part of the builder's daily workflow and there is a credible managed-browser or managed-agent backend to connect.

Future surfaces to keep compatible:

- MCP server/client exposure for browser state and captures.
- Hosted capture history or managed sessions.
- Team policy, audit, and retention controls.
- Signed releases and auto-update.
- Cross-platform support after macOS proof.

## Ecosystem Assumptions

| Assumption | Current status | Confidence | What would change it |
| --- | --- | --- | --- |
| Developers can keep using existing Codex and Claude Code CLIs inside Chromux | Evidence-backed locally | High | CLI launch/auth behavior fails inside the host app |
| `cmux` is the right fork base | Unproven | Medium | Stack spike shows browser embedding is awkward or impossible |
| `claude -p` is enough for v1 delivery | Provisional | Medium | End-to-end test shows unacceptable context fragmentation |
| Browser evidence routing is more valuable than generic browser automation | Evidence-backed by positioning | High | Daily use shows manual Chrome or MCP tools are still faster |
| Local-only capture storage is acceptable for v1 | Likely, not verified | Medium | Daily workflow needs sync or shared capture review |
| Future OSS users will tolerate setup | Unvalidated | Low | External installs, issues, or interviews confirm demand |

## Setup Path And First-Success Chain

The intended first-success path is:

1. Install or run Chromux on macOS.
2. Configure launch commands for Codex and Claude Code while preserving existing CLI auth.
3. Start one or more terminal-native agent sessions in Chromux.
4. Let a session emit a `localhost` URL or local HTML path.
5. Detect the preview and route it to the paired browser pane or queue.
6. Inspect the preview without leaving the cockpit.
7. Select an element or page state and trigger capture.
8. Review the generated YAML payload and screenshot path.
9. Deliver the payload through the selected v1 adapter.
10. Verify that the paired agent receives actionable evidence.

This path should become the README quickstart once runnable commands exist. Until then, it is an implementation acceptance path rather than user-facing install documentation.

## Compatibility Constraints

- **macOS-first:** The app, permissions, shell environment, and desktop UI should target macOS before cross-platform claims.
- **CLI auth state:** Chromux should reuse existing CLI auth state and fail clearly when unavailable.
- **No custom agent runtime:** The tool should orchestrate terminal agents rather than replace them.
- **Browser profile scope:** Cookies, local storage, and dev-server sessions need deliberate shared-vs-isolated profile decisions.
- **Sensitive local data:** Screenshots, DOM snippets, console logs, URLs, and paths may contain private project data.
- **Screen real estate:** Split panes must remain usable on a laptop. Review queues should avoid distracting hot-swaps.
- **Fork-base uncertainty:** Claims about `cmux` extensibility remain provisional until source inspection and a stack spike.
- **Payload size:** Console and DOM snippets must be bounded for prompt usability and privacy.
- **Delivery semantics:** One-off delivery is not equivalent to live-session continuity.

## Migration Risks

| Baseline | Migration risk | Mitigation |
| --- | --- | --- |
| Manual terminal plus Chrome | Zero setup may remain faster if Chromux launch, detection, or capture is clumsy | Make first loop faster than copy/paste and keep manual override paths |
| `cmux` without browser pane | Fork may add complexity or break expected terminal ergonomics | Keep the fork small and validate browser embedding first |
| Cursor or IDE preview panes | Users expect console, network, screenshot, visual editing, and dev-server awareness | Position around terminal-native paired review, not IDE replacement |
| Playwright MCP / Chrome DevTools MCP | They already expose strong browser/debug primitives | Avoid claiming unique primitives; emphasize human review queue and routing |
| Claude Code CLI/Desktop/Web | Claude already spans several surfaces and supports composition | Integrate by preserving CLI habits and using transparent payloads |
| Future OSS adoption | Install and troubleshooting burden may outweigh value | Delay public claims until quickstart, payload schema, and troubleshooting docs exist |

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| Chromux should wrap terminal-native CLIs, not replace them | `research/idea-brief.md` says Codex and Claude Code CLIs must stay unchanged and Chromux wraps rather than modifies them | CLI process launch, auth preservation, shell environment, and session identity are required surfaces | High | Evidence-backed locally | Do not design a custom agent runtime for v1 |
| The product wedge is session-paired browser review plus capture | `research/idea-brief.md` and `research/devtool-positioning.md` both emphasize 1:1 session-preview pairing, preview detection, review queue, and one-click capture | Browser co-location alone is table-stakes; routing evidence to the right session is the differentiator | High | Evidence-backed locally | Prioritize preview routing and payload delivery over broad browser features |
| `cmux` fork-base feasibility is the largest architecture unknown | `research/idea-brief.md` labels `cmux` extensibility as the riskiest unknown; no `cmux` source exists in this checkout | Browser embedding and capture hooks cannot be assumed | Medium | Unproven | Run stack spike before hardening implementation docs |
| Capture payload docs are a blocker | `research/devtool-docs-audit.md` names missing payload schema and sample YAML as a major docs/API gap | Implementation and trust claims need a stable payload contract | High | Evidence-backed locally | Create `docs/capture-payload.md` after stack/payload proof |
| MCP is future-proofing, not a v1 dependency | `research/devtool-positioning.md` says MCP compatibility is a future-proofing path, not a v1 prerequisite | V1 can use simpler local payload delivery before adding protocol surface | High | Evidence-backed locally | Defer MCP until the capture loop is proven |
| Monetization and GBlockParty should stay deferred | `research/devtool-monetization.md` recommends free personal tooling and defers managed infra until daily-driver proof | Managed infrastructure should not complicate the first local loop | High | Evidence-backed locally | Keep v1 local-first and avoid accounts/billing |
| Trust claims require storage and retention documentation | `research/devtool-positioning.md`, `research/devtool-monetization.md`, and `research/devtool-docs-audit.md` warn against privacy claims without retention and payload docs | Local-first still handles sensitive evidence | High | Evidence-backed locally | Document local data before public "private" claims |

## Alternatives Considered

| Alternative | Why it was not selected for v1 |
| --- | --- |
| Build a general-purpose browser inside the terminal multiplexer | The wedge is not generic browsing; it is session-paired review and evidence routing |
| Build a new agent runtime | Existing Codex and Claude Code CLI habits are a constraint and an adoption advantage |
| Lead with MCP | MCP is valuable later, but adds protocol complexity before the local capture loop is proven |
| Lead with hosted/GBlockParty infrastructure | Monetization research defers managed infra until Chromux is a daily-driver |
| Depend on live-session stdin injection immediately | It may be the best final UX, but it is riskier than proving payload generation and transparent delivery first |
| Treat current research as enough documentation | The docs audit shows quickstart, payload contract, privacy, troubleshooting, and migration docs are still missing |

## Rejected Or Lower-Confidence Findings

- **Rejected:** "Browser automation primitives are unique to Chromux." Cursor Browser, Playwright MCP, and Chrome DevTools MCP already expose strong browser/debug capabilities.
- **Rejected:** "MCP is required for v1." Current positioning treats MCP as future-proofing, and the first loop can be simpler.
- **Rejected:** "Chromux should own agent credentials." It should reuse CLI auth state and fail clearly.
- **Lower confidence:** "`cmux` can host the intended browser pane cleanly." This remains the top stack-spike question.
- **Lower confidence:** "`claude -p` will feel good enough." It is plausible, but may fragment active-session context.
- **Lower confidence:** "Future OSS users will accept the setup burden." There is no external validation yet.

## Source Coverage Gaps

- No implementation source, package manifest, runnable app, or screenshot proof exists in this checkout.
- No `cmux` repository source was inspected here.
- No end-to-end capture-to-agent demo has been run.
- No external user interviews or OSS install feedback exists beyond the builder's idea brief.
- No hands-on comparison run against Cursor Browser, Playwright MCP, or Chrome DevTools MCP was performed in this pass.
- No `tasks/todo.md` queue exists in this checkout, so no priority documentation todo could be routed from it.

## Downstream Implications

Implementation should start with two proof artifacts:

1. A `cmux` stack spike proving whether the intended host can embed the browser pane and expose the needed capture hooks.
2. A capture-to-agent spike proving payload generation, screenshot storage, and `claude -p` or file-drop delivery.

Documentation should follow the docs-audit backlog once runnable commands or proof fixtures exist:

1. README first local loop.
2. Versioned capture payload schema and sample YAML.
3. Troubleshooting for preview detection, local files, screenshots, console logs, `claude -p`, and storage cleanup.
4. Privacy/local-data documentation.
5. Migration guide from manual terminal plus Chrome.

The product should avoid public claims about broad agent compatibility, privacy/security, cross-platform support, or `cmux` feasibility until the relevant proof artifacts exist.
