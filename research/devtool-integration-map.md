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

## GIGACHADD Process Integration Decision — Confirmed 2026-07-18

_Producing skill: `$devtool-integration-map gigachadd-process` · Status: confirmed · Approval source: final compiled YAML with all seven required gates approved and no section feedback · Archived working packet: `docs/history/archive/2026-07-18/125928/research/_working/preliminary-devtool-integration-map-research.md`_

### Artifact Approval Record

- Integration verdict: approved — use a Chromux-native Debate / Challenge workflow; direct GIGACHADD binary integration and code porting remain rejected pending a separately authorized mechanics and license review.
- Research completeness: approved — no decision-critical coverage is missing; private-source gaps remain explicit constraints.
- Assumptions and confidence: approved with documented uncertainty preserved.
- Canonical destination: approved at `research/devtool-integration-map.md`.
- File changes: approved for canonical amendment, working-packet archive/removal, and alignment confirmation only.
- Review format: approved.
- Final artifact: approved for canonicalization.

### Research Scope Approved

The approved scope asks whether Chromux should directly integrate GIGACHADD, selectively port its mechanics, or recreate the workflow natively. It covers public GIGACHADD mechanics evidence, Chromux fit, provider CLI adapters, a local structured debate record, setup, compatibility, privacy, failure recovery, migration risk, and a bounded beta recommendation.

The approved non-goals remain in force: no implementation, no product-code or task-file changes, no private GIGACHADD source or demos, no broad market ranking, no automatic debate on every prompt, no silent execution of a verdict, and no claim of compatibility beyond observed versions and official provider contracts.

### Executive Findings

#### Finding 1 — Choose a Chromux-native Debate / Challenge workflow, not a direct GIGACHADD dependency

**Claim.** Chromux should implement the approved workflow as a native, opt-in orchestration feature behind provider-specific CLI adapters. It should not require the GIGACHADD binary and should not port GIGACHADD code unless a later, explicitly authorized source-and-license review proves there is unique reusable machinery worth preserving.

**Evidence.** GitHub repository search resolves `GeorgeQLe/gigachadd-v0` as private. The approved source boundary excludes private source. Public portfolio evidence describes GIGACHADD as a Rust CLI with `debate`, `duel`, `roast`, `review`, `compare`, `history`, and `export` commands, but exposes no state schema, process protocol, tests, release artifacts, or license. One public page labels it a CLI MVP; a newer personal scoreboard labels it dormant. Chromux already owns PTY/session orchestration, browser evidence, local capture persistence, review surfaces, and explicit user intervention.

**Inference.** A direct binary dependency would add an uninspectable process and packaging boundary without evidence that it preserves unique value. A code port is legally and technically blocked while the license and implementation remain unavailable. Recreating the user-approved process contract in Chromux preserves the desired outcome without inventing facts about GIGACHADD internals.

**Confidence.** High for the present integration decision; low for claims about GIGACHADD's internal mechanics.

**Decision impact.** Approve native recreation now; keep a later mechanics-verification spike as a reversible option, not a beta prerequisite.

#### Finding 2 — The durable integration surface is a provider-neutral debate state record plus explicit CLI adapters

**Claim.** Chromux should own the debate state machine, evidence manifest, review UI, persistence, cancellation, and Markdown export. Each provider adapter should only translate a bounded, read-only turn request into the provider's supported non-interactive CLI contract and normalize its result.

**Evidence.** Current Chromux launches unchanged CLI processes through a login-shell PTY, keeps captures as inspectable local files before delivery, and already invokes `claude -p` as a one-off delivery adapter. Official provider documentation exposes machine-oriented surfaces: `codex exec --json` emits JSONL and supports JSON Schema-constrained final output; Claude Code print mode supports JSON or streaming JSON, session IDs, turn bounds, and permission controls; Grok supports headless JSON output and, separately, ACP over stdio. The locally observed environment contains Codex CLI 0.144.5 and Claude Code 2.1.214; Grok is absent.

