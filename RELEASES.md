# Release Notes

## GBlockParty Chromux v0.50.0

Tag: `chromux-v0.50.0`

- Double-click any session row in Threads to activate it in the terminal area, reveal its tab, and restore terminal or composer focus.
- Keep the first and second clicks immediate: inactive rows can show the read-only terminal preview during the gesture, and completed double-click activation dismisses it.
- Apply the same activation path to ordinary, Working, and Needs Attention rows while preserving inline attention actions, active-row confirmation, preview activation, and title-stable row DOM.

## GBlockParty Chromux v0.49.0

Tag: `chromux-v0.49.0`

- Transfer the current Codex prompt editor value into COMPOSE from the cursor-anchored xterm buffer, capturing accepted autocomplete expansions, history recall, cursor edits, Unicode, intentional newlines, and visual wrapping.
- Use the same resolved prompt value for empty-draft insertion and Append, Replace, Copy, and Dismiss conflict outcomes while preserving the 64 KiB UTF-8 and clipboard boundaries.
- Exclude prompt chrome, placeholders, borders, autocomplete menus, unrelated output, and stale submitted rows; retain the session-local keystroke model as a conservative fallback and leave ambiguous live Codex input uncleared.
- Keep Claude, Grok, and shell transfer behavior unchanged and add real-Electron coverage for rendered extraction, ambiguity, overflow, exited sessions, conflicts, and non-Codex fallback.

## GBlockParty Chromux v0.48.1

Tag: `chromux-v0.48.1`

- Keep working Threads spinner nodes mounted while ordinary characters, terminal controls, and other unsubmitted input update the live terminal draft.
- Continue tracking pending terminal input and preview suppressions without rebuilding unrelated sidebar state when turn state does not change.
- Preserve the existing submitted-input transition to Working, including the expected Threads render when status or group membership changes.

## GBlockParty Chromux v0.48.0

Tag: `chromux-v0.48.0`

- Check Codex once per Chromux launch, hold every fresh or restored Codex session behind one workspace decision, and continue restoring Claude, Grok, and shell sessions immediately.
- Follow Codex's stable release-source policy for Homebrew, npm-compatible, and standalone installs; cache successful checks for one hour, bound failures and progress, require explicit update confirmation, and verify the installed version before releasing queued sessions.
- Suppress Codex's native startup update prompt only inside Chromux with the official process-scoped configuration override, including fresh, resumed, restored, Detect, and recognized shell launches.
- Offer one aggregated prompt with release notes, retry, verified update, and launch-local Resume Anyway paths while preserving the existing per-session warning for genuine Codex resume failures.

## GBlockParty Chromux v0.47.0

Tag: `chromux-v0.47.0`

- Pin every live session with an agent turn in progress in an always-expanded `WORKING` section in Threads.
- Update the section immediately as turns start, finish, or sessions close, while keeping working sessions out of duplicate working-directory groups.
- Preserve higher-priority Needs Attention visibility and add real-Electron coverage for complete membership, deduplication, and removal.

## GBlockParty Chromux v0.46.0

Tag: `chromux-v0.46.0`

- Move a session's pending editable terminal line into an empty composer when it opens, preserving Unicode and common cursor/edit controls while clearing the live PTY line exactly once.
- Resolve terminal-input/draft conflicts with accessible Append, Replace, Copy, and Dismiss choices; Copy uses a main-process-enforced 64 KiB clipboard bridge and leaves both sources intact.
- Add an `EXPAND` / `COLLAPSE` composer control between History and Close so the editor can replace the terminal body, retain per-session state and history, and restore xterm scrollback position on collapse.
- Reset expansion on Close or Escape and add real-Electron coverage for transfer, conflicts, bounds, exited and independent sessions, shortcuts, focus, history, themes, and viewport preservation.

## GBlockParty Chromux v0.45.0

Tag: `chromux-v0.45.0`

- Preserve session-scoped Needs Attention reasons through managed updates, Developer Mode restarts, and app-close workspace restores.
- Label restored reasons as `Before restart`, keep them separate from resumed live turn state, consume historical completion on thread open, and retain other historical reasons until dismissal.
- Upgrade restore snapshots to bounded schema v5 records while retaining schema v1-v4 readability and excluding browser-queue duplication and global update rows.
- Add main-process validation and renderer coverage for bounds, malformed records, stable identifiers, mixed historical/live attention, completion consumption, dismissal, queue exclusion, update exclusion, and failed-delivery persistence.

## GBlockParty Chromux v0.44.2

Tag: `chromux-v0.44.2`

- Keep Threads rows clickable while working agents animate their terminal titles by synchronizing presentation metadata in place instead of rebuilding the rail.
- Keep row text, tooltip, ARIA status, and an open terminal-preview heading synchronized without changing inactive preview-first or no-preview direct-activation behavior.
- Give every Needs Attention card its own boundary with 6px separation and inset padding across all four themes in Light and Dark modes.
- Add real-Electron coverage for DOM-node preservation, pointer continuity, title/status synchronization, inline action isolation, and attention-card geometry.

## GBlockParty Chromux v0.44.1

Tag: `chromux-v0.44.1`

- Keep the focused session tab fully visible when Threads, search, attention actions, keyboard shortcuts, or other programmatic navigation activate an off-screen session.
- Reveal tabs minimally in either direction while preserving the current horizontal scroll position whenever the focused tab is already visible.
- Respect the sticky Search/Add action boundary so a newly focused tab and its controls are not hidden underneath the action group.
- Add real-renderer coverage for right and left reveals, sticky-control clearance, and the visible-tab no-op.

## GBlockParty Chromux v0.44.0

Tag: `chromux-v0.44.0`

