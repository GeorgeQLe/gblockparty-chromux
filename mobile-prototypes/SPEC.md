# Chromux Mobile — Shared Prototype Spec

Seven prototypes (A–G) explore what a **mobile Chromux** should be: a remote
agent command center, not a miniature desktop IDE. The primary loop:

> See which agents need attention → inspect their latest work → intervene
> through SSH → operate the browser → capture evidence → return that evidence
> to the correct agent.

Every variation is ONE self-contained HTML file (all CSS/JS inline, no external
network dependencies required — font `@import` from Google Fonts is allowed as
a progressive enhancement but MUST have strong locally-installed macOS
fallbacks, e.g. Avenir Next, Futura, Optima, Charter, Iowan Old Style, Didot,
American Typewriter, Menlo, SF Mono, Monaco).

## Device frame

The file renders a fixed **phone frame** — 393×852 (iPhone-class), rounded
corners, subtle bezel — centered on a muted full-viewport backdrop that suits
the variation's palette. Include a small status bar strip (9:41, signal, wifi,
battery) styled in the variation's language. At viewport widths ≤ 430px the
frame collapses to fill the screen (no bezel).

Put a small fixed corner tag on the backdrop (e.g. bottom-right) naming the
variation, and title the page `Chromux Mobile — <Variation Name>`.

Prototype G (Remote Workbench) is tablet-first: it must ALSO render a tablet
frame (1194×834 landscape, scaled with CSS `transform: scale()` to fit
alongside) showing the multi-pane workbench, plus the phone frame showing the
collapsed stacked layout.

## Interactivity

Screens are switched by a small inline `<script>` (class/hash toggling — no
frameworks). The variation's own navigation idiom (bottom dock, segmented
control, swipe affordance rendered as edge tabs, card stack, command field…)
drives the switching; buttons/taps are enough — do not implement real gesture
recognizers. The HOME screen must be visible by default so a static screenshot
of the file is representative. Hover/active flourishes and subtle keyframe
animation welcome; everything must degrade to a good static screenshot.

## Layered contexts (all prototypes)

Fleet → Attention → Session → Terminal or Browser → Evidence

Each prototype must render these five surfaces, in its own idiom, using these
element ids so the directions stay comparable:

- `#screen-home` — fleet/attention entry surface (default visible)
- `#screen-session` — one agent session: plain-language summary + intervention
- `#screen-terminal` — live terminal (streamed scrollback look)
- `#screen-browser` — paired remote browser
- `#screen-evidence` — capture reel / evidence
- `#sheet-send` — evidence-delivery sheet/modal (hidden by default, toggled by
  a "send to agent" action; Esc or ✕ closes)

Terminal and browser are peers; only one is normally dominant. The switching
affordance between them must be visible inside the session context.

## Shared fabricated app state

Every prototype renders THIS exact state so the directions are directly
comparable.

### Fleet totals

**3 need you · 5 working · 2 completed · 1 host offline**

### Hosts

| Host | Transport | State |
|------|-----------|-------|
| `home-mac` | SSH · 42ms | online |
| `staging-2` | SSH · 118ms | online |
| `build-server` | relay | **offline · 26m** |

### Sessions

Needs attention (3):

1. **`checkout-flow · claude`** @ home-mac — **NEEDS APPROVAL** (urgent):
   claude wants to run `npm run db:migrate` · repo `~/projects/shop/checkout-flow`
   · branch `fix/cta-overflow` · elapsed 18m. ← the drill-in session below.
2. **`landing-page · grok`** @ home-mac — **READY FOR REVIEW** (info):
   localhost:5173 changed — preview ready · 4 files changed · 2m ago.
3. **`api-server · codex`** @ staging-2 — **EXITED** (danger/muted):
   codex exited (code 0) · 12m ago.

Working (5):

4. `worker-queue · claude` @ staging-2 — refactoring retry logic · 4m
5. `docs-site · codex` @ home-mac — writing changelog · 12m
6. `auth-service · claude` @ staging-2 — running test suite · 1m
7. `mobile-app · grok` @ home-mac — fixing lint errors · 8m
8. `analytics · codex` @ home-mac — silent 22m (long quiet period)

Completed (2):

9. `payments-api · claude` @ staging-2 — finished · 3 files changed · 18m ago
10. `search-index · codex` @ home-mac — finished · tests pass · 1h ago

Disconnected (offline host): `ci-runner · claude` @ build-server.

### Drill-in session: `checkout-flow · claude` @ home-mac

Terminal transcript (style it as your terminal treatment):

```
✻ Welcome to Claude Code!          ~/projects/shop/checkout-flow
> fix the CTA overflow on the checkout page
● I'll look at the checkout component styles.
● Read src/components/CheckoutCTA.tsx (84 lines)
● Edit src/styles/checkout.css
  - .cta-row { width: 120%; }
  + .cta-row { width: 100%; max-width: 480px; }
✔ Change applied — dev server reloaded
● The button no longer overflows. Preview updated.
● Next I need the new orders table locally.
⚠ APPROVAL REQUIRED
  npm run db:migrate
▌waiting for your decision…
```

Plain-language session summary (for summary-first surfaces):

- Fixed CTA overflow in `checkout.css`
- Dev server reloaded — preview updated
- **Wants to run `npm run db:migrate`** — waiting 6m

**Intervention safety** (required in every prototype): the approval surface
must visually distinguish the three input modes — *approve the tool call*
(APPROVE / DENY / ALWAYS ALLOW), *reply to the agent* (message composer), and
*type into the shell* (raw terminal input). Ambiguity here is dangerous;
label the modes explicitly. Destructive actions get a confirm step.

### Paired remote browser

