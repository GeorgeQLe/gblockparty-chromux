# Chromux - Devtool Positioning Research

_Producing skill: `$devtool-positioning` · Status: canonical · Date: 2026-07-06 · Concept slug: `chromux`_

## Executive Positioning

Chromux should be positioned as a personal-first macOS cockpit for developers supervising multiple terminal-native Codex and Claude Code sessions while reviewing generated localhost and local HTML output. The refreshed evidence makes the wedge narrower than "browser in the devtool" or even "agent can inspect a browser." Cursor, Codex, Claude Code, Playwright MCP, and Chrome DevTools MCP now cover substantial browser, agent, parallel-work, and debugging surfaces.

The durable positioning wedge is session-paired human review and evidence routing: each terminal agent session keeps its own paired preview context, new previews are queued without stealing attention, and the developer can capture the current browser state into an inspectable payload that is routed back to the correct session or delivery adapter.

Concise positioning statement:

> Chromux is a local macOS cockpit for developers running parallel terminal coding agents: it keeps each session tied to its live preview and turns browser evidence into an explicit payload for the right agent.

Short variant:

> A local cockpit for parallel coding agents that keeps every terminal session tied to its preview and sends browser evidence back to the right agent.

## Approved Research Scope

The approved Stage 2 scope covers alternatives, unique workflow advantage, ecosystem fit, trust claims, switching cost, and whether the 2026-07-05 canonical positioning should be preserved or amended. The lens remains layered: primary audience is the builder as an n=1 daily-driver user; secondary audience is future OSS agent-driven developers. The decision supported is v1 prioritization and positioning clarity, not monetization, implementation scheduling, or a build/skip decision.

## Findings By Research Question

### Q1 - Alternatives

The strongest alternatives are now:

- Manual terminal plus Chrome.
- Codex CLI plus Codex app/browser surfaces.
- Claude Code CLI, Desktop, Web, Chrome, and remote-control surfaces.
- Cursor Agents Window plus Cursor Browser.
- Playwright MCP and Chrome DevTools MCP.
- IDE/browser preview panes and terminal multiplexers.
- `cmux` as the intended but still unverified fork base.

The updated competitive picture is more crowded than the existing 2026-07-05 artifact implied. OpenAI's Codex docs now describe Codex CLI as a local terminal coding agent and list an in-app browser, Chrome extension, computer use, Appshots, Worktrees, subagents, MCP, and cloud tasks in the Codex product surface. Cursor's docs describe Browser Agent with console logs, network traffic, screenshots, inline/separate browser panes, development-server awareness, design editing, persisted workspace browser state, and enterprise browser controls. Claude Code docs describe terminal, IDE, desktop, browser, web, mobile, multiple sessions, background agents, Chrome debugging, MCP, hooks, and composable `claude -p` usage. Playwright MCP and Chrome DevTools MCP expose browser automation/debug primitives directly to agents.

The gap remains: these alternatives are either IDE/product surfaces, automation servers, or single-vendor agent surfaces. None of the inspected sources positioned themselves as a small local cockpit whose primary object is many unchanged terminal sessions, each with a persistent paired preview and a human-controlled evidence payload routed back to the originating session.

### Q2 - Unique Workflow Advantage

Browser control, screenshots, logs, network traffic, and browser panes are not unique. Cursor Browser explicitly covers those. Chrome DevTools MCP covers traces, network analysis, screenshots, console messages, and Chrome automation. Playwright MCP covers structured accessibility snapshots and browser automation for many MCP clients. Codex and Claude Code both have expanding app/browser surfaces.

Chromux's defensible workflow advantage is the combination of:

1. Terminal-native session preservation: Codex and Claude Code CLIs stay unchanged.
2. 1:1 session-to-preview pairing across parallel sessions.
3. Preview discovery for `localhost`, loopback URLs, and local `file://` HTML.
4. Review queue behavior that avoids hot-swapping the page currently under inspection.
5. Explicit browser-to-agent capture payloads containing URL, selected element selector/HTML, console tail, screenshot path, timestamp, and originating session ID.
6. Transparent delivery or file-drop fallback so the payload can be inspected and retried.

The phrasing should avoid "browser automation" as the lead. The better phrase is "review-to-agent evidence routing."

### Q3 - Ecosystem Fit

Chromux should sit beside the agent ecosystem rather than compete as an IDE, cloud agent, automation protocol, or new runtime.

