# Chromux v0.73.0 signed Windows installer UAT

Status: **PENDING PROTECTED WORKFLOW AND REAL-MACHINE PASS**

The release workflow must build and sign one candidate, publish its five exact
files as an immutable Actions artifact, and run this candidate unchanged on:

- Windows 10 Pro 22H2 build 19045 x64 with current WSL2;
- current Windows 11 x64 with current WSL2.

`chromux-v0.73.0` must not be published until both jobs pass and a reviewer
approves the protected `windows-release` environment.

## Candidate identity

- Commit:
- Workflow run / attempt:
- Artifact ID:
- Artifact name:
- Setup SHA-256:
- Full `.nupkg` SHA-256:
- `RELEASES` SHA-256:
- Artifact Signing publisher:
- Tester / approval time:

## Automated pre-UAT gates

- [ ] `prototype/package.json`, tag, title, filenames, and workflow inputs all
  resolve to `0.73.0` / `chromux-v0.73.0`.
- [ ] Complete Windows-focused test suite passes on `windows-2022`.
- [ ] Packager and Squirrel use `@electron/windows-sign` with Artifact
  Signing's x64 DLib, SHA-256 file/timestamp digests, and
  `http://timestamp.acs.microsoft.com`.
- [ ] The unpacked app and nested full package contain signed, trusted,
  correctly timestamped `.exe`, `.dll`, and `.node` files from the configured
  publisher, including the app and `conpty.node`.
- [ ] The real installed tree contains only trusted executable payloads from
  that exact publisher, including Squirrel `Update.exe`; this installed-tree
  check covers the updater/uninstaller that Setup materializes outside the
  `.nupkg`.
- [ ] The final Setup executable has the same valid publisher and timestamp.
- [ ] The immutable candidate contains nonempty Setup, full `.nupkg`,
  `RELEASES`, `SHA256SUMS`, and `build-metadata.json`.

## Windows 10 Pro 22H2 build 19045 x64

- [ ] Exact OS build and x64 architecture verified.
- [ ] Current WSL2, Bash, Git, and Node 22.12+ verified.
- [ ] Prior signed installer installs silently without elevation.
- [ ] Prior app launches with packaged smoke.
- [ ] Exact signed candidate upgrades the prior per-user installation.
- [ ] Candidate launches and reports the expected product version.
- [ ] Squirrel uninstall succeeds.
- [ ] `%APPDATA%\chromux` and `%USERPROFILE%\.chromux` sentinels survive upgrade
  and uninstall.
- [ ] Manual first-run wizard check: clean profile, WSL1 rejection, distro
  switch, optional-agent state, root creation confirmation/failure/recovery,
  keyboard traversal/focus containment, Settings re-entry, and no-model
  self-test.
- [ ] Manual restore check: blocked required runtime leaves the snapshot
  unconsumed; refresh after recovery resumes it.

## Windows 11 x64 smoke

- [ ] Windows 11 build and x64 architecture verified.
- [ ] Current WSL2, Bash, Git, and Node 22.12+ verified.
- [ ] Clean candidate installs per-user, launches, uninstalls, and retains both
  data sentinels.

## Draft and publication gate

- [ ] Draft title is `GBlockParty Chromux v0.73.0`.
- [ ] All five assets are uploaded, re-downloaded, nonempty, and hash-identical
  to the candidate.
- [ ] Re-downloaded Setup and nested full-package signatures pass trust,
  publisher, and timestamp verification.
- [ ] Draft GitHub API metadata parses as one complete Squirrel asset set with
  common feed directory
  `.../releases/download/chromux-v0.73.0/`.
- [ ] Protected reviewer approves publication.
- [ ] `/releases/latest` resolves to `chromux-v0.73.0` and remains parseable by
  Chromux.

## Evidence

- Workflow URL:
- Windows 10 log:
- Windows 11 log:
- Manual wizard/restore evidence:
- Draft re-download verification:
- Published release URL:
- Final result: PASS / FAIL

Any failed or incomplete checkbox is a release blocker. Do not substitute a
hosted Windows runner for the real Windows 10 build-19045 gate.