- Remove Codex's leading animated Braille title frame from every Chromux-presented session label while preserving raw OSC title data and falling back to the launch name.
- Project tab, Threads, tooltip, ARIA, preview, search, and diagnostic status from one shared session-status model with red exit, amber action-required, cyan working, green completed, gray idle, and green live indicators.
- Keep exit and action-required indicators visible when activity indicators are disabled, and animate tab and Threads working spinners with the same reduced-motion-safe keyframes.
- Add renderer coverage for title frames, provider state agreement, single-indicator rendering, disabled preferences, status precedence, animation, and diagnostics.

## GBlockParty Chromux v0.43.1

Tag: `chromux-v0.43.1`

- Center the paired-browser `BROWSER` and `COLLAPSE` rail controls vertically across the full-height 40px rail.
- Keep the entire rail clickable while preserving its icon, vertical label, colors, hover behavior, browser state, shortcuts, and narrow-toolbar access.
- Add real-renderer geometry coverage for full-height hit area and centered visible content in both open and shut states.

## GBlockParty Chromux v0.43.0

Tag: `chromux-v0.43.0`

- Make Threads the default unified session rail and migrate saved Attention or invalid rail preferences, leaving Git Changes as the only alternate mode.
- Pin managed Chromux Update status above an expanded Needs Attention section, aggregate every outstanding reason and action into one attentive thread, and keep attentive sessions out of their working-directory groups until the final reason clears.
- Move the individual outstanding-item badge to Threads while preserving attention priority, update safety, acknowledgements, previews, active-session confirmation, keyboard access, and direct inline actions.
- Update diagnostics, accessibility copy, documentation, and focused renderer coverage for the unified two-mode rail.

## GBlockParty Chromux v0.42.0

Tag: `chromux-v0.42.0`

- Add an on-demand multiline composer to Codex, Claude, Grok, and shell panes with `Command+Shift+Enter` open/submit, newline editing, per-session drafts, xterm-native paste/input submission, shell multiline confirmation, and safe exited-session behavior.
- Add local per-project prompt history with scratch-preserving `Option+Up` / `Option+Down` recall, search, full-prompt reuse, deletion, clearing, deduplication, atomic `0600` persistence, per-project retention, and a global 5 MiB cap.
- Upgrade managed restore snapshots to schema v4 with bounded composer drafts while retaining legacy readability, leaving restored composers closed, and keeping the xterm helper textarea untouched.
- Document local plaintext storage and the ordered roadmap for normalized agent interactions, Codex App Server, structured controls, and a future lazy-loaded Monaco adapter.

## GBlockParty Chromux v0.41.1

Tag: `chromux-v0.41.1`

- Keep every rendered terminal row above the pane's lower boundary by moving the existing visual inset onto xterm's FitAddon-aware element.
- Preserve the terminal's 6px vertical inset while allowing FitAddon to choose one fewer row at boundary heights.
- Cover real xterm geometry across row-boundary heights, bottom scrolling, repeated tab activation, browser layout changes, and explicit refits.

## GBlockParty Chromux v0.41.0

Tag: `chromux-v0.41.0`

- Add an explicit quiet `idle` turn state: unseen background completions retain their checkmark and Attention row until viewed or dismissed, while visible completions transition directly to Idle and submitted input returns Idle to Working.
- Recover missed Codex completion notifications only after xterm finishes rendering a recognized Codex composer at the cursor, retaining the native `agent-turn-complete` hook as authoritative and recording terminal recovery as low confidence.
- Make Developer Mode attention diagnostics rail-aware so Threads and Git report `NOT MOUNTED` without false mismatches, while genuine Attention DOM drift remains highlighted.
- Treat Idle sessions as update-safe and preserve exited-session indicator precedence.

## GBlockParty Chromux v0.40.0

Tag: `chromux-v0.40.0`

- Replace the browser-toolbar collapse control with a permanent 40px rail at the paired pane's far-right edge in both open and shut states.
- Label the shut-state rail `BROWSER` with a decorative left-opening panel icon, while retaining accessible open/shut names and `COLLAPSE` in the open state.
- Preserve per-session browser state, saved split width, divider behavior, terminal refitting, URL-driven and terminal-link reopening, Command+Shift+B, and narrow-toolbar access through Capture.

## GBlockParty Chromux v0.39.1

Tag: `chromux-v0.39.1`

- Preserve each tab's exact normal-buffer terminal viewport across tab activation and terminal fitting.
- Keep scrolled-back inactive tabs fixed on their saved content while new output arrives, while tabs already at the bottom continue following output.
- Retain viewport position through browser layout changes, divider and observer-driven resizing, and alternate-screen applications without changing skip-to-bottom behavior.

## GBlockParty Chromux v0.39.0

Tag: `chromux-v0.39.0`

- Add one live, read-only xterm preview when an inactive Threads row is selected, preserving ANSI colors, wrapping, recent scrollback, and alternate-screen state without changing the active session or source viewport.
- Open the previewed session by clicking anywhere in the popover or using Enter/Space; dismiss on Escape, outside click, mode changes, hidden anchors, session closure, or activation through another route.
- Confirm clicks on the already-active Threads row with a linked row and terminal-pane cue, including repeatable and reduced-motion treatments.
- Add accessible current/expanded state, viewport clamping, fully opaque theme-specific preview surfaces, and lifecycle/geometry coverage across all eight theme appearances.
- Default to a more readable Comfortable popover and add persisted Compact, Comfortable, and Large preview sizes for vision accessibility without changing source terminal wrapping.

## GBlockParty Chromux v0.38.0

Tag: `chromux-v0.38.0`

- Add a floating, bottom-centered `↓ SKIP TO BOTTOM` control after a terminal is at least one visible page behind its newest output.
- Smoothly follow the current end of scrollback without interrupting a user's scrolled-back viewport when new PTY output arrives; reduced-motion mode jumps immediately.
- Keep scroll state independent per session, suppress the control in alternate-screen and no-scrollback buffers, cancel animations on user interaction or disposal, and return focus safely to the active terminal.