Codex and Claude Code are appropriate first-class session types because both support terminal-native workflows. Codex CLI is documented as a local terminal coding agent that can inspect repositories, edit files, and run commands. Claude Code's docs emphasize terminal use, CLI composition through `claude -p`, multiple agents, background agents, MCP, hooks, desktop/web/browser surfaces, and handoff between surfaces.

MCP is a compatibility path, not a v1 dependency. MCP is an open-source standard for connecting AI applications to tools, data, and workflows, with broad client/server support. Playwright MCP's own README now distinguishes CLI/skills from MCP and notes that CLI-based workflows can be more token-efficient for high-throughput coding agents, while MCP remains useful for persistent state, introspection, and iterative browser reasoning. That supports Chromux starting with a simpler local payload loop before exposing browser state over MCP.

Cursor validates the market direction toward agent workspaces with parallel agents, browser tools, development-server awareness, and visual feedback. It also raises the bar: Chromux must not claim that browser panes or console/screenshot capture are novel.

### Q4 - Trust Claims

Honest v1 trust claims:

- Local-first desktop wrapper around existing terminal agents.
- Codex and Claude Code CLIs remain unchanged.
- Capture is explicit and user-triggered.
- Payload contents are inspectable and locally stored.
- Delivery attempts and failures are logged with visible paths.
- No team, cloud, sync, telemetry, or account requirement should be implied for v1 unless implemented and disclosed later.

Claims to avoid until implementation and documentation exist:

- "Private by default" without documenting screenshot retention, browser profile state, payload directories, deletion, and command invocation behavior.
- "Secure browser automation" without policy controls and threat documentation.
- "Works with any agent" before at least Codex and Claude delivery paths are proven.
- "Replaces Cursor/Claude/Codex browser tools" because the evidence supports a narrower workflow layer, not feature superiority.

Chrome DevTools MCP's disclaimer is especially relevant: browser debugging tools expose browser instance contents to MCP clients and can inspect, debug, or modify browser data. Chromux should adopt the same caution around screenshots, DOM excerpts, console logs, URLs, local file paths, cookies, storage, and browser profiles.

### Q5 - Switching Cost

For the builder, the switching cost is acceptable only if Chromux preserves existing CLI habits and beats manual terminal plus Chrome during real work. The main costs are trust, focus, screen real estate, setup, and wrong-session routing risk.

For future OSS users, switching costs are higher: macOS desktop install, Electron/Chromium footprint, CLI auth reuse, local storage trust, browser permissions, port/file preview detection, payload delivery semantics, and troubleshooting. Current local research still shows no runnable app, README, payload schema, privacy doc, troubleshooting doc, or external user evidence.

V1 priority remains:

1. Run the `cmux` stack spike.
2. Prototype preview detection.
3. Define the capture payload.
4. Prove capture-to-delivery through `claude -p` plus file-drop fallback.
5. Only then write public quickstart and trust documentation.

### Q6 - Preserve Or Amend The Existing Statement

Amend, but do not reverse, the existing positioning. The old statement is directionally correct, but it should be more explicit that Codex itself now has app/browser surfaces and that Cursor/Claude browser capabilities are stronger. The safer positioning removes "unlike AI IDEs or generic browser automation" as the main contrast and replaces it with a sharper workflow claim: paired multi-session terminal cockpit plus explicit evidence routing.

## Competitive Matrix

| Alternative | What it does well | Gap relative to Chromux | V1 implication |
| --- | --- | --- | --- |
| Manual terminal + Chrome | Zero setup, full browser power, existing habit | Manual alt-tab, evidence copy/paste, no session-paired payload routing | Baseline to beat; the first loop must be faster than manual copying |
| Codex CLI + Codex app/browser | Terminal agent plus growing app, browser, subagent, worktree, cloud, MCP, and image/Appshot surfaces | Product surface is Codex-centered, not a neutral cockpit for many unchanged terminal agents | Treat Codex as a first-class wrapped CLI session; do not claim Codex lacks browser support |
| Claude Code CLI/Desktop/Web/Chrome | Terminal-native CLI, multiple agents, desktop/web/browser surfaces, `claude -p`, MCP, hooks | Claude-centered; browser debugging and multiple sessions are capabilities, not a paired local multi-agent preview queue | Use `claude -p` as plausible v1 delivery, but keep session continuity caveated |
| Cursor Agents Window + Browser | Parallel agents, multi-workspace management, browser pane/window, logs, network, screenshots, design editing, dev-server awareness | IDE-centered and increasingly cloud/workspace oriented; not focused on local terminal-agent cockpit | Do not compete as an IDE; compete as CLI-preserving review cockpit |
| Playwright MCP | Structured browser automation, accessibility snapshots, broad MCP client support, persistent browser context | Automation server, not human review queue or session-paired terminal UI | Future integration/reference; not the v1 wedge |
| Chrome DevTools MCP | Deep Chrome debugging, traces, network, console, screenshots, automation | Debugging MCP server, not a cockpit or capture workflow UI | Borrow caution and concepts; avoid claiming unique browser primitives |
| IDE preview panes | Familiar co-location with code and terminal | Co-location only; evidence routing is not first-class | Co-location is table-stakes |
| `cmux` / terminal multiplexer base | Parallel terminal orchestration if stack supports it | Browser pane and capture channel remain unverified from local evidence | Stack spike before implementation claims |

