# Chromux Next v0.5.0 onboarding and settings UAT

## Automated qualification

From `chromux-next/`:

```sh
npm run verify
```

Expected: TypeScript succeeds, 82 tests pass, Electron Forge packages the app,
the baseline packaged smoke passes, and the two-launch runner restoration smoke
passes.

Then run:

```sh
npm run visual:packaged -- /tmp/chromux-next-0.5.0-visual
```

Expected: 13 captures, including onboarding, project Settings, diagnostics,
and standard/narrow views of every interface approach.

## First-run onboarding

1. Launch with a clean `CHROMUX_NEXT_SMOKE_USER_DATA` directory.
2. Confirm onboarding appears only after successor preferences load.
3. Confirm the copy explicitly says legacy Chromux state is not imported or
   modified.
4. Choose a normal repository and a linked Git worktree. Confirm each appears
   with the correct kind.
5. Choose permission, model, and reasoning defaults, enter Chromux Next, quit,
   and relaunch. Confirm onboarding stays complete and defaults persist.

## Projects and new sessions

1. Open Settings with Cmd/Ctrl+`,` and add two folders under Projects.
2. Choose a default, open New Session, and confirm that project and all runner
   defaults are preselected.
3. Change the values, create the session, and confirm its path, permission,
   model, and reasoning metadata match the dialog.
4. Confirm a folder backing an open session cannot be removed. Close the
   session and confirm removal succeeds.

## Groups

1. Create and rename a custom group in Settings.
2. Move a session into it with the workspace group selector.
3. Confirm a non-empty group cannot be deleted.
4. Move or close its sessions, delete it, and confirm project groups and
   sessions remain intact.

## Compatibility and isolation

1. Open Diagnostics and confirm app version, platform, CLI version,
   app-server, authentication, model discovery, and state isolation are shown.
2. Refresh and confirm no token or credential value is displayed.
3. Repeat with an unavailable, old, and signed-out Codex CLI. Confirm the
   failing check is actionable and the Settings UI remains usable.
4. Confirm no legacy Chromux file timestamp or content changes during all UAT.

## Release

Publish `chromux-next-v0.5.0` as prerelease
`GBlockParty Chromux Next v0.5.0`. Confirm it appears in repository releases
without becoming the stable `/releases/latest` entry.