## GBlockParty Chromux v0.37.0

Tag: `chromux-v0.37.0`

- Replace the Git session hierarchy with a dedicated working-copy diff tracker grouped only at the repository level.
- Show changed file paths and statuses, staged markers, and repository staged/unstaged totals, including untracked and conflicted files.
- Refresh Git changes automatically while the rail view is selected, while keeping Threads responsible for session navigation by working directory.

## GBlockParty Chromux v0.36.1

Tag: `chromux-v0.36.1`

- Vertically center the 9px horizontal session scrollbar with approximately 3px of visible clearance above and below it across every theme.
- Keep the scrollbar lane permanently reserved so tab-strip and terminal geometry remain stable as horizontal overflow appears and disappears.
- Preserve session-tab heights, sticky search/add actions, horizontal scrolling behavior, and all vertical scrollbar styling.

## GBlockParty Chromux v0.36.0

Tag: `chromux-v0.36.0`

- Add persisted icon-only Attention, Threads, and Git rail modes while retaining horizontal session tabs as the primary navigator.
- Keep unseen background completions in Attention until their session is opened, without clearing actionable agent states or completed tab status.
- Group live Threads by exact working directory and Git sessions by validated repository root, with accessible status icons and a final non-repository group.

## GBlockParty Chromux v0.35.0

Tag: `chromux-v0.35.0`

- Add session search by dynamic title, launch name, agent, or working directory, with keyboard navigation and one-click activation.
- Keep search and add-session controls together at the editor's right inset while session tabs scroll beneath them.
- Preserve scroll-end clearance so the right-most session tab and its close button remain fully reachable.

## GBlockParty Chromux v0.34.0

Tag: `chromux-v0.34.0`

- Add a persistent Prevent Sleep switch in Settings that runs macOS `caffeinate -dims` while enabled.
- Tie the managed assertion to the Chromux process, stop it when the switch is disabled or Chromux quits, and report launch failures in Settings.

## GBlockParty Chromux v0.33.3

Tag: `chromux-v0.33.3`

- Preserve each tab's exact Claude, Codex, or Grok conversation across app, update, and Developer Mode restarts, including multiple tabs in the same directory.
- Reserve exact conversation IDs before assigning distinct newest-first candidates to legacy snapshots, and disclose every best-effort match at startup.
- Validate provider identity fields inside authenticated turn-signal envelopes and persist them in backward-compatible restore snapshot schema v3.

## GBlockParty Chromux v0.33.2

Tag: `chromux-v0.33.2`

- Keep Streak attention cards and their `VIEW`/`DISMISS` hit-test rectangles fixed while hovered or pressed.
- Preserve tactile action feedback with stable border depth, border-color changes, and inset shadows instead of geometric translation.
- Cover boundary clicks with native Electron pointer input so background activation and dismissal complete on the first click.

## GBlockParty Chromux v0.33.1

Tag: `chromux-v0.33.1`

- Reserve a permanent 9px lane beneath session tabs for the existing horizontal scrollbar.
- Keep tab dimensions and terminal-stage positioning stable as horizontal overflow appears or disappears across all four theme families.

## GBlockParty Chromux v0.33.0

Tag: `chromux-v0.33.0`

- Add a host-wide, user-only Unix-socket resource broker shared by Chromux and local Codex sessions, with on-demand startup and an optional LaunchAgent.
- Add MCP tools for resource state, atomic FIFO acquisition, queued-request waiting and cancellation, lease renewal and release, editable external-client names, and lease-validated Simulator operations.
- Recover abandoned work on disconnect, TTL expiry, or daemon restart without resurrecting unverifiable leases; serialize multi-resource requests without blocking unrelated resources.
- Add a Resources view with owners, expirations, queued agents, wait times, simulator capacity overrides, cancellation, force release, and cooperative-enforcement warnings.
- Apply conservative elastic Simulator admission and idle-drain hysteresis, and isolate every paired browser in a unique persistent partition.
- Add global Codex guidance for preferring the built-in Browser and acquiring `macos:foreground-input` before Computer Use.

## GBlockParty Chromux v0.32.0

Tag: `chromux-v0.32.0`

- Add an always-expanded, read-only attention diagnostics strip with independent session inspection, expected/tracked/queue/tab comparisons, mismatch highlighting, and a sanitized newest-first event trail.
- Keep stable packaged launches in standard mode by default while enabling diagnostics for interactive unpackaged development; explicit runtime flags override the persisted Developer Mode preference.
- Add a Developer Mode switch in Settings that confirms when sessions are open, saves a restore snapshot, restarts Chromux with the selected mode, and restores resumable sessions through the existing startup flow.

## GBlockParty Chromux v0.31.1

Tag: `chromux-v0.31.1`

- Vertically center the native macOS traffic-light controls with the Chromux brand row across Blueprint, Retro-OS, Streak, and Liquid Glass.
- Recalculate the native-control position when switching theme families while preserving every theme's existing header geometry and spacing.
- Validate renderer-provided window-button coordinates before applying them through Electron's macOS window API.

## GBlockParty Chromux v0.31.0

Tag: `chromux-v0.31.0`

- Mark the tab context-menu action for Grok Build with a warning triangle and show the full data-security advisory before opening it.
- Require a fresh, explicit dangerous-action acknowledgement before Grok Build can launch from either the new-session modal or a tab context menu.

## GBlockParty Chromux v0.30.5

Tag: `chromux-v0.30.5`

- Add a consistent 6px gap between neighboring session tabs and the add-session button.
- Preserve the add-session button's left alignment when the tab strip is empty.

## GBlockParty Chromux v0.30.4

Tag: `chromux-v0.30.4`

