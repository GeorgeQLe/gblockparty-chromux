# Chromux Next v0.11.1 UAT

1. Restore an automatic-title session whose Codex thread already has a useful
   name. Confirm the server name appears without a Luna subprocess. Repeat with
   a directory-equivalent or `-copy` name and confirm the directory fallback
   remains.
2. Create manual-title and previously generated-title sessions, deliver a
   `thread/name/updated` notification, and confirm neither title changes.
3. Complete work in eleven automatic sessions, relaunch, and confirm remaining
   eligible sessions are titled through two serialized Luna subprocesses (ten
   and one). Invalid or missing result items must retain directory titles.
4. Cause an authentication, rate-limit, timeout, or malformed-output failure.
   Confirm the directory fallback remains, Settings shows only a sanitized
   category and next retry, and the same input does not retry for 24 hours.
   Supply a newly meaningful first request and confirm it is immediately
   eligible.
5. Open Settings diagnostics and confirm Automatic titles reports server reuse,
   Luna successes, fallbacks/failures, subprocess count, and token totals when
   Codex reported usage; absent usage must say unavailable.

Run `npm run verify` from `chromux-next/`, then publish
`chromux-next-v0.11.1` as a prerelease titled
`GBlockParty Chromux Next v0.11.1`. Verify the legacy stable release remains
the response from GitHub `/releases/latest`.
