# Chromux Mobile Prototypes

Seven self-contained interaction explorations for a phone-native Chromux.
These are **static HTML mockups only** — they do not replace or modify the
shipping desktop app in `prototype/`.

Mobile Chromux is framed as a **remote agent command center**, not a miniature
desktop IDE. Its primary loop:

> See which agents need attention → inspect their latest work → intervene
> through SSH → operate the browser → capture evidence → return that evidence
> to the correct agent.

Each file renders a phone frame (prototype 07 adds a tablet frame) mocking the
same fabricated fleet state — 3 need you, 5 working, 2 completed, 1 host
offline, with `checkout-flow · claude` as the drill-in session — so the
directions are directly comparable.

Open `index.html` for a gallery, or open any variation directly in a browser:

| # | File | Prototype | One-liner |
|---|------|-----------|-----------|
| 01 | `01-mission-control.html` | A — Mission Control | Compact flight deck — attention-first fleet dashboard, persistent Agent/Terminal/Browser/Evidence switcher |
| 02 | `02-agent-inbox.html` | B — Agent Inbox | Warm editorial inbox — conversational summaries, activity blocks, a composer that previews what is sent and to whom |
| 03 | `03-browser-field-kit.html` | C — Browser Field Kit | Browser-first visual QA — full-bleed remote page, radial tool, hold-to-inspect, terminal as a bottom sheet |
| 04 | `04-timeline.html` | D — Timeline / Black Box | Event-sourced observatory — replayable session timelines, scrub back and branch a correction from history |
| 05 | `05-deck-of-agents.html` | E — Deck of Agents | Tactile neubrutalist card deck — one session per screen, vertical layers, huge one-handed controls |
| 06 | `06-command-lens.html` | F — Command Lens | Expert OLED minimalism — one universal command field, structured shortcuts, staged voice actions |
| 07 | `07-remote-workbench.html` | G — Remote Workbench | Tablet-first industrial workbench — multi-pane layout with drag-and-drop evidence, collapsing to a stacked phone layout |

`SPEC.md` documents the shared content/structure contract every variation
follows — the layered contexts (Fleet → Attention → Session → Terminal or
Browser → Evidence), required screen ids (`screen-home`, `screen-session`,
`screen-terminal`, `screen-browser`, `screen-evidence`, `sheet-send`), the
exact fabricated fleet/session state, and the intervention-safety rules
(approving a tool call, replying to an agent, and typing into a shell must be
visually distinct).

The desktop design explorations live in `../design-prototypes/`. The published
site serves this gallery at `/mobile/` and the desktop gallery at `/designs/`.

No build step, no dependencies: everything is inline. Fonts fall back to
macOS-installed families, so the files render correctly offline.
