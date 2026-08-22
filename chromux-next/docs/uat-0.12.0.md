# Chromux Next 0.12.0 UAT

## Automated baseline

1. Run `npm run typecheck`, `npm test`, package, and all packaged smokes.
2. Cover SemVer/API/Atom discovery, manifests, caching, slice recovery, strict
   IPC, and every runner maintenance state with deterministic tests.
3. Inspect Updates at standard and narrow sizes, including keyboard focus and
   available, failed, downloading, staged, and blocked states.

## Signed release gate

1. Configure the existing Developer ID and notarization credentials. Prefer a
   `notarytool` Keychain profile and set `CHROMUX_NEXT_NOTARY_PROFILE` to its
   name; `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` remain
   available for noninteractive CI. Run `npm run make:update`.
2. Confirm strict codesign, Team `NC56VXK48K`, Gatekeeper assessment, and
   stapler validation pass.
3. Use two updater-enabled signed fixtures. Prove active-turn and unanswered-
   interaction blocking, explicit confirmation, relaunch, restored threads and
   drafts, startup-marker success, rollback injection, and backup cleanup.
4. Create draft prerelease `chromux-next-v0.12.0`, upload the exact ZIP and
   manifest, download and reverify them, then publish.
5. Confirm public assets work and `/releases/latest` remains the legacy stable
   `chromux-v0.81.0` or a later legacy successor.

Run a live authenticated Codex check. Perform a live update only when a newer
version exists; otherwise retain deterministic fixture proof without downgrade.
