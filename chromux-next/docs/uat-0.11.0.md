# Chromux Next v0.11.0 UAT

1. Open New Session, choose a project, leave Session title blank, and create
   the session. Confirm its tab and session-tree row immediately show the
   project directory basename.
2. Send a concrete work request and let the first turn finish. Confirm the tab
   changes once to a compact work summary and remains stable after relaunch.
3. Create another session with an explicit title. Complete a turn and relaunch;
   confirm the explicit title is unchanged.
4. Repeat the blank-title path from DETECT for both Start Fresh and Continue.
   Confirm the directory fallback appears without waiting for restoration and
   a continued session can summarize its hydrated work.
5. With Luna unavailable, repeat a blank-title session and confirm creation,
   use, restoration, and shutdown still succeed with the directory title.

Run `npm run verify` from `chromux-next/`, then publish
`chromux-next-v0.11.0` as a prerelease titled
`GBlockParty Chromux Next v0.11.0`. Verify the legacy stable release remains
the response from GitHub `/releases/latest`.
