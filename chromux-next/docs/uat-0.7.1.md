# Chromux Next v0.7.1 modular baseline UAT

## Automated release gate

From `chromux-next/`:

```sh
npm run verify
```

The gate must pass typecheck, all Vitest suites, packaging, packaged launch,
and the two-launch/two-session restoration smoke. Also run from the repository
root:

```sh
git diff --check
```

## Upgrade and recovery checks

1. Launch v0.7.0, create two sessions, save distinct drafts, choose a non-default
   presentation, and quit normally.
2. Launch v0.7.1 with the same successor profile. Confirm both exact threads,
   drafts, selection, presentation, and workspace defaults restore without a
   new turn.
3. Confirm the profile now contains independent `runner-state-v1.json`,
   `ui-preferences-v1.json`, and `workspace-preferences-v1.json` files and that
   `state-v1.json` was not changed or removed.
4. With the app closed, replace only `ui-preferences-v1.json` with malformed
   JSON. Relaunch and confirm the default presentation recovers while the two
   sessions, drafts, and workspace projects remain present.
5. Repeat with only `runner-state-v1.json` malformed. Confirm settings and
   onboarding remain present and the invalid runner slice does not crash the
   app.

## Browser and presentation regression

1. Click an HTTP(S) link in a transcript and confirm it opens only after the
   click. Verify back, forward, reload, copy link, external open, and close.
2. Confirm popup requests and non-HTTP(S) navigation remain denied.
3. Switch among all five presentations and every surface. Confirm terminal
   viewport, draft text, Alignment selection, and contributor state remain.

## Release

Publish `chromux-next-v0.7.1` as a prerelease titled
`GBlockParty Chromux Next v0.7.1`. Confirm the stable legacy Chromux release
remains the response from `/releases/latest`.