**Inference.** Provider differences are real, but they can be isolated at the process boundary. Chromux does not need a shared model API, provider keys, or a new agent runtime to coordinate a debate.

**Confidence.** High for Codex/Claude feasibility; medium for the exact normalized contract until a read-only adapter spike proves exit, timeout, cancellation, and malformed-output behavior.

**Decision impact.** Specify one internal turn/result schema and capability-detect each adapter; do not pass provider-native event streams directly into durable debate state.

#### Finding 3 — Preserve independent first positions before cross-examination

**Claim.** The smallest useful process should collect independent Codex and Claude positions from the same immutable evidence manifest, then reveal the opposing position for challenge, revision, synthesis, and ratification/dissent.

**Evidence.** The approved outcome is improved pre-implementation decision quality through multiple perspectives arguing from shared repository and browser evidence. The approved trigger is explicit rather than automatic. Public GIGACHADD descriptions prove only that the product was adversarial and debate-oriented; they do not establish a reusable round algorithm.

**Inference.** Independent first positions reduce avoidable anchoring, while a later challenge step makes disagreements inspectable. Ratification/dissent prevents a synthesizer from erasing a minority view. This process is a Chromux design recommendation, not a recovered GIGACHADD algorithm.

**Confidence.** Medium. The structure is evidence-aligned but has not been user-tested.

**Decision impact.** Use a bounded five-phase beta and measure whether the extra rounds change decisions enough to justify their latency and provider usage.

#### Finding 4 — Separate debate approval from execution approval

**Claim.** Starting a debate, accepting a verdict, and executing its proposed next action must be three distinct user decisions.

**Evidence.** The approved constraints require explicit approval before execution. Chromux already distinguishes explicit interventions and documents that approval, agent reply, and raw terminal input have different safety consequences. Codex and Claude non-interactive modes can run tools unless bounded by sandbox and permission settings.

**Inference.** Treating a synthesized verdict as executable authority would collapse review into automation and create avoidable repository and shell risk.

**Confidence.** High.

**Decision impact.** Beta turns should be read-only by default; the verdict exports a proposed action but never runs it automatically.

#### Finding 5 — The beta should be additive, local-only, capability-detected, and resumable

**Claim.** Ship Debate / Challenge as an opt-in local beta with no workspace migration and no separate GIGACHADD install. Persist debate metadata and bounded evidence references under Chromux local state, allow retrying one failed participant, and continue with explicit degraded-state labeling only when a required minimum remains.

**Evidence.** This matches the approved setup boundary. Chromux already stores local captures, delivery logs, and session restore records; it has no required cloud account. Codex and Claude are required participants; Grok is optional. GBlockParty is an optional future execution/continuity layer, not a local prerequisite.

**Inference.** An additive local record minimizes migration and rollback risk. Provider capability detection is safer than assuming equivalent flags, event shapes, permissions, or session semantics.

**Confidence.** High for setup shape; medium for exact persistence and recovery rules until implemented and tested.

**Decision impact.** A feature flag plus a versioned record schema is sufficient for beta rollback; removing or disabling the feature must leave existing workspaces untouched.

### Recommended Mechanics Map

The following is the recommended Chromux process. It is not asserted to reproduce GIGACHADD internals.

| Phase | State transition | Inputs | Outputs | Human gate | Failure behavior |
| --- | --- | --- | --- | --- | --- |
| 0. Compose | `draft -> awaiting_start_approval` | Task/plan text, repo-relative file references, proposed diff reference, bounded capture references, participant policy | Immutable evidence manifest and estimated participant set | User reviews scope and starts | Remain draft; no provider invoked |
| 1. Independent positions | `running_positions -> positions_collected` | Identical manifest and role-neutral response schema | One structured position per required participant | None during collection | Retry one adapter; abort or explicitly degrade if a required participant fails |
| 2. Challenge | `running_challenge -> challenges_collected` | Manifest, opponent position, evidence-critique rubric | Claims challenged, missing evidence, counterarguments, concessions | None during collection | Preserve completed work; retry failed turn without replaying successful turns |
| 3. Revision | `running_revision -> revisions_collected` | Original position plus received challenge | Revised position and unresolved disagreement list | None during collection | Same bounded retry policy |
| 4. Synthesis + ratification | `running_synthesis -> verdict_ready` | All positions, challenges, revisions, source manifest | Verdict, rationale, dissent, confidence, proposed next action | User reviews verdict | If synthesis fails, export the debate bundle without a verdict; never discard prior rounds |
| 5. Accept/export | `verdict_ready -> accepted / rejected / archived` | Review UI decision | Markdown export and optional task/action draft | Explicit accept/reject | No execution side effect |
| 6. Execute separately | outside debate state | Accepted proposed action | A separately authorized workflow | New explicit execution approval | Governed by the selected workflow, not the debate |