- Give the shared tab context menu a fully opaque, theme-specific surface in all four themes and both brightness modes.
- Render duplicate, cross-agent, and close action labels and details in black for Light mode and white for Dark mode.
- Verify real right-click menus across all eight appearances for opaque backgrounds and WCAG AA text contrast.

## GBlockParty Chromux v0.30.3

Tag: `chromux-v0.30.3`

- Stop Codex tab spinners when a missed notifier is followed by an ANSI-rich composer redraw, including redraws split across terminal chunks.
- Reset completion authority between submitted Codex turns while preserving authenticated event ordering and duplicate rejection across the session.
- Fall back to the legacy completion signal only when Codex notification classification or terminal delivery fails; malformed and unrelated notifications remain ignored.

## GBlockParty Chromux v0.30.2

Tag: `chromux-v0.30.2`

- Add breathing room between the add-session button and the session tab immediately to its left while preserving theme-specific tab spacing.

## GBlockParty Chromux v0.30.1

Tag: `chromux-v0.30.1`

- Keep completed and waiting agent sessions idle when terminal focus reporting, navigation keys, tabs, mouse sequences, or unsubmitted typing emit input.
- Start input-inferred working activity only after a prompt is submitted with Enter, while preserving native Claude and Grok turn-start signals.

## GBlockParty Chromux v0.30.0

Tag: `chromux-v0.30.0`

- Keep the add-session button directly beside the right-most session tab instead of pinning it to the far edge of the window.
- Place the add-session button at the left edge of the tab strip when no sessions are open.

## GBlockParty Chromux v0.29.0

Tag: `chromux-v0.29.0`

- Show an animated spinner in each live session tab while its agent turn is working and a checkmark when the turn completes.
- Keep exited sessions red and all other attention states on the existing lifecycle dot, with activity indicators visible on active and background tabs.
- Add an enabled-by-default, locally persisted “Show tab activity indicators” switch in Settings.
- Respect reduced-motion preferences and expose each tab's activity status through its accessible label and tooltip.

## GBlockParty Chromux v0.28.4

Tag: `chromux-v0.28.4`

- Keep the focused terminal input helper visually transparent so it cannot cover xterm's scrollbar.
- Scope textarea form styling directly to capture notes while preserving normal terminal keyboard, IME, selection, and context-menu behavior.
- Exercise a real focused xterm with scrollback across all four themes in Light and Dark modes.

## GBlockParty Chromux v0.28.3

Tag: `chromux-v0.28.3`

- Keep active terminal-tab labels readable in Streak Dark by preserving the high-contrast active background.
- Align the Streak attention-queue heading with its empty-state card.

## GBlockParty Chromux v0.28.2

Tag: `chromux-v0.28.2`

- Repaint every live terminal viewport immediately after changing the theme or Light/Dark mode so the active prompt, typed input, and cursor use the selected palette.
- Preserve terminal contents, scrollback, input, focus, session state, and PTY/TUI processes while applying the visual update.
- Ignore incomplete, mocked, or disposed terminal sessions safely during theme changes.

## GBlockParty Chromux v0.28.1

Tag: `chromux-v0.28.1`

- Give Streak theme buttons a tactile half-press on hover and a full press while active.
- Apply the interaction consistently to primary, toolbar, queue, session-tab, and theme-card controls while leaving disabled buttons still.
- Respect reduced-motion preferences by keeping the visual states while removing their transitions.

## GBlockParty Chromux v0.28.0

Tag: `chromux-v0.28.0`

- Add independently selectable and persisted Light and Dark modes to Blueprint, Retro-OS, Streak, and Liquid Glass.
- Match the embedded terminal palette and native control color scheme to every theme and brightness combination.
- Make Liquid Glass Light the default appearance for users who have not already selected a theme.
- Expand theme interaction, contrast, persistence, and screenshot coverage from four appearances to all eight combinations.

## GBlockParty Chromux v0.27.1

Tag: `chromux-v0.27.1`

- Execute a queued managed update directly from the attention queue instead of focusing a blocker session.
- Require explicit warning confirmation before executing or dismissing a queued update.
- Accept the first click while the macOS window is inactive so attention actions do not require a second click.

## GBlockParty Chromux v0.27.0

Tag: `chromux-v0.27.0`

- Open terminal URLs and local HTML links in the same session's paired browser with a normal click; no Command or Control modifier is required.
- Restore a shut paired browser automatically when a terminal link is clicked.

## GBlockParty Chromux v0.26.4

Tag: `chromux-v0.26.4`

- Add a consistent left gutter between the Streak terminal stage and attention queue rail.
- Match the Streak Settings header button height to the neighboring status gauges.
- Keep Chromux form styling off xterm's hidden helper textarea so it no longer overlaps the terminal scrollbar.

## GBlockParty Chromux v0.26.3

Tag: `chromux-v0.26.3`

- Use the canonical three-node Chromux logo on the starting screen instead of the unrelated triangle glyph.
- Remove the Agent Cockpit badge from the top header.

## GBlockParty Chromux v0.26.2

Tag: `chromux-v0.26.2`

- Install an available managed update immediately when Chromux has no open sessions and no projected attention items.
- Skip the intermediate `UPDATE READY` queue item, restart confirmation, and empty restore snapshot for that idle-workspace fast path.
- Preserve staged updates, blocker focus, restart protection, restore snapshots, retries, and manual-release handling whenever the workspace is not eligible for immediate installation.

## GBlockParty Chromux v0.26.1

Tag: `chromux-v0.26.1`

- Restore Blueprint filled-control backgrounds so dark on-accent labels no longer render directly over blue surfaces.
- Centralize on-accent foreground colors and improve contrast for Streak selected, badge, and active-session states plus Liquid Glass selected-theme checks.
- Add WCAG AA contrast regression coverage for primary buttons, update/armed controls, queue and shortcut badges, theme selection, and active-session surfaces across all four themes.

