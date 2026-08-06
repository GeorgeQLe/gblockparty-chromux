# Chromux Next v0.4.1 runner hardening UAT

## Automated release gate

From `chromux-next/`:

```sh
npm run typecheck
npm test
npm run package
npm run smoke:packaged
npm run smoke:runner-restoration
```

The restoration smoke launches the packaged Electron application twice with
one isolated user-data directory and a deterministic fixture CLI. The first
launch creates two distinct threads and drafts. The second resumes both thread
IDs, preserves group membership and selection, starts no turn, and proves both
fixture app-server processes exit.

## Manual compatibility check

1. Launch with Codex CLI 0.146.0 or newer and create two sessions in one
   project group.
2. Enter a different unsent draft in each session, select the first, and quit.
3. Relaunch. Confirm both original conversations resume, both drafts remain,
   and the original selection is active without a new user/agent turn.
4. Trigger command, network, file-change, and structured-question approvals.
   Confirm only offered decisions are enabled and the response affects only
   the owning thread.
5. Interrupt the app-server during an idle session. Confirm sessions show the
   failure and independently return to idle after bounded recovery.

## Release channel

Publish `chromux-next-v0.4.1` as prerelease
`GBlockParty Chromux Next v0.4.1`. Confirm it is visible in repository
prereleases and does not replace the legacy release returned by
`/releases/latest`.
