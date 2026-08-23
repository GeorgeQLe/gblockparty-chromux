# Chromux Next 0.14.0 UAT

## Automated gate

1. Run `npm run verify` and `npm run visual:packaged -- /tmp/chromux-next-visual-0.14.0`.
2. Confirm transcript classification covers prose, lists, links, fenced and
   indented code, tables, ANSI, box drawing, ASCII displays, graphic syntax,
   malformed Markdown, raw HTML, long tokens, and bounded input.
3. Inspect `runner-transcript-standard.png` and
   `runner-transcript-narrow.png` for role alignment, wrapped-line indentation,
   full-width rich blocks, activity density, clipping, focus, and contrast.
4. Confirm search reveals collapsed activity, selection copy remains local,
   streaming completion replaces one bubble in place, session switching
   restores DOM scroll, and old-content readers are not pulled to the bottom.

## Signed release gate

1. Set `CHROMUX_NEXT_SIGN_IDENTITY` to the existing Developer ID identity and
   `CHROMUX_NEXT_NOTARY_PROFILE` to the Keychain profile, then run
   `npm run make:update`.
2. Re-run strict codesign, Team `NC56VXK48K`, Gatekeeper, and stapler checks on
   the app and independently extracted ZIP.
3. Create `chromux-next-v0.14.0` as a prerelease titled
   `GBlockParty Chromux Next v0.14.0`, upload the verified ZIP and manifest,
   download them again, and independently reverify checksums and app trust.
4. Confirm the public release is a prerelease and legacy `/releases/latest`
   remains unchanged.
