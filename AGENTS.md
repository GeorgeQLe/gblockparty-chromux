# Agent Instructions

## Versioning And Releases

- After every feature or refactor, bump the Chromux app SemVer before considering the work complete.
- Update the version in the app metadata that drives packaging and update checks, including `prototype/package.json` when the prototype app changes.
- Use the smallest appropriate SemVer bump: patch for fixes and small internal refactors, minor for user-facing features or behavior changes, and major only for breaking changes.
- Update `RELEASES.md` with release notes for the new version.
- Create and push the actual Git tag, then publish or update the matching GitHub Release before considering the work shipped.
- Chromux update checks depend on GitHub Releases `/releases/latest`; shipping is incomplete until the newest release is visible there.
- The standard tag is `chromux-vX.Y.Z`; the standard release title is `GBlockParty Chromux vX.Y.Z`.

### Chromux Next Experimental Exception

- While `chromux-next/` is pre-cutover and versioned `0.x.y`, use the tag
  `chromux-next-vX.Y.Z` and title `GBlockParty Chromux Next vX.Y.Z`.
- Publish every Chromux Next `0.x.y` release as a GitHub prerelease. It must
  not replace the legacy Chromux release returned by `/releases/latest`.
- Chromux Next has independent SemVer metadata in
  `chromux-next/package.json`. Do not bump `prototype/package.json` when only
  the successor changes.
- After the documented cutover gates pass, the successor may take over the
  stable `chromux-vX.Y.Z` line.
