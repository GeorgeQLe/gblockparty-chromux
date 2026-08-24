# Chromux Next 0.14.2 Updater UAT

## Corrective gate

1. Run `npm run verify` and the signed `npm run make:update` release build.
2. Confirm helper coverage proves `/usr/bin/open -n`, exact installed bundle
   targeting, explicit isolated Chromux/Codex profile arguments, and removal of
   `ELECTRON_RUN_AS_NODE` from the LaunchServices process environment.
3. Publish `chromux-next-v0.14.2` as a non-draft prerelease, redownload the ZIP
   and manifest, and independently verify size/SHA-256, GitHub digest, bundle
   ID/version/arm64, Team `NC56VXK48K`, strict codesign, Gatekeeper, and stapler.
4. Using fresh public 0.12.0 and greatest-successor artifacts, repeat the 0.14.1
   matrix for authenticated turn, draft/thread persistence, both confirmation
   cancellations, active-turn and genuine-question blockers, managed
   replacement, marker consumption, backup cleanup, and exact relaunch.
5. From public 0.14.2, run the real 45-second timeout rollback while another
   bundle-ID instance is active. Confirm trusted prior-bundle restoration, an
   exact distinct-process relaunch with isolated profiles, marker creation, and
   no adjacent backup.
6. Confirm legacy GitHub `/releases/latest` remains unchanged.
