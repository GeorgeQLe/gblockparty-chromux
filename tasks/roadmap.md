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
  - Three interactive MVP directions compare one safe read-only, replay,
    single-writer lease, bounded-input, release, and recovery loop; the seven
    broader historical explorations remain archived at their original routes.
- [ ] Complete Chromux Next macOS continuity
  - **Device identity and leased control**
    - Add one-time device enrollment and revocation with protected credential
      storage.
    - Add lease request, renewal, release, expiry, and visible read-only UI.
    - Block local input without a lease and preserve server-side enforcement
      as the authority boundary.
  - **Remote Codex launch**
    - Require explicit Local versus GBlockParty Host selection and discover
      only eligible hosts.
    - Launch idempotently, attach the returned daemon-owned session, and fail
      closed without silently launching locally.
    - Keep detach separate from stop so closing a tab or Chromux does not
      terminate host-owned work.
  - **Remote-session restoration**
    - Persist remote surface/session identity and the next replay cursor.
    - Restore remote tabs after Chromux restarts and replay only missed output.
    - Surface replay gaps, offline hosts, and revoked credentials visibly
      instead of substituting another session or local execution.
  - **Physical Mac acceptance gate**
    - Launch Codex remotely, then quit Chromux while the daemon-owned tmux
      session stays alive.
    - Reopen the same remote tab and replay only the missed output.
    - Verify lease contention, expiry, reconnect, revocation, replay-gap, and
      offline-host behavior.
- [ ] Phone continuity MVP
  - Implement the first physical-phone workflow in the existing GBlockParty
    PWA after Mac acceptance, reusing the same enrollment, attachment, replay,
    and lease contracts.
- [ ] Native Chromux mobile decision
  - Promote a native client only after PWA evidence identifies a concrete
    platform capability or distribution requirement, and reuse the same
    enrollment, attachment, replay, and lease contracts.

The detailed implementation audit, acceptance matrix, and physical workflow
live in [`docs/gblockparty-remote-clients.md`](../docs/gblockparty-remote-clients.md).