## GBlockParty Chromux v0.26.0

Tag: `chromux-v0.26.0`

- Add four complete, clickable Chromux appearance directions—Blueprint, Retro-OS, Streak, and Liquid Glass—while preserving the shared terminal, browser, queue, capture, and settings behavior.
- Add a visual theme picker to Settings with instant switching, a clear selected state, and local persistence across app restarts.
- Match the embedded terminal palette to the selected cockpit theme, add Electron interaction coverage for selection and persistence, and provide a deterministic four-theme screenshot capture command for visual review.

## GBlockParty Chromux v0.25.1

Tag: `chromux-v0.25.1`

- Display a prominent data-security warning whenever Grok Build is selected for a new session, noting that the CLI may transmit codebase files, Git history, and secrets to xAI-controlled infrastructure, with direct links to the reproducible wire-level research, independent reporting, and xAI's current privacy guidance.
- Advise users handling proprietary, regulated, or sensitive code to review xAI's current data controls and consult a cybersecurity or data-security professional before use.
- Document that Chromux launches the separately installed Grok CLI unchanged and cannot verify, restrict, or audit its provider-side transfers.

## GBlockParty Chromux v0.25.0

Tag: `chromux-v0.25.0`

- Present all thirty-six fixed 1440×900 desktop concepts through a shared scale-to-fit viewer that centers the complete design at narrower viewport sizes without document overflow.
- Preserve every clean `/designs/<slug>` route and page title while moving unchanged iframe sources to the internal `/designs/raw/` build directory.
- Route the local desktop gallery through the same allowlisted viewer, retain unchanged mobile gallery routing, and add route, viewport, overflow, focus, modal, and visual regression coverage.

## GBlockParty Chromux v0.24.2

Tag: `chromux-v0.24.2`

- Restore direct-file navigation from `design-prototypes/index.html` to all thirty-six sibling design mockups.
- Preserve clean `/designs/*` production URLs by translating the local links only in the generated website artifact.
- Extend website route regression coverage to verify both direct-file gallery links and deployed clean routes.

## GBlockParty Chromux v0.24.1

Tag: `chromux-v0.24.1`

- Close the mobile-gallery release audit with an explicit ship-ready verdict for the seven static prototypes and document the intentionally non-functional interaction boundary.
- Remove the stale root Electron `main.js`; `prototype/main.js` remains the sole packaged Electron entrypoint.
- Verify the generated mobile gallery and its seven clean production routes, including content, clean-URL behavior, and security headers.

## GBlockParty Chromux v0.24.0

Tag: `chromux-v0.24.0`

- Add twenty new desktop design-refresh prototypes (17–36) to the design gallery: Mission Patch, Cartographer, Darkroom, Bauhaus Console, Library Stacks, Analog Synth, Air-Traffic Control, Executive Glass, Comic Control Room, Field Notebook, Broadcast Studio, Museum Archive, Kinetic Typography, Cybernetic Organism, Medieval Scriptorium, Financial Terminal, Japanese Station System, Thermal Industrial, Soundstage Blueprint, and Chromatic Shadow.
- Each variation is a self-contained static mockup of the full main window rendering the shared `design-prototypes/SPEC.md` app state, so all thirty-six directions remain directly comparable.
- Publish the new batch as clean `/designs/*` routes on the static site and extend the website route regression test to cover all 36 design routes.

## GBlockParty Chromux v0.23.0

Tag: `chromux-v0.23.0`

- Add seven mobile Chromux interaction prototypes (Mission Control, Agent Inbox, Browser Field Kit, Timeline / Black Box, Deck of Agents, Command Lens, Remote Workbench) under `mobile-prototypes/`, exploring the phone as a remote agent command center rather than a miniature desktop IDE.
- Share one fabricated fleet state, layered-context structure (`screen-home` → `screen-session` → `screen-terminal`/`screen-browser` → `screen-evidence` → `sheet-send`), and intervention-safety contract across all seven prototypes via `mobile-prototypes/SPEC.md` so the directions are directly comparable.
- Publish the mobile gallery at `/mobile/` on the static site, link it from the landing page, and extend the website route regression test to verify both the 16 design routes and the 7 mobile routes.

## GBlockParty Chromux v0.22.1

Tag: `chromux-v0.22.1`

- Fix production design-gallery navigation by linking every card to its Vercel clean URL instead of an `.html` path.
- Add a website route regression test that verifies every gallery card maps to a generated HTML file and rejects `.html` links.

## GBlockParty Chromux v0.22.0

Tag: `chromux-v0.22.0`

- Add locally persisted saved projects with validated project directories and `package.json` start scripts.
- Derive an allowlisted npm, pnpm, yarn, or bun start command instead of storing arbitrary shell commands.
- Start a saved project in its own terminal-first session and route detected server URLs into the approval queue without silently opening the paired browser.
- Document `package.json` as the v1 configuration source; `devctl` / `apps.json` remains deferred pending a stable schema.

## GBlockParty Chromux v0.21.0

Tag: `chromux-v0.21.0`

- Add global favorites for paired-browser documents and URLs, with toolbar and review-queue pin controls plus a shared picker that opens into the active session.
- Persist a bounded, validated list atomically in `~/.chromux/favorites.json`, normalize fragments for deduplication, and recover safely from missing or malformed data.
- Restore a shut paired browser when a favorite is opened, and document local storage, privacy, cleanup, and troubleshooting behavior.

## GBlockParty Chromux v0.20.1

Tag: `chromux-v0.20.1`

- Add a structured first-success issue form for the controlled OSS preview, covering environment, agent CLI, preview routing, capture, delivery, recovery, and documentation friction.
- Require reporters to confirm that credentials, private source, sensitive paths, and other private project data have been removed before submission.