Recommended hard bounds for the beta:

- Two required participants: Codex and Claude Code.
- Grok only when installed and capability checks pass; its absence is non-blocking.
- One independent position, one challenge, one revision, and one synthesis/ratification cycle.
- Read-only provider permissions; no edit or shell-write authority during debate turns.
- Evidence copied by reference when possible; text excerpts and browser material remain size-bounded.
- Per-turn timeout, cancel, exit-code capture, stderr tail, provider version, and exact adapter configuration recorded.
- No automatic recursion, sub-debates, or verdict execution.

### Proposed Local Data Contract

```yaml
schema_version: 1
debate_id: local-uuid
status: draft | awaiting_start_approval | running | verdict_ready | accepted | rejected | archived | failed
created_at: iso-8601
workspace:
  repository_identity: remote-or-local-stable-id
  revision: git-sha-or-null
  root: repo-relative-root
prompt:
  title: string
  question: string
  proposed_change_ref: repo-relative-path-or-null
evidence:
  - evidence_id: stable-id
    kind: file | diff | browser_capture | text
    ref: repo-relative-or-local-capture-reference
    digest: sha256-or-null
    excerpt: bounded-text-or-null
participants:
  - participant_id: codex | claude | grok
    required: true | false
    adapter_version: string
    cli_version: string
    capability_snapshot: {}
rounds:
  - phase: position | challenge | revision | synthesis | ratification
    participant_id: string
    started_at: iso-8601
    completed_at: iso-8601-or-null
    status: pending | running | complete | failed | cancelled
    input_digest: sha256
    result:
      claims: []
      evidence_refs: []
      counterarguments: []
      concessions: []
      unresolved: []
      recommendation: string-or-null
      confidence: low | medium | high
    diagnostics:
      exit_code: integer-or-null
      stderr_tail: bounded-text
      usage: provider-normalized-or-null
verdict:
  recommendation: string
  rationale: []
  dissent: []
  confidence: low | medium | high
  next_action: string
approval:
  started_by_user_at: iso-8601
  verdict_decision: pending | accepted | rejected
  decided_at: iso-8601-or-null
```

The schema should store digests and references to large repository and capture artifacts instead of repository copies. Any excerpt copied into the record must be bounded and inspectable. Provider-native raw events may be retained temporarily for diagnostics, but durable product state should use the normalized schema.

### Provider Adapter And Compatibility Map

| Capability | Codex adapter | Claude Code adapter | Grok adapter | Normalization decision |
| --- | --- | --- | --- | --- |
| Headless entrypoint | `codex exec` | `claude -p` | `grok -p` | Required |
| Machine output | `--json` JSONL; final schema via `--output-schema` | `--output-format json` or `stream-json` | `--output-format json` or `streaming-json` | Parse provider events, persist normalized result |
| Working directory | `--cd` / process cwd | process cwd | `--cwd` / process cwd | Chromux passes validated workspace root |
| Existing auth | Reuses saved CLI authentication by default | Uses installed CLI/account configuration | Uses installed CLI login or configured API key | Never copy credential stores into debate state |
| Read-only boundary | Default `codex exec` sandbox is read-only; set explicit policy | Use permission mode/tool restrictions and a non-editing prompt | Avoid `--always-approve`; capability-test read-only behavior | Beta refuses adapters that cannot prove safe read-only mode |
| Structured final response | JSON Schema-supported | JSON result envelope; enforce response schema in prompt/parser | JSON output; schema enforcement unproven | Strict validation; malformed results fail the turn |
| Session continuation | `codex exec resume` | `--resume` / `--continue` | `--session-id` / `--resume` / `--continue` | Prefer isolated phase calls in beta; record IDs only if used |
| Cancellation | Child-process signal; exact semantics need spike | Child-process signal; exact semantics need spike | Child-process signal; exact semantics need spike | Graceful signal, deadline, then explicit failed/cancelled state |
| Optional advanced protocol | App server exists but is unnecessary for beta | Agent SDK exists but is unnecessary for beta | ACP stdio exists | Do not adopt a long-lived protocol until process adapters fail a proven need |

