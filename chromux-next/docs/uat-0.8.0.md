# Chromux Next v0.8.0 session browser and evidence UAT

## Automated gate

From `chromux-next/`, run `npm run verify`. Then run:

```sh
npm run visual:packaged -- /tmp/chromux-next-0.8.0-visual
```

The visual command must report 28 captures. Inspect the standard and narrow
session-browser views for reachable controls, a usable evidence rail, and no
guest overlap with the rail or application chrome.

## Session isolation and restoration

1. Open two sessions and navigate their Browser surfaces to different HTTP(S)
   pages. Switch repeatedly between sessions and surfaces.
2. Confirm each session retains its own page and browsing state. Open Settings
   and New Session over Browser and confirm the native guest is fully hidden.
3. Quit and reopen. Confirm each session restores its last safe location only
   when Browser becomes visible.
4. Try `file:`, `javascript:`, and a custom scheme in the URL bar. Confirm each
   is rejected without changing the current page. Confirm popups do not create
   an unmanaged window.

## Reviewed evidence

1. On a loaded page, enter a capture note and choose Capture for review.
   Confirm a local preview appears with Awaiting Review status.
2. Reject it. Confirm it remains inspectable and Send to session is unavailable.
3. Capture again, approve it, then choose Send to session. Confirm the exact
   originating session receives a turn containing the URL, title, note, and
   private screenshot path, and the record becomes Delivered.
4. Attempt another send and confirm it is unavailable. For retry coverage,
   stop the fixture runner after approval, attempt delivery, restore the runner,
   and confirm the record remains Approved and succeeds on retry.

## Release gate

Publish tag `chromux-next-v0.8.0` with title
`GBlockParty Chromux Next v0.8.0` as a GitHub prerelease. Confirm the legacy
stable Chromux release remains the repository's `/releases/latest` result.
