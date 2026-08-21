# Lessons

## 2026-08-21 — Resolve the active Chromux product before editing

- This repository contains both current Chromux Next in `chromux-next/` and
  maintenance-only legacy Chromux in `prototype/`.
- Default new product, integration, test, packaging, and release work to
  `chromux-next/`. Touch `prototype/` only when the user explicitly requests
  legacy maintenance.
- Do not infer the implementation target from `/releases/latest`; that stable
  channel remains legacy only until the documented successor cutover gates
  pass.
- Correction enforcement: root `AGENTS.md`, `CLAUDE.md`, and `README.md` now
  state the target rule before any legacy release details or quickstart.

## 2026-08-19 — Renderer-local numeric state must honor downstream contracts

- The `Continue · omega-war` black screen was non-destructive: copied history
  and Chromux-owned thread state remained stored, but a fractional xterm
  `viewportY` entered the renderer cache and later violated `scrollToLine`'s
  integer requirement during transcript restoration.
- Treat measurements returned by layout/rendering libraries as untrusted at
  the next API boundary. Normalize both when caching and when consuming them;
  floor finite scroll positions to preserve the earliest visible line, clamp
  negatives to zero, and discard non-finite values to a safe semantic fallback.
- A top-level renderer should fail visibly and recoverably. Keep complete error
  context in developer diagnostics, but give the user a concise message and a
  reload action that does not delete persisted state or broaden lifecycle
  authority.
- Correction enforcement: `tests/runner-terminal.component.test.tsx` covers
  fractional, negative, `NaN`, and infinite positions across switches and
  event updates; `tests/renderer-recovery.component.test.tsx` covers render and
  effect failures plus renderer reload; packaged visual qualification captures
  the recovery screen at standard and narrow sizes.

## 2026-08-16 — Minimized lifecycle responses still need display hydration

- Excluding turns from fork and resume responses protects the protocol frame,
  but it also removes the transcript payload that a client may have been using
  implicitly for display.
- Pair minimized lifecycle responses with a bounded, cursor-safe history read
  from the newly owned thread. Persist hydration state so partial failures can
  repair in place without repeating ownership-changing lifecycle calls.
- Correction enforcement: `tests/runner-manager.test.ts` requires fork-only
  Continue, excluded-turn restore, paginated summary hydration, chronological
  deduplication, a 1,000-event cap, and retry without refork;
  `tests/runner-protocol.integration.test.ts` keeps lifecycle and page frames
  bounded; the transcript component test proves notices and failures remain
  visible.

## 2026-08-16 — Fork qualification must model full-history response size

- Do not treat a small synthetic `thread/fork` response as sufficient proof for
  continuing a real, long-running Codex thread; the app-server normally returns
  populated `thread.turns`, which can exceed a bounded JSONL frame even though
  only the new thread ID is needed.
- Request `excludeTurns: true` for detected continuations and keep the protocol
  line cap intact. Apply this whenever a lifecycle response can return history
  that the client does not consume.
- Correction enforcement: the subprocess fixture can emit an oversized fork
  history, `tests/runner-protocol.integration.test.ts` proves exclusion stays
  below the frame limit, and `tests/runner-manager.test.ts` requires every
  detected continuation to send `excludeTurns: true`.

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