## V1 Priority Guidance

### Differentiating

- 1:1 session-to-preview pairing.
- `localhost`, loopback, and local HTML preview detection per session.
- Non-attention-stealing preview queue and badges.
- Explicit capture payload: URL, selected element selector/HTML excerpt, console tail, screenshot path, timestamp, originating session ID, delivery target.
- Inspectable file-drop and transparent `claude -p` delivery attempt.
- Clear wrong-session prevention and recovery.

### Table-Stakes

- Reliable terminal panes and session lifecycle.
- Basic browser navigation, reload, back, forward.
- Screenshot capture.
- Clear logs for preview detection, capture, storage, and delivery.
- macOS-first setup.
- CLI auth/path failure diagnostics.

### Defer

- Full network HAR capture.
- Cookie/storage capture.
- Live injection into already-running terminal sessions.
- MCP server/client abstraction.
- Cursor-style visual editing.
- Cloud sessions, sync, hosted agents, team admin, SSO, audit controls.
- Monetization and GBlockParty managed infrastructure.
- Broad "any agent" compatibility claims.

## Evidence Matrix

| Claim | Evidence | Inference | Confidence | Assumption status | Decision impact |
| --- | --- | --- | --- | --- | --- |
| Browser panes and browser-state tools are table-stakes | Cursor Browser docs describe browser actions in chat, separate or inline browser window, screenshots, console output, network traffic, dev-server awareness, visual editing, session persistence, and enterprise controls. | Chromux cannot lead with "embedded browser" or "agent can inspect a browser." | High | Evidence-backed externally | Lead with paired terminal workflow and evidence routing. |
| Parallel agent management is an active competitor surface | Cursor Agents Window docs describe an agent-first interface, multi-workspace, parallel agents, cloud/local handoff, cloud subagents, and worktrees. Claude Code docs describe multiple agents and background agents. | Multi-agent supervision is market-validated but not unique. | High | Evidence-backed externally | Position as local terminal cockpit, not as inventor of parallel agents. |
| Codex is now a direct browser-surface comparator | OpenAI Codex docs list Codex CLI, app browser, Chrome extension, Computer Use, Appshots, subagents, worktrees, cloud tasks, MCP, and image inputs. | Chromux must not imply Codex lacks browser or app surfaces; it wraps Codex sessions for a specific local paired-review workflow. | High | Evidence-backed externally | Add Codex to the primary competitor set. |
| Browser automation/debug primitives are strong prior art | Playwright MCP provides browser automation through accessibility snapshots and many MCP clients; Chrome DevTools MCP offers performance traces, network analysis, screenshots, console messages, and Chrome automation. | Capture primitives are commodity; routing and review packaging are the wedge. | High | Evidence-backed externally | Avoid overbuilding browser automation in v1. |
| MCP is future-proofing, not required for v1 | MCP docs define broad client/server support; Playwright MCP README says CLI/skills can be more token-efficient for high-throughput coding agents while MCP suits persistent introspective loops. | Chromux can start with local payload delivery before offering MCP. | High | Evidence-backed externally | Defer MCP until the capture loop proves value. |
| Terminal-native CLI preservation remains a local constraint | `research/idea-brief.md` says Codex and Claude Code CLIs must stay unchanged; `research/devtool-integration-map.md` says Chromux should wrap rather than replace them. | Existing CLI habits are an adoption advantage and a design constraint. | High | Evidence-backed locally | Keep session abstraction process-oriented. |
| The first-success loop remains unproven | `research/devtool-dx-journey.md` reports no runnable app, payload schema, delivery adapter, or review queue. | Positioning must remain a product thesis until proof artifacts exist. | High | Evidence-backed locally | Keep trust and breadth claims narrow. |
| `cmux` feasibility remains unverified | `research/idea-brief.md` labels `cmux` stack/extensibility as the riskiest unknown; no source exists in this checkout. | Architecture cannot assume browser embedding works cleanly. | Medium | Unproven | Run stack spike before implementation claims. |