#### Observed local compatibility snapshot

| Surface | Observed value on 2026-07-18 | Interpretation |
| --- | --- | --- |
| Chromux prototype | 0.30.2 | Research baseline only; no product change in this run |
| Electron | `^43.0.0` | Child-process and local UI integration environment |
| Node | 25.2.1 in shell | Development-shell observation, not packaged-runtime promise |
| macOS / architecture | 26.5.2 / arm64 | Exact research host; not a broad support claim |
| Codex CLI | 0.144.5 | Required beta adapter can be spiked locally |
| Claude Code | 2.1.214 | Required beta adapter can be spiked locally |
| Grok Build | Not installed | Optional adapter must degrade cleanly |

Compatibility policy:

1. Detect the binary, version, headless command, JSON-output support, and safe read-only policy before enabling a participant.
2. Record the exact successful version tuple in each debate.
3. Require both Codex and Claude for the first beta unless the user explicitly approves a degraded single-provider diagnostic run; never present that as a debate-equivalent verdict.
4. Treat Grok as optional and label its absence in the participant record.
5. Fail closed on unknown flags, malformed structured output, missing auth, write-capable configuration, or license/protocol ambiguity.
6. Maintain adapter contract tests against fixtures plus opt-in local smoke tests; do not promise semver-wide provider compatibility.

### Setup And First-Success Path

1. User enables the local Debate / Challenge beta in Chromux.
2. Chromux discovers `codex` and `claude` through the user's login-shell environment and reads only version/help capability output.
3. The capability check verifies saved authentication indirectly by a provider-supported status or a user-initiated smoke test; Chromux never reads or copies token files.
4. User opens a task, plan, diff, or bounded browser capture and selects **Debate / Challenge**.
5. Chromux renders the evidence manifest, participants, read-only boundary, round count, and expected provider usage for start approval.
6. On approval, Chromux runs the bounded phases and streams progress into a local review surface without allowing provider output to mutate the repository.
7. Chromux validates each structured result, preserves failures and dissent, and renders the final verdict.
8. User accepts, rejects, or archives the verdict and may export Markdown.
9. Any implementation action starts separately under its own approval and workflow.

No current workspace migration is required. Rollback disables the feature and leaves versioned debate records exportable or removable. A future GBlockParty host may execute the same provider-neutral contract remotely, but local Chromux remains authoritative for the beta UI and no cloud account is required.

### Candidate Comparison

Scoring uses 1 (poor) to 5 (strong) against the approved constraints. Scores are decision aids, not empirical benchmarks.

| Criterion | Direct GIGACHADD binary | Selective code/mechanics port | Chromux-native workflow |
| --- | ---: | ---: | ---: |
| Preserves known unique mechanics | 2 — mechanics unverified | 2 — source unavailable | 3 — preserves approved product contract, not unknown internals |
| Public inspectability | 1 | 1 | 5 |
| License confidence | 1 | 1 | 5 for new Chromux code |
| No extra install | 1 | 5 | 5 |
| Reuses current CLI auth | 2 — unknown | 3 — unknown adapter work | 5 |
| Fits Electron/local review UI | 2 — process boundary unknown | 3 | 5 |
| Maintenance independence | 1 | 2 | 4 |
| Rollback simplicity | 3 | 3 | 5 |
| Evidence-backed feasibility now | 1 | 1 | 4 |
| **Total / 45** | **14** | **21** | **41** |

