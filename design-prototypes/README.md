# Chromux Design Refresh Prototypes

Fifteen self-contained visual design explorations for the Chromux desktop app.
These are **static HTML mockups only** — they do not replace or modify the
shipping app in `prototype/`. Each file mocks the full main window (titlebar,
attention rail, session tabs, terminal + browser split, status bar) plus the
capture modal, all rendering the same fabricated app state so the directions
are directly comparable.

Open `index.html` for a gallery, or open any variation directly in a browser:

| # | File | Direction | One-liner |
|---|------|-----------|-----------|
| 01 | `01-paper-terminal.html` | Paper Terminal | Swiss editorial light — ink on warm paper, hairline rules, one vermilion accent |
| 02 | `02-phosphor.html` | Phosphor | Maximal green-CRT retro terminal — scanlines, glow, box-drawing chrome |
| 03 | `03-halo.html` | Halo | Deep-ocean glass — frosted floating panels, aurora glows, teal/coral accents |
| 04 | `04-foreman.html` | Foreman | Industrial control panel — matte concrete plates, safety orange, hazard striping |
| 05 | `05-atelier.html` | Atelier | Warm studio craft — cream/linen, terracotta and sage, rounded calm density |
| 06 | `06-blueprint.html` | Blueprint | Cyanotype drafting table — blueprint blue, white line-work, dimension callouts, stamped title block |
| 07 | `07-observatory.html` | Observatory Luxe | Ink navy + champagne gold — Didot display, gold hairlines, constellation motifs, watch-face polish |
| 08 | `08-neon-noir.html` | Neon Noir | Rain-slick cyberpunk night — restrained magenta/cyan neon signage, glow reflections |
| 09 | `09-retro-os.html` | Retro-OS | System 7 / NeXTSTEP nostalgia — beveled gray chrome, pinstripe titlebars, chunky widgets |
| 10 | `10-brutalist-mono.html` | Brutalist Mono | Stark black-on-white brutalism — massive type, exposed grid, zero decoration, inversion hovers |
| 11 | `11-solarpunk.html` | Solarpunk | Optimistic green tech — botanical greens on cream, organic curves, leaf/vine flourishes |
| 12 | `12-memphis.html` | Memphis | 80s Memphis maximalism — bold primaries, thick outlines, geometric confetti chrome |
| 13 | `13-e-ink.html` | E-Ink | Kindle-like grayscale — ink on paper white, one accent color total, zero motion |
| 14 | `14-streak.html` | Streak | Gamified learning-app energy — saturated green, bubbly rounded UI, 3D-bottom buttons, XP gauges |
| 15 | `15-offset.html` | Offset | Neubrutalism — flat pastel panels, thick black outlines, hard offset shadows, sticker chips |

Rows 01–05 are batch 1; rows 06–15 are batch 2.

For reference, the current shipping design is a "flight-deck instrument panel":
graphite black, phosphor amber, hairline bezels, condensed instrument labels
(`prototype/renderer/styles.css`).

`SPEC.md` documents the shared content/structure contract each variation
follows — region structure and ids stay close to the real app
(`titlebar`, `rail`, `session-tabs`, `stage`, `statusbar`) so a chosen
direction can be ported into `prototype/renderer/styles.css` later.

No build step, no dependencies: everything is inline. Fonts fall back to
macOS-installed families, so the files render correctly offline.
