# Chromux Next v0.3.0 five-approach UAT

## Automated and packaged verification

```sh
cd chromux-next
npm run typecheck
npm test
npm audit --omit=dev
npm run package
npm run smoke:packaged
npm run visual:packaged -- /tmp/chromux-next-visual-0.3.0
```

Inspect all ten standard/narrow PNGs for contrast, clipping, composer access,
attention/blocker visibility, long-label handling, and Chromux mark loading.

## Shared workflow parity

Repeat this section in Control Room, IDE Workbench, Focus Studio, Mission
Board, and Spatial Canvas:

1. Create two sessions in one project group and one custom group. Select,
   move, and close sessions; confirm active-close warns.
2. Send an idle prompt, steer an active turn, stop it, and inspect/copy/search
   the transcript. Open an explicit HTTP(S) link and each Runner, Alignment,
   Deck, Canvas, and Browser surface.
3. Keep distinct multiline drafts in both sessions. Answer an approval and a
   structured question. Focus, snooze, and dismiss eligible attention items;
   confirm blockers remain non-dismissible.
4. Navigate every session in Mission Board with its semantic list and every
   Spatial Canvas node with its semantic tree. Confirm Focus Studio exposes a
   visible blocker banner and keyboard session selector.

## Live switching and restoration

1. During an active turn with a scrolled transcript and unsaved draft, open
   Settings with Cmd/Ctrl+`,` and cycle through all five approaches.
2. Confirm the exact thread/turn, selected group/session, active surface,
   interaction ownership, draft text, and viewport survive. Confirm switching
   creates no Codex or Luna call.
3. Exercise Tab/Shift+Tab containment, Escape, compact density, and reduced
   motion. Reset and confirm Control Room/comfortable/system.
4. Select Spatial Canvas, restart twice, and confirm the global approach and
   both resumed thread IDs return without starting turns.

## Release isolation

Publish `chromux-next-v0.3.0` as a prerelease titled
`GBlockParty Chromux Next v0.3.0`. Confirm legacy Chromux remains the release
returned by GitHub `/releases/latest`.
