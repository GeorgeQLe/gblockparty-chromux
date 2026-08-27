# Chromux Roadmap

## Product goal

Keep Chromux Next useful as an account-optional local Codex cockpit while
making it a safe client of persistent GBlockParty sessions that can also be
continued from a phone.

## Milestones

- [x] Chromux Next local runner and workspace
  - Structured Codex app-server runner, transcript/composer, attention,
    projects, browser/evidence, persistence, and restoration.
- [x] GBlockParty Fleet terminal vertical slice
  - Opt-in sanitized fleet discovery, attach-only remote xterm tabs,
    input/resize, in-process reconnect/replay, explicit reset, and detach
    without stop.
- [x] Mobile product-direction prototypes
  - Seven static variations establish an attention-first remote command center.
- [ ] Complete Chromux Next macOS continuity
  - External-device enrollment/revocation, leased control, remote launch,
    persisted remote tabs/cursors, and physical Mac acceptance.
- [ ] Phone continuity MVP
  - Implement the first physical-phone workflow in the existing GBlockParty
    PWA using the same server contracts and behavioral fixtures.
- [ ] Native Chromux mobile decision
  - Promote a native client only when PWA validation identifies a concrete
    platform capability or distribution requirement.

The detailed implementation audit, acceptance matrix, and physical workflow
live in [`docs/gblockparty-remote-clients.md`](../docs/gblockparty-remote-clients.md).
