# Chromux Next 0.14.1 Updater UAT

## Automated gate

1. Run `npm run verify`.
2. Run the focused updater/helper suite and confirm restart invalidation turns a
   persisted staged `0.14.1` package back into a retryable available update,
   preparing the same successor removes the stale nested app tree, and a fresh
   verified package reaches staged state.
3. Confirm filesystem error codes are sanitized and retryable, extraction has
   its own bounded category, and neither state includes fixture paths or raw
   subprocess output.
4. Confirm both successful replacement and timeout rollback invoke
   `/usr/bin/open -n` with the exact installed bundle path and preserve only the
   explicit isolated Chromux/Codex profile variables.

## Signed release and managed-update gate

1. Sign, notarize, staple, and build the arm64 ZIP/manifest with
   `npm run make:update`; independently verify the packaged and extracted apps.
2. Publish `chromux-next-v0.14.1` as a GitHub prerelease titled
   `GBlockParty Chromux Next v0.14.1`, redownload both assets, and reverify
   manifest size/SHA-256, GitHub digest, bundle ID/version/architecture, Team
   `NC56VXK48K`, strict codesign, Gatekeeper, and stapler acceptance.
3. In a fresh unique directory, launch the public signed `0.12.0` bootstrap with
   isolated Chromux and Codex profiles. Complete an authenticated turn and keep
   a draft, exercise active-turn and genuine unanswered-question blockers plus
   both confirmation cancellations, and stage the greatest public successor.
4. Complete managed replacement to public `0.14.1`. Confirm the exact isolated
   bundle relaunches with the same session, thread, draft, and profile; the
   startup marker is consumed and the adjacent backup is removed.
5. From public `0.14.1`, run the real 45-second timeout rollback while another
   bundle-ID instance is active. Confirm the signed prior bundle is restored,
   the exact rollback copy opens as a distinct process with the isolated
   profiles, its startup marker appears, and no backup remains.
6. Confirm both releases remain non-draft prereleases and legacy GitHub
   `/releases/latest` is unchanged. Record the fresh evidence directory and
   complete result matrix before closing the v0.12.0 gate.
