# Chromux Design Refresh Prototypes

Thirty-six self-contained visual design explorations for the Chromux desktop app.
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
| 16 | `16-liquid-glass.html` | Liquid Glass | Optical glass layers — bright silver-blue translucency, fine white edge light, refractive depth, restrained spectral accents |
| 17 | `17-mission-patch.html` | Mission Patch | NASA-era aerospace documentation — midnight blue, cream technical labels, embroidered mission badges, telemetry strips, hardware-panel controls |
| 18 | `18-cartographer.html` | Cartographer | Topographic command center — contour lines, coordinate grids, terrain colors, route markers, sessions as expeditions |
| 19 | `19-darkroom.html` | Darkroom | Photographic contact sheet — near-black surfaces, red safelight accents, film perforations, captures treated like negatives |
| 20 | `20-bauhaus-console.html` | Bauhaus Console | Primary geometry, asymmetric composition, oversized type, strict circles and rectangles, functional Bauhaus color coding |
| 21 | `21-library-stacks.html` | Library Stacks | Academic research desk — linen paper, index cards, marginalia, brass labels, sessions catalogued like volumes |
| 22 | `22-analog-synth.html` | Analog Synth | Modular synthesizer — patch cables, waveform activity, labeled modules, rotary controls, blinking sequencer states |
| 23 | `23-air-traffic-control.html` | Air-Traffic Control | Dense but disciplined radar UI — desaturated green, range rings, compact flight strips, attention events as tracked contacts |
| 24 | `24-executive-glass.html` | Executive Glass | Restrained enterprise luxury — charcoal glass, warm metallic accents, immaculate spacing, data-dense tables, almost no motion |
| 25 | `25-comic-control-room.html` | Comic Control Room | Bold ink outlines, halftone shadows, panel layouts, speech-bubble notifications, impact typography for agent events |
| 26 | `26-field-notebook.html` | Field Notebook | Weatherproof expedition gear — olive canvas, graph paper, stamped labels, grease-pencil marks, rugged physical controls |
| 27 | `27-broadcast-studio.html` | Broadcast Studio | Live-production switcher — multiview panes, tally lights, program/preview states, lower-thirds, ON AIR attention |
| 28 | `28-museum-archive.html` | Museum Archive | Quiet institutional presentation — neutral stone, accession numbers, specimen labels, display-case depth, captures as artifacts |
| 29 | `29-kinetic-typography.html` | Kinetic Typography | Nearly monochrome, type-first — scale, weight, spacing, and motion communicate state instead of panels, icons, or color |
| 30 | `30-cybernetic-organism.html` | Cybernetic Organism | Bio-digital — branching neural paths, translucent membranes, pulse rhythms, sessions visualized as living nodes |
| 31 | `31-medieval-scriptorium.html` | Medieval Scriptorium | Illuminated-manuscript structure, cleanly interpreted — parchment, rubrication, decorated initials, narrow columns, seals |
| 32 | `32-financial-terminal.html` | Financial Terminal | Extreme information density — compact tabular type, keyboard-first navigation, sparklines, strong status colors |
| 33 | `33-japanese-station.html` | Japanese Station System | Transit wayfinding — immaculate grids, route colors, platform identifiers, directional type, sessions as lines through stations |
| 34 | `34-thermal-industrial.html` | Thermal Industrial | Infrared palette over dark machinery — temperature gradients, diagnostic outlines, warning thresholds, heat tied to activity |
| 35 | `35-soundstage-blueprint.html` | Soundstage Blueprint | Screenplay meets production planning — scene slates, cue sheets, shot lists, timecode, agent actions as production cues |
| 36 | `36-chromatic-shadow.html` | Chromatic Shadow | Minimal white surfaces where every panel casts a different saturated colored shadow — playful without becoming Memphis |

Rows 01–05 are batch 1; rows 06–15 are batch 2; row 16 is batch 3; rows 17–36
are batch 4.

For reference, the current shipping design is a "flight-deck instrument panel":
graphite black, phosphor amber, hairline bezels, condensed instrument labels
(`prototype/renderer/styles.css`).

`SPEC.md` documents the shared content/structure contract each variation
follows — region structure and ids stay close to the real app
(`titlebar`, `rail`, `session-tabs`, `stage`, `statusbar`) so a chosen
direction can be ported into `prototype/renderer/styles.css` later.

No build step, no dependencies: everything is inline. Fonts fall back to
macOS-installed families, so the files render correctly offline.
