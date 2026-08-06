# Chromux Next v0.4.0 structured Alignment UAT

## Automated qualification

From `chromux-next/`:

```sh
npm run typecheck
npm test
npm run package
npm run smoke:packaged
npm run visual:packaged -- /tmp/chromux-next-visual-0.4.0
```

The visual harness opens Alignment and captures all five approaches at
1440×900 and 820×720. Confirm the toolbar, outline, item editor, and contributor
panel remain usable with no horizontal viewport clipping.

## Desktop document workflow

1. Start with the unsaved sample. Trigger an edit, cancel Save As, and confirm
   revision 0 and the original value remain. Repeat, select a JSON path, and
   confirm exactly one mutation and revision increment.
2. Open, save, Save As, quit, and reopen a canonical document. Confirm the
   path, revision, status, item selection, and saved content.
3. Insert and edit each kind: heading, text, bullet/numbered list, table,
   media, code, decision, question, and string/number metric. Reorder and
   remove items; confirm IDs stay stable and Deck/Canvas update from the live
   document.
4. Set changes-requested and approved reviews with feedback. Confirm reviewer
   and timestamp appear. Return to unreviewed and confirm both clear.
5. Change document status and perform multiple Undo actions. Confirm each edit
   and Undo advances exactly one revision and reopening shows the final state.
6. Modify the JSON externally after opening it, then attempt an edit. Confirm
   rejection, latest valid disk state reload, and the Undo stack clears.

## Contributor and continuity workflow

1. Run the fake contributor with and without a selected item. Confirm bounded
   progress, response, and proposal UI. Reject one proposal and Apply another.
2. Produce a proposal, make a human edit, and confirm the stale proposal
   remains inspectable while Apply is disabled and rerun guidance is visible.
3. Cancel a fake run and exercise a deterministic failure. Optionally run the
   live Codex adapter and confirm it is ephemeral, read-only, separate from
   runner threads, and returns only schema-valid proposals.
4. Click an HTTP(S) response link and confirm explicit browser navigation.
5. In a live runner session, retain a draft, scroll the transcript, and leave a
   pending interaction open. Repeatedly switch all surfaces and all five
   approaches; confirm the same terminal, draft, viewport, interaction, and
   runner turn remain mounted and unchanged.

## Release channel

Publish `chromux-next-v0.4.0` as prerelease
`GBlockParty Chromux Next v0.4.0`. Confirm it is visible in the repository
release list and that legacy `/releases/latest` still resolves to the existing
stable `chromux-vX.Y.Z` release.
