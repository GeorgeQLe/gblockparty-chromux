# Lessons

## 2026-07-21 — Floating previews need opaque material layers

- Theme-level alpha tokens can make a floating preview's header, footer, or terminal backing visually bleed into the workspace even when the outer shell looks substantial.
- Give floating terminal previews explicit opaque colors for every material layer in all theme/mode combinations; preserve theme identity through borders, gradients, shadows, bevels, and sheen instead of transparency.
- Correction enforcement: `prototype/scripts/test-session-rail-renderer.js` checks computed popover, header/footer, and terminal-backing colors for full opacity across all eight appearances.

## 2026-07-21 — Scaled terminal previews need one shared inset

- A scaled xterm can look uneven even with nominal CSS padding when its scale factor is calculated from the outer viewport instead of the inset host box.
- Align header, terminal, and footer content to one horizontal inset, and compute terminal scaling from the host's inner dimensions so right and bottom clearance remain real rather than clipped.
- Correction enforcement: `prototype/scripts/test-session-rail-renderer.js` compares rendered header/terminal/footer left edges and requires at least 9px of terminal clearance on every remaining edge across all eight appearances.

## 2026-07-16 — Terminal presentation tests need real focused xterm DOM

- A synthetic `.xterm-helper-textarea` cannot prove that xterm's generated input layer remains invisible or that its scrollbar stays usable under real focus and scrollback.
- For terminal presentation regressions, mount `Terminal` with the production addon/CSS, write enough rows to create scrollback, focus the generated helper, and verify both computed presentation and terminal geometry before and after input.
- Correction enforcement: `prototype/scripts/test-themes-renderer.js` now exercises a real `Terminal` and `FitAddon` across all eight appearances, requires a positive scrollbar gutter, and separately proves capture notes retain normal form styling.

## 2026-07-15 — Update attention should resolve the update decision

- Avoid routing a queued update's primary action to a blocker session when the user is deciding what to do with the update; focusing an already active blocker is visibly inert.
- Prefer a direct `EXECUTE` action for managed updates and require explicit warning confirmation for both execution and dismissal.
- Apply this pattern whenever a global attention item represents a pending destructive or state-changing operation rather than a session-navigation task.
- Correction enforcement: `prototype/scripts/test-update-queue-renderer.js` now requires managed queued updates to expose `EXECUTE`, verifies cancel/confirm behavior for execution and dismissal, and requires unavailable managed installs to fall back to `DETAILS`.

## 2026-07-13 — Risk warnings need inspectable evidence

- When a product warning is grounded in a recent security controversy, include user-visible links to the primary research, reproducible evidence, independent reporting, and the provider's current policy—not only an uncited summary.
- Keep the warning scoped to what the evidence demonstrates. For the Grok Build finding, distinguish transmission and storage observed in version 0.2.93 from unproven training use and from behavior that may change in later versions.
- Correction enforcement: `prototype/scripts/test-grok-warning-renderer.js` requires the Grok warning to expose the research, reproduction, independent-reporting, and provider-policy resources.
