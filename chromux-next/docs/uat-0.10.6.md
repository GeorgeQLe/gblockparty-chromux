# Chromux Next 0.10.6 Blank-Renderer Recovery UAT

## Automated qualification

1. From `chromux-next/`, run `npm run verify` from a clean dependency install.
2. Confirm component coverage feeds fractional, negative, `NaN`, and positive
   and negative infinite viewport values through session switches and event
   updates. `scrollToLine` must receive only non-negative integers; discarded
   values must call `scrollToBottom` without losing transcript output.
3. Confirm render-time and effect-time failures show the recovery screen, log
   the complete error, and invoke a renderer reload from `Reload Chromux Next`.
4. Run `npm run visual:packaged -- /tmp/chromux-next-0.10.6-visual` and inspect
   the normal product plus `renderer-recovery-standard.png` and
   `renderer-recovery-narrow.png` for clipping, legibility, and action access.

## Existing-session recovery gate

1. Leave the external `omega-war` Codex process untouched. Launch the packaged
   0.10.6 candidate against the existing Chromux Next user-data directory.
2. Open `Continue · omega-war` and confirm its hydrated transcript renders.
   Switch away and back, then allow a normal event update; the renderer must
   stay visible and preserve the earliest valid visible line.
3. Confirm the owned session restores using its existing thread ID. Inspect
   available fixture or diagnostic evidence for no new `thread/fork`,
   `turn/start`, `turn/steer`, or source-thread mutation during recovery.
4. If the recovery screen is exercised manually, choose `Reload Chromux Next`
   and confirm only the renderer reloads and the same persisted session returns.

## Release gate

Publish `chromux-next-v0.10.6` as a prerelease titled
`GBlockParty Chromux Next v0.10.6`. Confirm the legacy stable release returned
by `/releases/latest` is unchanged.
