# Chromux Next 0.10.4 Large-History Fork UAT

## Automated qualification

1. From `chromux-next/`, run `npm run typecheck`, `npm test`, `npm run package`,
   and the three packaged smoke commands.
2. Confirm the subprocess large-history case passes with its test-only frame
   limit smaller than the simulated returned history.
3. Run packaged visual qualification and inspect standard and narrow DETECT
   results/configuration views.

## Corrected active-writer gate

1. Keep the same real external Codex source process active. Open DETECT and
   click **Continue** for it.
2. Leave configuration open for more than two minutes, then click
   **Create continuation**.
3. Confirm creation succeeds without `JSONL partial line exceeded limit`, a
   distinct Chromux-owned thread opens, and the external source remains active
   and untouched.
4. Inspect the fixture or diagnostic request log and confirm the fork includes
   `excludeTurns: true`, omits `lastTurnId`, and does not issue `thread/start`,
   `thread/resume`, `turn/steer`, or `turn/interrupt` against the source.
5. Restart Chromux Next and confirm the created Chromux-owned continuation
   restores normally through `thread/resume`.

## Release gate

Publish `chromux-next-v0.10.4` as a prerelease titled
`GBlockParty Chromux Next v0.10.4`. Confirm the legacy stable release returned
by `/releases/latest` is unchanged.