#### Verdict

Choose **Chromux-native workflow**. Keep direct integration and selective port rejected for the beta because the approved public evidence set cannot verify GIGACHADD's implementation, protocol, tests, releases, or license. Reconsider only after a separately authorized review answers all five questions:

1. What exact state transitions and invariants are enforced in code rather than prompts?
2. Is there a stable non-interactive process or file protocol?
3. What license permits binary redistribution, linking, or code reuse?
4. Do tests demonstrate failure recovery or reproducibility that Chromux would otherwise need to rebuild?
5. Does a side-by-side spike show a material quality or maintenance advantage over the native contract?

### Migration, Security, And Operational Risks

| Risk | Likelihood | Impact | Mitigation | Residual uncertainty |
| --- | --- | --- | --- | --- |
| Provider output mutates repository during a debate | Medium without controls | High | Explicit read-only adapter policy, validated cwd, no auto-approval, separate execution gate | Provider permission semantics can change |
| Shared evidence contains secrets or excessive source | Medium | High | Manifest preview, bounded excerpts, repo-relative references, capture warnings, no generic credential sync | Provider CLIs may read broader workspace context |
| One provider anchors or dominates synthesis | Medium | Medium | Independent positions, challenge/revision, ratification, preserved dissent | Needs usability and outcome testing |
| Latency and usage make debates annoying | High | Medium | Explicit trigger, bounded rounds, cancel, progress, record provider usage | Actual usage/cost not measured |
| Structured output drifts across CLI versions | Medium | High | Capability checks, strict schema validation, exact version record, fixture tests | Official contracts evolve |
| Partial process failure loses useful work | Medium | Medium | Persist each completed phase atomically; retry only failed participant; export incomplete bundle | Exact crash recovery untested |
| Private GIGACHADD source is accidentally treated as approved evidence | Low with current boundary | High | Record source exclusion and avoid private repo reads | User may later authorize a separate review |
| Unknown GIGACHADD license contaminates a port | High if port attempted | High | No code port or binary bundling without license proof | License unavailable publicly |
| Grok absent or behavior differs | High on current host | Low | Optional adapter, explicit omission label | No local compatibility evidence |
| Future GBlockParty execution changes trust boundary | Medium later | High | Versioned provider-neutral contract, host-side credentials, bounded artifacts, input leases | Remote protocol not implemented |

### Evidence Matrix

| Major claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| Direct GIGACHADD integration is not justified | GitHub search identifies only matching product repo as private; public pages expose descriptions but not mechanics/license; approved sources exclude private material | Stable integration value and legal reuse cannot be verified | High | Evidence-backed boundary; internal mechanics unknown | Reject binary dependency for beta |
| GIGACHADD status is not reliable enough to depend on | LeXCorp pages call it CLI MVP; newer 6eorge scoreboard calls it dormant; readiness page calls repo stale/blocked with failing or absent CI evidence | Dependency health and release support are uncertain | Medium | Public status evidence conflicts | Avoid runtime dependency |
| Chromux can own process/UI/state | `prototype/main.js` owns PTYs, captures, local persistence, delivery and restore; renderer owns session/browser/review UI; privacy docs define local boundaries | Debate orchestration extends an existing ownership model | High | Observed code fact plus product inference | Native workflow fits architecture |
| Codex supports a structured read-only process adapter | Official Codex docs: `codex exec`, default read-only sandbox, JSONL events, output schema, saved auth reuse; local CLI 0.144.5 | Adapter can yield validated structured turns without a new model API | High | Exact cancellation/error behavior untested | Required beta participant |
| Claude supports a structured process adapter | Official Claude CLI docs: `-p`, JSON/stream JSON, max turns, resume, permission flags; current code already invokes `claude -p`; local CLI 2.1.214 | Existing adapter can be hardened into a normalized debate participant | High | Strict schema and cancellation need spike | Required beta participant |
| Grok should remain optional | Official xAI docs expose headless JSON and ACP; no local `grok` binary is installed; current Chromux supports Grok sessions but warns about data behavior | Protocol potential exists without local compatibility proof | High | Local runtime unverified | Optional/degraded adapter only |
| Start and execution approvals must be separate | Approved constraints; Chromux architecture distinguishes explicit interventions; provider CLIs can invoke tools | Verdict text must not become ambient execution authority | High | Evidence-backed | Required safety invariant |
| Native five-phase debate may improve decision quality | Approved desired outcome and trigger; process structure preserves independence, challenge, revision, synthesis and dissent | Likely better than a single unchallenged response, but unmeasured | Medium | Provisional product hypothesis | Beta should measure decision change and usefulness |