## GBlockParty Chromux v0.20.0

Tag: `chromux-v0.20.0`

- Authenticate agent attention events with a per-PTY 256-bit token and correlated v2 OSC envelopes while retaining lower-confidence v1 compatibility.
- Classify native Claude Code, Codex, and Grok Build callbacks into permission, authentication, input, rate-limit, tool-failure, turn-start, and completion states; unknown notifications remain diagnostic-only.
- Add monotonic event validation, authoritative-over-heuristic precedence, distinct attention priorities, stopped-aware update safety, and per-agent capability diagnostics.
- Generate dependency-free hook adapters for Electron's embedded Node runtime, with safe v1 or uninstrumented fallback when installation fails.

## GBlockParty Chromux v0.19.0

Planned tag: `chromux-v0.19.0`

- Add the 16th design-refresh prototype, "Liquid Glass": a bright silver-blue optical-glass cockpit with rounded edge-lit panes, a smoked-glass terminal slab, restrained cyan/violet/green/amber/coral state color, traveling-highlight interactions, and a thicker floating capture sheet.
- Wire the new prototype into the design gallery as Batch 3 with a glass-reflection swatch, and update the gallery README and counts (the website build picks up the new file automatically).

## GBlockParty Chromux v0.18.0

Planned tag: `chromux-v0.18.0`

- Publish the Chromux website as a deterministic static Vercel build with the product landing page at `/` and the complete 15-direction design refresh gallery at `/designs/`.
- Add production security headers and clean URLs while keeping Electron application and repository-internal files outside the deployed artifact.
- Link the public design gallery from the landing-page navigation and product footer.

## GBlockParty Chromux v0.17.0

Planned tag: `chromux-v0.17.0`

- Make the paired browser approval-gated: new sessions start with the browser shut, and detected localhost / loopback / local `.html` previews always enter QUEUE instead of auto-opening an empty pane.
- Open a preview only on explicit approval — queue OPEN, ⌘/Ctrl-click a terminal link, or Enter in the URL bar — and restore a shut browser when a URL is opened.
- Polish Command+Shift+B and COLLAPSE/RESTORE control copy for open/shut semantics, and update README / troubleshooting for the terminal-first workflow.

## GBlockParty Chromux v0.16.0

Planned tag: `chromux-v0.16.0`

- Add Grok Build (`grok`) as a first-class agent alongside Claude Code and Codex: new-session picker, DETECT resume/fresh, shell-tab adoption, and restore snapshots.
- Install Chromux turn-signal hooks into `~/.grok/hooks/chromux-turn-signals.json` (plus `~/.chromux/grok-hook.sh`) so Grok sessions emit the same OSC attention signals as Claude; hooks no-op outside Chromux when `CHROMUX_SESSION_ID` is unset.
- Resume Grok conversations from `~/.grok/sessions/<encoded-cwd>/` via `grok --resume <id>` for DETECT and workspace restore.
- Extend agent-command quoting and shell-adoption smoke coverage for Grok launch/resume and process classification.

## GBlockParty Chromux v0.15.0

Planned tag: `chromux-v0.15.0`

- Introduce a unified Chromux brand mark: three dots in a right-facing chevron — orange (Claude), purple (Codex), green (Gemini) — replacing the previous mismatched marks across surfaces.
- Regenerate the macOS app icon (`build/icon.icns`) from the new mark on a dark tile, and reuse the same mark for the in-app titlebar and the landing page.
- Add the missing landing-page favicon and Apple touch icon derived from the app tile so the browser tab matches the Dock icon.

## GBlockParty Chromux v0.14.5

Planned tag: `chromux-v0.14.5`

- Keep attention-queue session labels aligned with dynamic terminal titles shown in the top session tabs, with the original launch name retained as the shared fallback.
- Refresh visible attention rows when terminal titles change and cover the cross-surface label behavior with a renderer regression test.

## GBlockParty Chromux v0.14.4

Planned tag: `chromux-v0.14.4`

- Suppress bare Shift and ordinary shifted typing in the hotkey diagnostics strip while preserving Shift highlighting and catalog matching for Command+Shift+B.

## GBlockParty Chromux v0.14.3

Planned tag: `chromux-v0.14.3`

- Adopt Claude and Codex sessions launched from a Chromux Shell tab by rewriting simple `claude ...` and `codex ...` submissions into Chromux-instrumented commands while preserving user arguments.
- Leave complex shell syntax, wrappers, redirects, and existing Claude/Codex hook flags untouched, then fall back to read-only process scanning for Chromux-owned PTYs.
- Save adopted shell-started agents as Claude/Codex sessions in restore snapshots so update safety and workspace restore use the corrected session identity.

## GBlockParty Chromux v0.14.2

Planned tag: `chromux-v0.14.2`

- Hide the native scrollbar inside narrow paired-browser toolbars while preserving horizontal scrolling so Queue, Pick Element, Capture, and Collapse remain reachable.

## GBlockParty Chromux v0.14.1

Planned tag: `chromux-v0.14.1`

- Quiet the status-bar hotkey diagnostics during ordinary typing, keeping only the modifier chips visible until Command or Control is held.
- Keep Command shortcut diagnostics fully active, including latest-key and catalog matching, while letting Control wake the display without creating new Control-routed app shortcuts.

## GBlockParty Chromux v0.14.0

Planned tag: `chromux-v0.14.0`

- Update session tab labels from terminal OSC 0/1/2 title sequences emitted by agents and shells while leaving the title control bytes flowing through to xterm.
- Keep launch names as tab fallbacks, retain full title/cwd tooltip context, and sanitize empty/control-heavy titles before display.
- Add overflow-aware tab labels with active-title marquee, inactive hover handoff, and reduced-motion static ellipsis fallback.
- Extend OSC parser coverage and add renderer smoke coverage for title updates, fallback labels, truncation, marquee selection, and hover handoff.