- URL `http://localhost:5173/checkout` (tunneled from home-mac)
- Viewport preset chip: `iPhone 15 · 393×852`
- Page content: a small light-mode e-commerce checkout mock — order summary
  card (Canvas Tote ×1 $38.00 · Shipping $10.00 · Total $48.00) + a
  **"Pay $48.00"** CTA button — deliberately in contrast with the app chrome.
- Chips: `console: 0` · `net: 1 failed` (`POST /api/telemetry · 503`)
- Touch-native controls in your idiom: tap, long-press/inspect, type, scroll,
  viewport, back/forward, reload, screenshot, record.
- Element inspection state (used by signature interactions): selected element
  `button.cta-pay` — accessible name "Pay $48.00" — selection 412×88.

### Evidence reel (3 items, newest first)

1. Screenshot `2026-07-12-0912.png` — checkout CTA after fix · 2m ago
2. Recording `checkout-tap-flow.webm` — 0:14 · 3 taps · 1 console error ·
   viewport iPhone 15 · 9m ago
3. Element capture — `button.cta-pay` "Pay $48.00" · 412×88 · 11m ago

### Send sheet (`#sheet-send`)

Previews exactly what will be sent and to which agent:

- TARGET `checkout-flow · claude` @ home-mac
- Attachment summary (e.g. screenshot thumbnail placeholder + URL + viewport)
- Note placeholder: "e.g. the CTA still clips at 320px — check small viewports"
- Payload summary styled to your language:

```yaml
chromux_capture: v1
session: checkout-flow
agent: claude
host: home-mac
url: http://localhost:5173/checkout
viewport: 393x852
note: CTA verified after fix
screenshot: ~/.chromux/captures/2026-07-12-0912.png
console_errors: []
network_failures:
  - POST /api/telemetry (503)
```

Footer actions: CANCEL · SEND — claude (primary accent).

### Status / connection

A persistent (or summonable) strip shows: host, transport quality
(`SSH · 42ms`), agent state, and whether a command or browser interaction is
in flight. Mobile attaches to durable remote sessions — show a "session
persists on disconnect" cue somewhere (e.g. reconnect toast, durable badge).

## The seven variations

| # | File | Prototype | Theme contract |
|---|------|-----------|----------------|
| 01 | `01-mission-control.html` | A — Mission Control | Compact flight deck: graphite, warm amber, pale cyan, thin instrument rules, condensed labels, restrained status lights. Attention-first fleet dashboard; persistent bottom switcher Agent · Terminal · Browser · Evidence; swipe-right approve / swipe-left inspect affordances on attention cards; long-press quick commands. |
| 02 | `02-agent-inbox.html` | B — Agent Inbox | Warm editorial light: off-white paper, charcoal text, vermilion attention marks, generous whitespace, monospaced metadata. Inbox home (Needs response / Ready for review / Running / Recently completed / Connection problems); conversational session with collapsible activity blocks; reply composer that previews instruction vs command vs approval vs evidence; terminal/browser as deep-inspection modes. |
| 03 | `03-browser-field-kit.html` | C — Browser Field Kit | Dark photographic canvas, translucent tool trays; browser fills the screen, chrome appears when summoned. Home = gallery of live preview thumbnails (URL, viewport, visual-change dot, console/net error counts, capture age). Thumb-reachable radial tool (Inspect/Tap/Type/Scroll/Viewport/Screenshot/Record/Annotate/Console/Send). Hold-to-inspect element overlay with Report / Capture / Ask agent / Compare. Terminal = draggable bottom sheet. |
| 04 | `04-timeline.html` | D — Timeline / Black Box | Deep navy observatory: luminous event points, thin connecting lines, muted gold = human, cyan = agent, coral = failure. Home = per-session compact timelines revealing silence, failures, approvals, captures. Session = merged chronological event stream; selecting an event reconstructs context (terminal position, URL, screenshot, console). "Branch from here" scrubbing interaction. |
| 05 | `05-deck-of-agents.html` | E — Deck of Agents | Bold neubrutalist cards: dark outlines, saturated per-session colors, large state labels, hard shadows, minimal tiny text. Full-screen session cards; horizontal deck between agents, vertical layers Summary → Live output → Browser preview → Evidence; attention cards protrude with a colored edge; bottom third = large context-sensitive controls; flick-screenshot-to-attach affordance. |
| 06 | `06-command-lens.html` | F — Command Lens | Near-black OLED, crisp monochrome type, electric cyan focus, almost no permanent chrome. One command field ("Jump to agent, host, URL, command, capture, or action…") + active alerts + recent contexts; suggestion rows for `@checkout open browser`, `@api approve`, `record checkout mobile`, `viewport iphone 15`…; full-screen materialized surfaces with a context capsule; staged multi-step voice command awaiting confirmation. |
| 07 | `07-remote-workbench.html` | G — Remote Workbench | Calm industrial workspace: slate surfaces, safety-orange intervention states, large durable controls, clear pane boundaries. Tablet frame = agents/alerts rail + browser + terminal/activity panes with expand affordances and a pinned browser; phone frame = stacked workspace with persistent mode rail; drag-evidence-to-agent drop target with delivery preview. |

## Rules

- Real, hand-tuned CSS. No frameworks, no Tailwind, no CDN scripts.
- Every variation must look UNMISTAKABLY different from the others and from
  the desktop flight-deck, while honoring its brief's theme.
- Keep all fabricated content consistent with this spec — same sessions, same
  counts, same transcript, same evidence — so the directions are comparable.
- These are static visual prototypes: no real SSH, terminal, or browser.
- Accessibility gestures: focus-visible styles on interactive elements;
  `aria-hidden` decorative art; buttons are `<button>`.