### Alternatives Considered

#### Direct GIGACHADD binary — rejected for beta

This would best preserve unknown internals if a stable binary protocol existed, but no approved evidence establishes distribution, install path, protocol, versioning, license, auth model, or failure behavior. It also conflicts with the approved preference to avoid a separate binary unless unique mechanics are proven.

#### Selective GIGACHADD port — rejected pending authorization and license review

This could preserve a useful Rust engine while avoiding a runtime dependency, but source inspection is outside the approved boundary and the license is unknown. Porting from descriptions would be a clean-room recreation, not a port, and should be named accordingly.

#### Prompt-only wrapper — lower-confidence and rejected as the durable design

A single long prompt could imitate advocate/critic/judge roles quickly, but it would not provide durable phase state, independent first positions, per-participant retries, evidence provenance, cancellation, or inspectable dissent. Prompts remain part of adapter policy, not the product architecture.

#### Long-lived SDK/app-server/ACP integration — deferred

Codex app server, Claude's SDK, and Grok ACP may eventually improve streaming and session control. They add protocol and lifecycle complexity before the simple child-process adapters have failed a demonstrated need. Preserve adapter boundaries so one provider can later upgrade independently.

### Rejected Or Lower-Confidence Findings

- **Rejected:** “GIGACHADD has a publicly reusable stable engine.” Public portfolio wording says “stable Rust debate engine,” but no approved implementation, tests, releases, or license support that as an integration claim.
- **Rejected:** “CLI MVP means active maintained dependency.” A newer public scoreboard labels the project dormant, and readiness evidence labels it stale/blocked. Status is conflicting.
- **Rejected:** “All providers can share identical flags and result envelopes.” Official docs show materially different commands, JSON formats, permission models, and optional protocols.
- **Lower confidence:** The proposed five-phase loop materially improves decisions enough to justify latency. This needs beta measurement.
- **Lower confidence:** Isolated stateless calls are better than provider session continuation for every phase. A spike should compare reproducibility, context size, and failure recovery.
- **Lower confidence:** Provider usage/cost can be normalized reliably from every CLI's result events. Preserve nullable usage fields until proven.

### Assumptions And Confidence Register

| Statement | Status | Confidence | What would change it |
| --- | --- | --- | --- |
| Chromux should own local debate state and UI | User-approved preference, reinforced by code | High | A verified external engine demonstrates materially stronger invariants with lower maintenance cost |
| Codex and Claude are required participants | User-approved preference | High | Beta evidence shows one cannot operate safely/read-only or users prefer another minimum |
| Grok is optional | User-approved preference and local absence | High | Grok becomes installed, tested, and strategically required |
| A separate GIGACHADD binary should not be required | User-approved preference plus evidence gap | High | Public/authorized review proves unique mechanics and a stable licensed protocol |
| Public GIGACHADD source exists | Contradicted by repository discovery | High | The repository becomes public or the user authorizes a separate private-source review |
| Public portfolio descriptions accurately reflect implementation | Unverified marketing/ops claim | Low | Source, tests, release artifacts, or a reproducible public demo corroborate it |
| Five bounded phases are the right beta depth | Product inference | Medium | Usability and decision-change measurement favors fewer or more phases |
| Read-only child-process adapters are sufficient | Architecture inference backed by official CLI surfaces | Medium | Spike exposes cancellation, streaming, permissions, or schema limitations requiring SDK/app-server/ACP |
| Local record storage is acceptable for beta | User-approved and consistent with current product | High | User testing requires team access or remote continuity immediately |

