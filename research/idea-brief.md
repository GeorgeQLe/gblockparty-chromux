# Chromux — Idea Brief

_Producing skill: `/idea-scope-brief` · Date: 2026-07-03 · Concept slug: `chromux` · Mode: flat single-product · Stage: pre-customer-discovery_

## Summary

Chromux is a macOS desktop "cockpit" — a fork of `cmux` — that co-locates a developer's parallel Codex / Claude Code terminal sessions with an embedded Chromium browser pane. Each agent session is paired 1:1 with a browser pane that auto-opens and refreshes that session's `localhost` dev-server previews and local `file://` HTML (e.g. generated interrogation / alignment pages), so the developer reviews agent output without alt-tabbing. Its differentiating capability is a browser→agent capture channel: one click packages console logs, a highlighted element's `outerHTML` + CSS selector, a screenshot, and the current URL into a YAML payload and sends it to the paired agent (v1: a one-off `claude -p` invocation).

## Problem Hypothesis

A solo developer running several parallel coding-agent sessions constantly alt-tabs between terminals and a separate browser to review generated localhost apps and local HTML previews; and when something is wrong on the page, pointing the agent back at it is manual copy-paste of console errors, DOM, and screenshots. This context-switching and manual round-tripping is friction that grows with the number of parallel sessions.

## Beneficiary Hypothesis

Primarily the builder himself (n=1) — a solo dev orchestrating multiple parallel agent sessions on a macOS laptop. Built in the open; a secondary, future beneficiary is other agent-driven developers with the same parallel-session workflow. Not validated beyond the builder.

## Product Category Guess

A desktop developer tool — specifically a `cmux` fork (Electron-based terminal multiplexer for agents) extended with a first-class embedded Chromium browser pane and a browser→agent capture channel. Chromium and VSCode are held only as fallback bases if cmux's stack blocks first-class browser embedding.

## Value Wedge

Automation, not mere co-location. Co-location (browser in the same window) is table stakes. The wedge is:

1. auto-detect each session's `localhost` URL and auto-open/refresh it in the paired pane;
2. open local `file://` HTML previews the same way;
3. one-click capture of browser context (console logs + highlighted-element `outerHTML`/selector + screenshot + URL) into a YAML payload sent to the paired agent;
4. a non-attention-stealing review queue — new previews are badged and queued, never hot-swapping the pane you're currently viewing.

## Constraints

- Solo builder.
- macOS laptop first.
- Codex + Claude Code CLIs must stay unchanged — Chromux wraps them, does not modify them.
- Limited laptop screen real estate.

## Non-Goals

- Not a general-purpose browser.
- Not a new agent runtime.
- Not a full IDE / VSCode replacement.
- No team / multiplayer / collaboration features.

Deferred out of v1 (not permanent non-goals): live-session stdin injection (v1 uses one-off `claude -p`), full network/telemetry capture, the unified-sidebar layout toggle, and all productization / GBlockParty monetization work.

## Assumptions And Unknowns

**Assumptions carried:**

- `cmux` is the right fork base and its stack allows embedding a first-class Chromium pane (BrowserView/webview). _(medium confidence — validate vs cmux's real stack)_
- v1 layout is split-pane per session; unified-sidebar tab mode is a later toggle. _(medium confidence)_
- Explicit 1:1 session↔pane pairing with a redirect picker is the right pairing model. _(medium confidence)_
- One-off `claude -p` is the simplest first payload delivery; inject-into-session is a fast follow; file-drop is fallback. _(low confidence — second-riskiest area)_
- v1 payload = console logs + highlighted `outerHTML` + CSS selector + screenshot + URL; full telemetry deferred. _(medium confidence)_

**Riskiest unknowns (carry into research / prototyping):**

1. cmux's real stack and extensibility for a first-class embedded browser — the single biggest architecture / effort decision.
2. The payload→live-session handoff mechanism — how a captured payload reliably reaches an agent.

**Deferred revisit candidate — GBlockParty monetization:** Chromux as a front-end interface on GBlockParty's managed infra (lead-gen / monetization for GBlockParty). Recorded as a deferred `revisit_candidate`, not a v1 concern. Revisit trigger: "Chromux is part of my daily workflow." Likely next skill at that point: `/customer-discovery` for the productization + monetization angle. Kept inside this brief rather than split into a separate tracked product path.

## Customer Discovery Readiness

Because Chromux is personal-tool-first (the builder is the n=1 user), the recommendation is to **defer** formal `/customer-discovery` and validate by daily-driving the tool. Chromux reads as **single-sided** — one user (you, then possibly other agent-driven devs) — so no marketplace / multi-sided market-structure handoff applies; the GBlockParty angle is the only multi-party seam and it is explicitly deferred.

If/when productizing as an OSS devtool (the revisit trigger), `/customer-discovery` should test:

- (a) whether other agent-driven devs share the parallel-session alt-tab problem;
- (b) whether the browser→agent capture channel is the real differentiator vs. plain co-location;
- (c) the GBlockParty managed-infra / lead-gen angle.

## Deck Fit Handoff

Best candidate: **`devtool-afps`** — deliberate developer-tool workflow deck. Source: canonical fallback (no `docs/decks.md` or saved `.agents/project.json` decks in this fresh repo). Domain fit: developer desktop tool / agentic dev environment → developer deck lane. Tempo fit: deliberate — forking cmux into an Electron desktop app is a weeks/months build, not a day-experiment. Confidence: **high** (deck gate confirmed the deliberate-devtool framing). Runner-up: `ord` (rapid OSS/CLI lane) if Chromux is treated as a lightweight, ship-fast OSS utility. Install (primary): `npx skillpacks install-deck devtool-afps`. Likely first post-install skill: `/devtool-positioning` (secondary context, not the primary command).

## Next Steps

**Primary:** `npx skillpacks install-deck devtool-afps` — the deck gate confirmed the deliberate-devtool framing, so this is the primary next command. Customer discovery is deferred (personal-tool-first); after install, `/devtool-positioning` is the likely first workflow skill, as secondary context.

Secondary options worth doing in parallel:

- Start a `cmux` stack spike to validate embedded-browser feasibility (riskiest unknown #1).
- Prototype the capture → `claude -p` payload loop end-to-end (riskiest unknown #2).
