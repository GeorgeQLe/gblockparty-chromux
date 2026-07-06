# Chromux — Idea Brief Interview Log

_Producing skill: `/idea-scope-brief` · Date: 2026-07-03 · Concept slug: `chromux`_

Stage-zero interrogation loop record. Three interrogation rounds ran to a passed confidence gate; the alignment preview (`alignment/idea-scope-brief-chromux.html`) was then approved via final compiled YAML (`approval_status: ready-for-agent-review`, coverage gate = "Approved — coverage is complete, write the canonical brief"). Round sidecars: `research/_working/interrogation-idea-scope-brief-r{1,2}.yaml`.

---

## Round 1 — Idea Assumptions Manifest

Assumptions presented (A1–A8) covering concept, problem, beneficiary, category/fork base, value wedge, layout, constraints, non-goals. Dispositions:

- **A1** (from prompt) — corrected: it's not only `localhost` dev servers; also opening a local HTML `file://` in the browser without running a dev server. `localhost` is for Vite / Next.js / Node, etc.
- **A2, A3** (from prompt) — confirmed.
- **A4** (inferred, fork base) — corrected: defer the positioning if we're running it that way.
- **A5, A6** (from prompt) — confirmed.
- **A7, A8** (inferred) — confirmed.

### Open questions

**Q1 — Restate what Chromux is in your own words; fix anything off.**
Chromux is a desktop cockpit that co-locates my parallel Codex/Claude Code sessions with an embedded browser pane, so I review localhost apps and generated interrogation/alignment HTML without alt-tabbing.

**Q2 — Which base should Chromux fork — cmux, Chromium, or VSCode?**
Fork cmux and embed a Chromium browser pane (Electron BrowserView/webview). Keep Chromium and VSCode as fallbacks if cmux's rendering or extensibility blocks a first-class browser integration. This is a hypothesis to validate against cmux's actual stack. Also envisioned: rich features like compiling YAML commands (like the interrogation/alignment pages) but for payloads that include console.logs from inspect element, HTML data from that inspected page, Chromium telemetry, or a highlight on the browser page to point the agent at — all wrapped into YAML that one click can transmit to an active Codex/Claude Code session or run as a one-off `claude -p` command.

**Q3 — Which layout day one — unified sidebar, split panes, or both/toggle?**
v1 = split-pane shared frame (terminal + browser side-by-side, one browser pane paired per agent session); unified-sidebar tab mode added later as a toggle.

**Q4 — Is the win co-location, or automation (auto-detect/open/refresh each session's localhost)?**
Automation is the wedge: auto-detect each session's localhost URL and open/refresh it in the paired browser pane, with quick-open for generated interrogation/alignment HTML pages. Co-location is table stakes, not the differentiator. Also: when a user is viewing something, a new popup should be added to a review queue rather than replacing what the user is currently looking at, or be a smooth addition to an existing split.

**Q5 — Personal tool or ship to other developers?**
Personal tool first, built in the open; revisit productizing as an OSS devtool once Chromux is part of my daily workflow. Possibly offer it as a front-end interface on GBlockParty's managed infra to monetize it (lead gen for GBlockParty).

**Q6 — What stays OUT of scope, and what hard constraints are real now?**
Non-goals: general-purpose browser, new agent runtime, full IDE/VSCode replacement, team/multiplayer features. Constraints: solo builder, macOS laptop first, keep Codex + Claude Code CLIs unchanged, limited laptop screen real estate.

---

## Round 2 — Payload, delivery, pairing, and the minimal v1

Assumptions B1–B5 confirmed. Open questions:

**Q1 — For the v1 browser→agent YAML payload, which captures matter, which are later?**
v1 payload = console logs + the highlighted element's `outerHTML` and CSS selector + a screenshot (full-page or the highlighted region) + current URL. Defer full network/telemetry stream (perf entries, request waterfall) to a later version.

**Q2 — How should the payload physically reach the agent?**
Ship the one-off `claude -p` path first (Chromux runs the command with the YAML as prompt/attachment, no PTY plumbing). Add inject-into-focused-session (write payload to the paired session's terminal stdin) as a fast follow. File-drop mode as fallback. _(low confidence — flagged as second-riskiest area)_

**Q3 — How does Chromux know which session a payload targets; how do panes pair with sessions?**
Explicit 1:1 pairing — each agent session owns one browser pane; a captured payload targets the paired session by default, with a picker to redirect to another session or to a one-off `claude -p`.

**Q4 — What should the review queue do when a session emits a new localhost URL or preview?**
Never hot-swap the focused pane. Auto-refresh only the pane you're already viewing when its own URL changes. A new preview enters a badged review queue and only joins the split on explicit accept (or auto-fills an empty/idle pane). No attention-stealing swaps.

**Q5 — What's the smallest v1 you'd actually use every day?**
v1 = cmux fork with split-pane per session + auto-open/refresh of localhost and local `file://` previews + the review queue + one "Send to agent" button firing `claude -p` with console logs, highlighted-element DOM, and a screenshot. Defer live-session stdin injection, full telemetry capture, the unified-sidebar layout toggle, and all productization/GBlockParty work.

---

## Round 3 — Coverage checkpoint (confidence-gate exit)

Presented the resolved concept summary, riskiest unknowns, and readiness for customer discovery. Every interview area confirmed covered (concept, problem, beneficiary, category, value wedge, interaction model, constraints, non-goals, market structure, deck fit, riskiest unknowns). No gap or wrong premise flagged. Gate passed → advanced to the stage-2 alignment preview.

---

## Alignment preview approval

`alignment/idea-scope-brief-chromux.html` reviewed; final compiled YAML returned with all gates answered at their recommended options:

- **Concept Identity & Slug** — Correct; Chromux as summarized, slug `chromux`, flat single-product mode.
- **v1 Scope & Non-Goals** — Correct as shown.
- **Deferred & GBlockParty** — Keep as a deferred `revisit_candidate` inside the brief; no product-path split.
- **Deck Fit** — `devtool-afps` (deliberate developer-tool deck).
- **Customer Discovery Readiness** — Defer; builder is the n=1 user, build first.
- **Artifact Destination** — Approve writing both flat files; no `research/.progress.yaml`.
- **Coverage & Final Approval** — Approved; coverage complete, write the canonical brief.
