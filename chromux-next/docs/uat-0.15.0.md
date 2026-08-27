# Chromux Next v0.15.0 UAT

## Scope

Qualify p-style project directory autocomplete in the New Session flow without
changing legacy Chromux or the stable GitHub release channel.

## Candidate gates

- [x] `npm run verify`: TypeScript, 33 files/191 tests, arm64 package, packaged
  baseline/restoration/browser smoke lanes.
- [x] `git diff --check`.
- [x] Isolated packaged-app launch with `P_BASE` pointed at the real project
  tree.
- [x] Typing `chromux` shows the recent `chromux` directory first and a distinct
  `chromux-desktop` p-discovered result.
- [x] Selecting `chromux` fills its canonical absolute directory and closes the
  suggestions without creating a session.
- [x] Signed/notarized/stapled arm64 update ZIP and manifest verification:
  118,681,609 bytes, SHA-256
  `239d061c837f8c5dbbafdc6f8e71ed88fad68318eff97ba51e29a9d7f47acb59`.
- [ ] Public prerelease assets redownloaded and independently reverified.
- [ ] Managed update from installed v0.14.2, followed by rollback/relaunch proof.
- [ ] Legacy `/releases/latest` remains unchanged.

## Failure-oriented coverage

Automated tests cover basename and relative-path ranking, registered/recent/p
priority, `p_history`, Git worktree markers, canonical aliases, inaccessible
roots, literal absolute paths, traversal/result bounds, ignored hidden and
dependency trees, stale renderer responses, exact typed creation, and keyboard
selection. Discovery does not execute a shell or interpolate the query into a
command.

## Rollback

Before publication, revert the candidate. After publication, remove the
`chromux-next-v0.15.0` prerelease and tag and revert its commit. If managed
installation fails, the updater must restore signed v0.14.2 and relaunch the
exact installed path with the intended profile.