## Assumptions And Confidence Register

| Assumption | Current confidence | Why | What would change it |
| --- | --- | --- | --- |
| Capture channel is still the core differentiator | High | Local artifacts consistently identify preview pairing and capture as the wedge; external research shows primitives are table-stakes. | Daily-driver testing shows manual Chrome plus copy/paste remains faster. |
| The builder is still the first audience | High | Idea brief, monetization, DX, and adoption artifacts keep the personal-first lens. | User explicitly chooses commercial/team/GBlockParty-first positioning. |
| `cmux` can remain the fork base | Low-medium | It is the intended base but unverified. | Stack spike proves or rejects browser embedding and capture hooks. |
| `claude -p` is enough for v1 delivery | Medium | Claude docs support CLI composition; local docs identify it as the simplest first path. | End-to-end test shows context fragmentation or low utility. |
| Codex delivery should be first-class later | Medium | Codex CLI is a target session type, but the current v1 delivery path is more concrete for Claude. | Codex CLI supports a comparably transparent payload delivery route. |
| Future OSS users will tolerate setup | Low | No external install or interview evidence exists. | Controlled OSS preview produces repeated first-success reports. |
| Public "local-first" trust claims can be made after docs | Medium | Local-first is plausible, but only if storage/retention/deletion are explicit. | Implementation stores opaque captures, cookies, logs, or screenshots without controls. |

## Source Coverage Gaps

- No hands-on trials of Cursor Browser, Codex app/browser, Claude Code Desktop/Web/Chrome, Playwright MCP, or Chrome DevTools MCP were run. External claims are docs/repo based.
- No reliable primary `cmux` evidence was inspected in this checkout.
- No runnable Chromux source, package manifest, payload schema, or demo transcript exists locally.
- No external user interviews, installs, issues, support requests, or retention evidence exists.
- Windsurf, Devin, and other AI IDE/cloud-agent products were not deeply re-reviewed because the approved scope prioritized terminal-agent, browser, MCP, and existing local artifacts.
- Pricing and monetization comparison were intentionally out of scope for this Stage 2 positioning refresh.

## Canonical File Changes Applied

This 2026-07-06 update:

- Replaced the executive statement with the amended concise positioning above.
- Added Codex app/browser as a primary comparator.
- Strengthened the warning that browser panes, screenshots, console logs, network traffic, and browser automation are no longer differentiators.
- Preserved the core v1 guidance: pair sessions to previews, queue review events, capture bounded evidence, and route to the correct agent.
- Kept MCP, live terminal injection, cloud/team surfaces, and monetization deferred.
- Preserved source gaps and unproven `cmux` caveats.

No task-file changes were made because the active `tasks/todo.md` already contains the relevant implementation and documentation backlog.

## Sources

- Local: `research/idea-brief.md`
- Local: `research/devtool-positioning.md`
- Local: `research/devtool-dx-journey.md`
- Local: `research/devtool-integration-map.md`
- Local: `research/devtool-monetization.md`
- Local: `tasks/todo.md`
- Cursor Browser docs: `https://cursor.com/docs/agent/tools/browser.md`
- Cursor Agents Window docs: `https://cursor.com/docs/agent/agents-window.md`
- Claude Code overview: `https://code.claude.com/docs/en/overview`
- OpenAI Codex CLI docs: `https://developers.openai.com/codex/cli`
- OpenAI Codex app/browser docs: `https://developers.openai.com/codex/app/browser`
- OpenAI Codex CLI features: `https://developers.openai.com/codex/cli/features`
- Playwright MCP repository: `https://github.com/microsoft/playwright-mcp`
- Chrome DevTools MCP repository: `https://github.com/ChromeDevTools/chrome-devtools-mcp`
- Model Context Protocol introduction: `https://modelcontextprotocol.io/docs/getting-started/intro`