## GBlockParty Chromux v0.13.2

Planned tag: `chromux-v0.13.2`

- Route terminal-focused Chromux shortcuts through an explicit allowlist, preserving terminal/system shortcuts such as copy, paste, and interrupt.
- Deliver Command+T and Command+D through main-process shortcut routing so new-session and detect modals open from terminal and non-editable paired-browser focus.
- Keep real host editables and guest-page editables suppressing Chromux-owned shortcuts while treating xterm's helper textarea as terminal focus.

## GBlockParty Chromux v0.13.1

Planned tag: `chromux-v0.13.1`

- Detect quick exits from Codex restore/resume launches and show a footer warning with the exact `codex resume <id>` command.
- Add a RETRY RESUME action that sends the saved resume command back into the same session terminal, preserving the failed output context.
- Add renderer smoke coverage for resume-retry display, retry input, dismissal, non-resume exits, and exits outside the startup window.

## GBlockParty Chromux v0.13.0

Planned tag: `chromux-v0.13.0`

- Add an always-visible hotkey diagnostics strip to the bottom status bar, showing sanitized shortcut keys, active modifiers, event source, focus context, and shortcut availability.
- Add a renderer-owned shortcut catalog for Command+1..9, Command+J, Command+Shift+B, Command+Q, Command+T, Command+D, and Esc, including contextual disabled reasons for modal, host editable, guest editable, empty queue, and missing-session states.
- Emit sanitized shortcut diagnostic input from host-window and paired-webview `before-input-event` handlers without changing existing shortcut action IPC names or behavior.
- Add hotkey debug renderer and smoke coverage for catalog state, host/webview key source reporting, and guest editable suppression.

## GBlockParty Chromux v0.12.10

Planned tag: `chromux-v0.12.10`

- Deliver app-scoped Command+1..9, Command+J, Command+Shift+B, and guarded quit shortcuts from paired browser webviews as well as the host window.
- Track focused editable elements inside guest pages so session, queue, and browser-toggle shortcuts remain suppressed while preview-page inputs are active.
- Add a webview shortcut smoke test that sends real Command key events into a guest webview and verifies both delivery and editable suppression.

## GBlockParty Chromux v0.12.9

Planned tag: `chromux-v0.12.9`

- Keep UPDATE WAITING dismissal as a non-destructive reminder clear; it returns the queue to idle and never grants permission to stop live sessions.
- Add a Settings-only INSTALL ANYWAY path for managed updates blocked by live sessions, preserving the existing live-session confirmation, restore snapshot, managed installer, and session reopen flow.
- Keep attention rail UPDATE WAITING focused on triage: FOCUS still activates the first blocker, while Settings explains the managed override and only offers it when a managed install source is available.

## GBlockParty Chromux v0.12.8

Planned tag: `chromux-v0.12.8`

- Harden terminal preview parsing so code, diff, search, test fixture, markdown, and release-note examples containing localhost URLs do not open or queue fake previews.
- Preserve real dev-server/prose preview detection for lines such as `Local: http://localhost:5173/` and `ready on http://localhost:3000`.
- Document the future explicit Chromux preview OSC signal path, with MCP planned as an adapter over the same internal preview action.

## GBlockParty Chromux v0.12.7

Planned tag: `chromux-v0.12.7`

- Suppress preview detection from completed user-typed localhost and local `.html` command echoes, including commands assembled across terminal input chunks.
- Add queue source/reason metadata so review queue rows and attention details explain why each preview exists, with legacy restored queue records labeled as restored from a previous session.

## GBlockParty Chromux v0.12.6

Planned tag: `chromux-v0.12.6`

- Fix Command+1..9 session switching when Electron reports top-row number keys through `input.code` as `Digit1` through `Digit9` instead of a plain digit `input.key`.

## GBlockParty Chromux v0.12.5

Planned tag: `chromux-v0.12.5`

- Add Command+Shift+B and a View menu item to toggle the active session's paired browser between collapsed and restored states.
- Keep the browser collapse shortcut guarded while modals or editable fields are focused, matching the existing shell-level shortcut behavior.
- Extend the browser-collapse renderer smoke test to cover the shortcut path in addition to the collapse/restore control.

## GBlockParty Chromux v0.12.4

Planned tag: `chromux-v0.12.4`

- Add a Codex-only renderer fallback that marks an already-working turn completed when Codex reaches a known idle or rate-limit interstitial state, while preserving OSC `turn-end` as the primary signal.
- Reject malformed localhost preview tokens that concatenate nested URLs or include prompt glyph contamination, and preserve delimiters while stripping terminal control sequences so status redraws cannot corrupt preview URLs.
- Suppress localhost previews echoed from typed Codex prompt input once per occurrence, while still allowing the same URL to route when later printed by agent output.

## GBlockParty Chromux v0.12.3

Planned tag: `chromux-v0.12.3`

- Keep completed attention rows display-hidden only while their own session is focused; they now reliably reappear after blur unless explicitly dismissed or superseded by new input.
- Stop queuing malformed terminal preview URLs when Codex output wraps or concatenates localhost URLs; nested `http://` / `https://` starts are split and prompt glyphs terminate the current URL.

## GBlockParty Chromux v0.12.2

Planned tag: `chromux-v0.12.2`

- Move renderer attention and turn-transition rules into a dedicated `renderer/attention.js` domain module, leaving DOM rendering and activation actions in `renderer.js`.
- Normalize deterministic Claude/Codex lifecycle inputs through one turn vocabulary while keeping malformed or wrong-session OSC sequences diagnostic-only.
- Reorder the attention rail as an actionable triage queue: input needed, delivery failures, actionable update states, queued previews, completed turns, then passive update waiting.
- Keep focused-session hiding, dismiss acknowledgements, user-input turn transitions, and update safety derived from canonical turn state instead of rendered queue rows.

