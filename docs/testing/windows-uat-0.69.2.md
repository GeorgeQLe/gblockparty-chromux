# Chromux v0.69.2 Windows 10 22H2+ x64 / WSL2 UAT

Status: **NOT YET RUN — release gate is open**

This report must pass on a real Windows 10 Pro 22H2 x64 machine at build 19045
before `chromux-v0.69.2` is tagged or published. Windows 11 remains supported,
but does not satisfy this compatibility gate. Hosted packaging CI is supporting
evidence, not a substitute. Every artifact built from `bf9d9be` is superseded;
only artifacts built from the new post-change commit may be tested or published.

## Machine

- Windows version/build:
- CPU architecture:
- WSL version:
- Default WSL2 distribution (Ubuntu):
- Non-default WSL2 distribution (Debian):
- Disposable imported WSL1 fixture:
- Claude, Codex, and Grok CLI versions/auth status:
- Tested commit:
- Tester/date:
- Installer SHA-256:

## Clean build and artifact inspection

- [ ] From a clean native Windows checkout of the tested commit, run `npm ci`.
- [ ] Run `npm run test:ci:windows` and record a pass.
- [ ] Run `npm run make:win` and use only the resulting three-file Squirrel set.
- [ ] Inspect the packaged x64 executable and confirm the ASAR contains version `0.69.2`.
- [ ] Confirm `conpty.node` is present outside the ASAR in the packaged application.
- [ ] Confirm the GitHub Windows workflow passes for the tested commit.

## Required pass matrix

- [ ] Update WSL with `wsl --update`; make Ubuntu the default WSL2 distribution.
- [ ] Install Debian as a non-default WSL2 distribution.
- [ ] Import a disposable WSL1 distribution and confirm Chromux rejects it.
- [ ] Select and route new workspaces through both Ubuntu and Debian.
- [ ] Open WSL-home and Windows-drive projects with spaces, Unicode, and quotes.
- [ ] Exercise ConPTY input/output, resize, exit, restore, and Unicode.
- [ ] Authenticate and launch/resume real Claude, Codex, and Grok sessions; verify hook signals.
- [ ] Detect external WSL sessions and exclude Chromux-owned sessions.
- [ ] Open localhost previews and Windows/WSL `file://` HTML.
- [ ] Prepare/reveal/deliver a capture with a WSL-readable payload path.
- [ ] Run broker MCP list/acquire/renew/release from WSL and confirm no TCP listener.
- [ ] Verify Prevent Sleep, Control shortcuts, the custom title bar/caption controls, all themes, guarded quit, and browser isolation.
- [ ] Test a clean no-admin install, Squirrel upgrade, queued update/restore, and uninstall.
- [ ] Record unsigned SmartScreen behavior and whether enterprise policy permits bypass.

## Evidence

- CI run:
- Clean checkout/build log:
- Packaged executable/ASAR/`conpty.node` inspection:
- Screenshots/logs:
- Failures and retest notes:
- Final result: PASS / FAIL

If any required item fails, set the final result to FAIL and stop without
tagging or publishing. After a complete PASS, record the final commit and
artifact hashes here, then publish exactly:

- `GBlockParty-Chromux-Setup-0.69.2-x64.exe`
- `GBlockPartyChromux-0.69.2-full.nupkg`
- `RELEASES`

Finally verify that GitHub `/releases/latest` resolves to `chromux-v0.69.2`,
the release title is `GBlockParty Chromux v0.69.2`, all three assets have
nonzero sizes and matching downloaded hashes, and Chromux parses the assets as
a complete Squirrel set.
