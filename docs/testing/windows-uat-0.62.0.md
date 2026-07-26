# Chromux v0.62.0 Windows 11 x64 / WSL2 UAT

Status: **NOT YET RUN — release gate is open**

This report must pass on a real Windows 11 22H2+ x64 machine before
`chromux-v0.62.0` is tagged or published. Hosted packaging CI is supporting
evidence, not a substitute.

## Machine

- Windows version/build:
- CPU architecture:
- WSL version:
- Default and non-default WSL2 distributions:
- Tester/date:
- Installer SHA-256:

## Required pass matrix

- [ ] Select default/non-default WSL2 distributions and reject WSL1.
- [ ] Open WSL-home and Windows-drive projects with spaces, Unicode, and quotes.
- [ ] Exercise ConPTY input/output, resize, exit, restore, and Unicode.
- [ ] Launch/resume real Claude, Codex, and Grok sessions and verify hook signals.
- [ ] Detect external WSL sessions and exclude Chromux-owned sessions.
- [ ] Open localhost previews and Windows/WSL `file://` HTML.
- [ ] Prepare/reveal/deliver a capture with a WSL-readable payload path.
- [ ] Run broker MCP list/acquire/renew/release from WSL and confirm no TCP listener.
- [ ] Verify Prevent Sleep, Ctrl shortcuts, caption controls, all themes, guarded quit, and browser isolation.
- [ ] Test clean install, upgrade, queued update/restore, uninstall, and no-admin install.
- [ ] Record the unsigned SmartScreen and enterprise-policy behavior.

## Evidence

- CI run:
- Screenshots/logs:
- Failures and retest notes:
- Final result: PASS / FAIL
