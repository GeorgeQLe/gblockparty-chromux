# Chromux Next v0.1.0 UAT

Automated verification:

```sh
cd chromux-next
npm run verify
```

Manual desktop qualification:

1. Start legacy Chromux and note its existing projects and sessions.
2. Run `npm start` here and confirm the title is GBlockParty Chromux Next.
3. Edit the demo text, save it to a new `.json`, quit, restart, and reopen it.
4. Approve an item, confirm the revision advances, then use Undo and confirm
   the content returns while the revision advances again.
5. Run the deterministic fake provider. Inspect its streamed events and
   proposal. Reject once; rerun and apply once.
6. Put an HTTPS or localhost HTTP link in a text item. Confirm it does not open
   automatically, opens in-app after a click, and back/forward/reload/copy/
   external/close controls work.
7. Attempt a `file:` or `javascript:` link and confirm no actionable link is
   produced.
8. If Codex CLI qualification is intended, select Codex and an existing
   workspace. Confirm the run is non-interactive, proposals remain unapplied,
   and cancellation returns the UI to idle.
9. Quit both apps. Confirm the legacy Chromux projects, queue, tabs, settings,
   and user data are unchanged.

Live Codex qualification is explicit UAT and is not part of CI, so automated
tests never consume credentials or model usage.
