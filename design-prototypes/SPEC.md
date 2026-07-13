# Chromux Design Refresh — Shared Prototype Spec

Every variation is ONE self-contained HTML file (all CSS/JS inline, no external
network dependencies required — font `@import` from Google Fonts is allowed as a
progressive enhancement but MUST have strong locally-installed macOS fallbacks,
e.g. Avenir Next, Futura, Optima, Charter, Iowan Old Style, Didot, American
Typewriter, Menlo, SF Mono, Monaco).

The file mocks the FULL Chromux main window on a canonical fixed 1440×900
desktop canvas (`overflow: hidden` on body). The concept itself does not reflow:
responsive presentation is handled by `viewer.html`, which proportionally
scales and centers the complete canvas whenever the available viewport is
smaller than 1440×900. Future desktop concepts must be linked and published
through that viewer rather than exposed directly with clipped overflow. It is a
static visual prototype: no real terminal or webview — fabricate believable
content.

## Required regions (must all be present, restyled in your design language)

1. **Titlebar** (~44px, macOS traffic-light padding on the left ~84px)
   - Brand: Chromux mark (three nodes — orange, violet, green — connected by a
     chevron path; you may redraw the SVG in your own style but keep the
     three-node motif) + "CHROMUX" + subtitle "AGENT COCKPIT"
   - Gauges: `3 SESSIONS` (green dot) · `2 QUEUED` (amber/attention dot) ·
     `14 SENT` (cyan/info dot)
   - Buttons: `UPDATE READY` (highlighted/urgent style) and `SETTINGS`

2. **Left rail** (~230px): "ATTENTION QUEUE" header + `⛶ DETECT` button.
   Three queue cards:
   - APPROVAL · "checkout-flow" · "claude wants to run `npm run db:migrate`" (urgent accent)
   - PREVIEW · "landing-page" · "localhost:5173 changed — review ready" (info accent)
   - EXITED · "api-server" · "codex exited (code 0) · 12m ago" (danger/muted accent)
   Rail footer: "LOCAL STORAGE" label + path link `~/.chromux/captures`.

3. **Session tab strip**: 3 tabs + a `+` add-tab button.
   - Tab 1 (ACTIVE): live green dot · "checkout-flow · claude" · badge `2`
   - Tab 2: live dot · "landing-page · grok"
   - Tab 3: dead red dot · "api-server · codex"

4. **Stage — split view** (the active session):
   - **Terminal pane** (left, ~46%): pane header "TERMINAL — claude"
     + cwd `~/projects/shop/checkout-flow`. Body = fake agent transcript styled
     as your terminal treatment. Use roughly this content:
     ```
     ✻ Welcome to Claude Code!          /projects/shop/checkout-flow
     > fix the CTA overflow on the checkout page
     ● I'll look at the checkout component styles.
     ● Read src/components/CheckoutCTA.tsx (84 lines)
     ● Edit src/styles/checkout.css
       - .cta-row { width: 120%; }
       + .cta-row { width: 100%; max-width: 480px; }
     ✔ Change applied — dev server reloaded
     ● The button no longer overflows. Preview updated on the right.
     ▌awaiting your next instruction…
     ```
   - **Divider** (draggable look, ~6px)
   - **Browser pane** (right): toolbar with back/forward/reload nav buttons,
     URL bar `http://localhost:5173/checkout`, buttons `⛶ CAPTURE` (primary
     accent), `QUEUE` with badge `2`, `console: 0` chip, and `⌄ COLLAPSE`.
     Below: a fake rendered web page — a small light-mode e-commerce checkout
     mock (order summary card + a "Pay $48.00" CTA button) sitting deliberately
     in contrast with the app chrome around it, plus a "REFRESHED" auto-reload
     flash chip in a corner.

5. **Status bar** (~26px): left `ADAPTER claude -p · one-off` + `PAIRING 1:1
   session ↔ pane`; right `DELIVERY LOG` button + `chromux 0.17.0 — <variation
   name> concept`.

6. **Capture modal** (hidden by default; a small inline `<script>` toggles it
   from the CAPTURE button; Esc or ✕ closes). Two-column: left = summary rows
   (SESSION checkout-flow · claude, URL localhost:5173/checkout, SELECTION
   "CTA button region 412×88"), a note textarea placeholder "e.g. the CTA
   button overflows its container — fix the CSS", TARGET select showing
   "checkout-flow · claude -p", screenshot placeholder box; right = "PAYLOAD
   PREVIEW — YAML v1" block with fake YAML:
   ```yaml
   chromux_capture: v1
   session: checkout-flow
   agent: claude
   url: http://localhost:5173/checkout
   note: CTA overflows container
   screenshot: ~/.chromux/captures/2026-07-11-0142.png
   console_errors: []
   ```
   Footer: CANCEL · FILE-DROP ONLY · SEND — claude -p (primary).

## Rules

- Real, hand-tuned CSS. No frameworks, no Tailwind, no CDN scripts.
- Keep the region structure/ids close to the real app (`titlebar`, `rail`,
  `session-tabs`, `stage`, `statusbar`) so the design could later be ported.
- Interactive flourishes welcome (hover states, subtle keyframe animation,
  modal toggle) but everything must degrade to a good static screenshot.
- Every variation must look UNMISTAKABLY different from the current app
  (graphite + phosphor amber flight-deck) and from the other four variations.
- Title the page `Chromux — <Variation Name>` and put a small fixed corner
  tag (e.g. bottom-right) naming the variation.
