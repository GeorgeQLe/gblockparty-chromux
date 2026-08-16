# Chromux Next 0.10.1 Active-Writer Continuation UAT

## Automated qualification

1. Run `npm run typecheck` and `npm test`.
2. Run `npm run package`, `npm run smoke:packaged`,
   `npm run smoke:runner-restoration`, and `npm run smoke:browser-evidence`.
3. Run
   `npm run visual:packaged -- /tmp/chromux-next-0.10.1-visual` and inspect the
   standard and narrow Find Your Work and continuation-configuration captures.
4. Confirm the 0.146.0 compatibility fixture includes `thread/fork` and the
   packaged restoration smoke still sends `thread/resume` for both persisted
   Chromux-owned threads without starting or steering a turn.

## Manual active-writer gate

1. Start a Codex turn in an external terminal and leave that source process and
   turn active.
2. Launch Chromux Next and wait for Find Your Work to show the matching Codex
   row. Do not automate or preselect this step against the live thread.
3. Explicitly click **Continue**, review the copy, select the intended model and
   permission preset, then click **Create continuation**.
4. Confirm Chromux opens a distinct thread whose safely stored history matches
   the source through the last safe point. The in-progress partial turn is not
   shared; an interruption marker may represent it.
5. Confirm the original terminal process and active source thread remain
   untouched and usable. Continue each independently and confirm they can
   diverge without writer contention.
6. Repeat Continue from the same external source if desired and confirm each
   explicit click creates another independent continuation.
7. Force fork rejection and a response without `thread.id`. Confirm the modal
   remains available for retry and no project, group, or session is added.
8. Exercise **Start Fresh** and **Focus Existing** and confirm their prior
   behavior is unchanged.
9. Restart Chromux Next and confirm the created continuation restores through
   `thread/resume`, retains its own thread ID, and does not resume the external
   source ID.

## Release-channel gate

Publish `chromux-next-v0.10.1` as a prerelease titled
`GBlockParty Chromux Next v0.10.1`. Confirm the prerelease is visible while the
legacy stable tag returned by GitHub `/releases/latest` remains unchanged.
