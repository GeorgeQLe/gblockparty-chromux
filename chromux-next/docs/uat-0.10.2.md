# Chromux Next 0.10.2 DETECT Startup UAT

## Automated qualification

1. Run `npm run typecheck` and `npm test`.
2. Run `npm run package`, `npm run smoke:packaged`,
   `npm run smoke:runner-restoration`, and `npm run smoke:browser-evidence`.
3. Run `npm run visual:packaged -- /tmp/chromux-next-0.10.2-visual` and inspect
   the standard and narrow Find Your Work and continuation-configuration views.

## Manual cold-launch gate

1. Quit Chromux Next while leaving an external Codex process active.
2. Cold-launch the packaged Situation Room and wait for Find Your Work.
3. Select **Start Fresh** for the detected process. Confirm a model is selected
   and **Start fresh** is enabled, then return without creating the session.
4. Select **Continue** for the same process. Confirm a model is selected and
   **Create continuation** is enabled.
5. Explicitly click **Create continuation** and complete the v0.10.1
   active-writer checks. Confirm the source process remains active and Chromux
   opens a distinct fork.

## Release-channel gate

Publish `chromux-next-v0.10.2` as a prerelease titled
`GBlockParty Chromux Next v0.10.2`. Confirm it does not replace the legacy
Chromux release returned by GitHub `/releases/latest`.