### Source Coverage And Gaps

| Category | Coverage | Sources used | Gap and consequence |
| --- | --- | --- | --- |
| GIGACHADD identity/status | Partial | Public LeXCorp pages, 6eorge scoreboard, public readiness page, GitHub repository metadata search | Status conflicts; enough to reject dependency confidence, not enough to describe internals |
| GIGACHADD architecture/state machine | Missing | No approved public source found | Cannot claim preserved mechanics, direct protocol fit, or engine value |
| GIGACHADD CLI/help/tests/issues/releases/history | Missing | Matching repo is private and excluded | Direct integration and port remain unapproved |
| GIGACHADD license | Missing | No public license evidence | Binary bundling and code port are blocked |
| Chromux current architecture | Strong | `prototype/main.js`, renderer, package metadata, privacy docs, canonical integration map, git history | Product-code behavior is observed; beta design remains proposed |
| Codex compatibility | Strong at official-contract level | Official Codex non-interactive and CLI reference; local version output | No real debate adapter smoke test or cancellation fixture yet |
| Claude compatibility | Strong at official-contract level | Official Claude CLI reference; current `claude -p` adapter; local version output | No schema-hardened debate adapter spike yet |
| Grok compatibility | Partial | Official xAI CLI/headless docs; Chromux Grok session code | Binary absent locally; no safe read-only smoke test |
| User outcome and constraints | Strong | Two completed interrogation sidecars and approved Stage 1 YAML | Outcome quality remains unmeasured |
| GBlockParty future fit | Directional | Proposed `docs/gblockparty-iaas-integration.md` | Architecture is proposed, not an implemented remote contract |

#### Source list

- [LeXCorp public operating ledger](https://www.thelexcorp.com/) — GIGACHADD public description and CLI command surface; accessed 2026-07-18.
- [George Le public project scoreboard](https://www.6eorge.com/) — GIGACHADD listed as a dormant Rust CLI AI debate tool; accessed 2026-07-18.
- [LeXCorp launch readiness](https://www.thelexcorp.com/ops/readiness) — public repository identity and stale/blocked readiness signals; accessed 2026-07-18.
- [OpenAI Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) — `codex exec`, JSONL, output schema, sandbox, auth, resume; accessed 2026-07-18.
- [OpenAI Codex developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli) — CLI maturity and flag reference; accessed 2026-07-18.
- [Anthropic Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage) — print mode, JSON formats, permissions, turns, sessions; accessed 2026-07-18.
- [xAI Grok headless and scripting](https://docs.x.ai/build/cli/headless-scripting) — headless commands, JSON output, sessions, update control; accessed 2026-07-18.
- [xAI Grok CLI reference](https://docs.x.ai/build/cli/reference) — CLI/ACP surface; accessed 2026-07-18.
- Repository evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, `prototype/package.json`, `prototype/docs/privacy-and-local-data.md`, `research/devtool-integration-map.md`, `research/_working/interrogation-devtool-integration-map-r1.yaml`, and `research/_working/interrogation-devtool-integration-map-r2.yaml`; inspected 2026-07-18.

### Downstream Implications

If approved, the canonical integration map should receive a focused GIGACHADD Process section that:

1. Records native recreation as the integration stance.
2. Adds the provider-neutral debate state and evidence boundary.
3. Adds Codex/Claude required adapters and optional Grok degradation.
4. Adds separate start, verdict, and execution approvals.
5. Adds compatibility, migration, privacy, and failure constraints.
6. Preserves the GIGACHADD public-source and license gaps rather than implying recovered internals.

No task should be filed in Stage 2. After artifact approval, any implementation work should be classified separately and should begin with a read-only adapter/protocol spike before UI or full workflow construction.
