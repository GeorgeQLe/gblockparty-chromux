# Claude Instructions

## Versioning And Releases

- After every feature or refactor, bump the Chromux app SemVer before considering the work complete.
- Update the version in the app metadata that drives packaging and update checks, including `prototype/package.json` when the prototype app changes.
- Use the smallest appropriate SemVer bump: patch for fixes and small internal refactors, minor for user-facing features or behavior changes, and major only for breaking changes.
- Update `RELEASES.md` with release notes for the new version.
- Update the planned Git tag and release metadata. The standard tag is `chromux-vX.Y.Z`; the standard release title is `GBlockParty Chromux vX.Y.Z`.