## GBlockParty Chromux v0.12.1

Tag: `chromux-v0.12.1`

- Show the running app's actual version in Settings even when update release metadata comes from the one-day cache.
- Recompute cached update availability against the live app version so newer local builds do not display stale update prompts.
- Reopen the exact installed `/Applications/Chromux.app` bundle after managed update installs instead of resolving by bundle name.

## GBlockParty Chromux v0.12.0

Planned tag: `chromux-v0.12.0`

- Change the update action from opening GitHub Releases to a managed install flow that runs the recorded local `npm run install-app` source.
- Save a workspace restore snapshot before managed update installs, quit Chromux, run the installer after the current app exits, and reopen Chromux when installation finishes.
- Keep the GitHub Release URL visible as a reference link, while Settings and update attention now label the primary action as INSTALL UPDATE / RETRY INSTALL.

## GBlockParty Chromux v0.11.1

Planned tag: `chromux-v0.11.1`

- Let queued update attention items be dismissed from WAITING, READY, and FAILED states; dismissal clears the stale reminder back to idle while preserving the available release.
- Allow the update queue to be queued again after dismissal, so cleared or newly opened Codex windows can bring back UPDATE WAITING or UPDATE READY as current session safety changes.

## GBlockParty Chromux v0.11.0

Planned tag: `chromux-v0.11.0`

- Add a per-session paired-browser collapse control: collapsed sessions expand the terminal, keep a narrow restore rail visible, disable divider resizing, and preserve browser URL, queue, webview, and capture state.
- Restore each browser pane to its previous split width and refit the paired terminal after collapse, restore, divider drag, and session activation.
- Make the paired browser header controls horizontally scrollable when the pane is narrow, keeping Queue, Pick Element, and Capture reachable instead of squeezing controls into overlap.
- New test: `test:browser-collapse-renderer` covers collapse/restore state preservation, per-session tab switching, terminal refit, disabled divider behavior, and narrow-toolbar reachability.

## GBlockParty Chromux v0.10.1

Planned tag: `chromux-v0.10.1`

- Preserve a pending (unconsumed, non-empty) restore snapshot when quitting with zero open sessions; an idle Command+Q can no longer destroy a workspace the user hadn't reopened yet. Quits with open sessions still write a fresh `app-close` snapshot.
- Guard Command+J against editable focus, matching Command+1..9: focusing the next queued preview no longer fires while an input, textarea, select, or contenteditable is focused (or while a modal is open).
- Stop pointing agents at broken hook paths when the startup hook install fails: `get-env` now returns `null` for `hooksSettingsPath`/`codexNotifyPath` unless the corresponding file was written successfully, and both main and renderer fall back to launching bare `claude`/`codex`.
- Quote agent launch commands for the shell: hook/notify paths (and resume ids) are POSIX single-quoted, and the codex notify path is additionally TOML-escaped, so a HOME containing spaces, quotes, or backslashes no longer produces an unparseable command.
- New test: `test:agent-command-quoting` builds claude/codex commands under a hostile HOME and verifies them with zsh; `test:shortcuts-renderer` now exercises the guarded shortcut IPC paths with an editable focused.
- Upgrade the prototype runtime/build devDependencies to Electron 43 and `@electron/rebuild` 4.1.0, clearing npm audit findings before packaging and raising the prototype Node prerequisite to 22.12+.
- Add a troubleshooting guide for preview detection, file previews, queued reviews, screenshots, console logs, CLI delivery, wrong-session routing, and local storage cleanup.

## GBlockParty Chromux v0.10.0

Planned tag: `chromux-v0.10.0`

- Replace regex-based agent attention heuristics with deterministic turn signals: Claude Code sessions launch with a Chromux-managed `--settings` hooks file (UserPromptSubmit/Notification/Stop) and Codex sessions with a `notify` override; both emit a Chromux OSC sequence that rides the session's own PTY.
- Add the Chromux OSC v1 wire protocol and a chunk-boundary-safe parser (`renderer/signals.js`); signals whose session id does not match the PTY they arrived on are dropped and recorded as rejected.
- Restructure renderer session state into explicit domains (identity, lifecycle, turn, browser, terminal) with a single `apply()` event seam, a bounded diagnostic event ring, and coalesced rendering.
- Make the attention queue a pure projection: the focused session's items are hidden while focused and reappear on blur; DISMISS acknowledges without deleting state; typing after completion returns the turn to working (stale output can no longer resurrect COMPLETED); exited sessions show only the dead tab dot.
- Derive update-queue safety from turn state (exited/needs-input/completed are safe; working/unknown block) so focusing a session can no longer regress a READY update to WAITING.
- Track captures as first-class records with a delivery index: overlapping deliveries resolve independently, failures attribute to the capture's own target/capturing session (never the focused one), the SENT gauge counts only exit-0 deliveries, records survive modal close, and the browser pane shows a capture chip for its current URL.
- Guard shell-level shortcuts: Command+1..9 switch sessions from the Chromux shell, Command+J reveals and focuses the next queued preview's OPEN button without opening it, and Command+Q now routes through the quit confirmation flow.
- New tests: `test:osc-parser`, `test:turn-signals-renderer` (replaces `test:attention-signals-renderer`), `test:capture-records-renderer`, `test:shortcuts-renderer`; update-queue test rewritten onto turn state.

## GBlockParty Chromux v0.9.0

Planned tag: `chromux-v0.9.0`

- Switch update checks from local source comparisons to GitHub Releases.
- Cache automatic update checks for up to one day while allowing manual checks to bypass the cache.
- Open the GitHub Release URL for newer versions instead of auto-installing binaries.
- Prepare the project for publication as `GeorgeQLe/gblockparty-chromux` under the MIT license.
