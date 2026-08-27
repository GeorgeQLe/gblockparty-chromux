# GBlockParty Remote Clients: Current State and MVP Roadmap

Status: planned continuation. Last verified against Chromux Next `main`
through the `0.14.2` release line and the pinned GBlockParty control-plane
checkout on 2026-08-26.

## MVP outcome

A developer launches Codex on a persistent GBlockParty host from Chromux on
macOS, disconnects without stopping it, checks or intervenes from a phone, and
later reopens Chromux to continue the same session with missed output replayed.

The host-owned session is authoritative. Desktop and phone are clients of the
same host, session, terminal surface, replay, and input-lease contracts.

## Verified current state

### Chromux Next on macOS

Chromux Next is the active product under `chromux-next/`. Its local workflow is
runner-first: main-process `codex app-server`, structured transcript/composer,
attention, projects, browser/evidence, persistence, and restoration.

The opt-in GBlockParty Fleet vertical slice already:

- fetches a bounded, validated, sanitized fleet snapshot;
- keeps the control-plane URL, cookie/token, and WebSockets in the main process;
- shows distinct xterm-backed tabs for daemon-owned terminal surfaces;
- sends terminal input and resize through validated IPC;
- reconnects with the tab's last in-memory `sinceSeq`, drops duplicate output,
  and visibly clears history on an explicit replay reset; and
- detaches without sending stop, leaving the host-owned Codex/tmux session alive.

It is attach-only and disabled by default. It does not launch or stop a remote
session, enroll a device, manage a credential, request/renew/release an input
lease, or persist remote tabs/replay cursors across app restart. Its checked-in
client schema accepts only `authority: "unleased"`; the current GBlockParty
server reports leased authority for enrolled bearer-token devices. Closing the
app closes all Fleet attachments, and there is no remote-tab restoration path.

Therefore the current implementation proves the remote terminal UI and
in-process reconnect slice, but not the complete persistent Mac workflow.

### Phone

`mobile-prototypes/` contains seven static product explorations. They establish
the right phone model—an attention-first remote agent command center—and a
shared Fleet → Attention → Session → Terminal/Browser → Evidence hierarchy.
They do not implement authentication, remote terminals or browsers, leases,
evidence delivery, notifications, or production persistence.

There is no native iOS/Android, Expo, or React Native app in this repository.
The existing responsive GBlockParty PWA is the shortest first implementation
path for a physical-phone proof.

### GBlockParty services

GBlockParty already provides versioned fleet resources, one-time external
device enrollment and revocation, daemon-owned Codex/tmux sessions, surface
attachment, targeted bounded replay, reconnect cursors, and renewable
single-writer input leases. Durable sequenced raw-output history, managed
browser surfaces, artifacts, checkpoints, and recovery remain later work.

## Acceptance matrix

| First-MVP capability | Chromux Next now | Phone now | Required result |
| --- | --- | --- | --- |
| Local Codex cockpit | Implemented | Not applicable | Preserve account-optional local mode |
| List remote hosts/sessions | Implemented behind flag | Static fixture only | Both use the same fleet contract |
| Launch Codex on a fleet host | Missing | Missing | Mac launches; phone may remain attach-first |
| Attach/read daemon terminal | Implemented | Missing | Both attach to one host-owned surface |
| Input and resize | Implemented only on current authority path | Missing | Require server-enforced ownership |
| Enroll/revoke device | Missing | Missing | Revocable per-device credentials |
| Acquire/renew/release control | Missing | Missing | One writer; concurrent observers |
| Reconnect with bounded replay | Implemented during one app process | Missing | Persist `sinceSeq` across client restart |
| Detach without stopping work | Implemented | Missing | Host tmux remains alive |
| Reopen same remote tab after app restart | Missing | Not applicable | Restore surface identity and cursor |
| Native mobile packaging | Not applicable | Missing | Evidence-gated after PWA proof |

## Delivery sequence

### Phase 1 — Complete the Chromux Next Mac client

- Align the client protocol with the current external-device and lease frames.
- Add device enrollment, user-only credential storage, revocation handling,
  lease request/renew/release, read-only UI, and blocked-input behavior.
- Persist remote surface identity and the next replay cursor; restore attached
  remote tabs without launching, stopping, or resuming a different provider
  conversation.
- Add remote Codex launch on an eligible host with explicit local/remote
  selection and fail-closed behavior when the host is unavailable.
- Reuse the existing Fleet client, xterm UI, main-process networking, validated
  IPC, replay/reset behavior, and current control-plane test fixtures.
- Package a Mac prerelease and pass the physical Mac acceptance workflow.

### Phase 2 — Phone MVP through the existing PWA

- Implement sign-in/enrollment, fleet listing, attention/status inspection,
  read-only terminal attach, explicit control leasing, bounded input, reconnect,
  and approval/completion deep links.
- Reuse the same server schemas and behavioral fixtures as Chromux Next; do not
  create a second attachment or lease protocol.
- Validate physical Mac → phone → Mac continuity against one daemon-owned
  Codex/tmux session.

### Phase 3 — Native Chromux mobile decision

Choose a native shell only after the PWA proof measures a concrete requirement
for push reliability, background behavior, biometric credential protection,
terminal ergonomics, camera/evidence capture, or platform distribution. A
native client must consume the same control-plane contracts.

## First-MVP acceptance workflow

1. From Chromux Next on a Mac, enroll the device and launch Codex on the
   selected GBlockParty execution host.
2. Confirm output, resize, attention, and explicit control state in the remote
   tab.
3. Close Chromux without stopping the daemon-owned session.
4. On a physical phone, open the PWA, locate the same session, review missed
   output, acquire control, send a harmless command, and release control.
5. Reopen Chromux, restore the remote tab, reconnect from its saved cursor,
   receive only missed output, and continue the same provider/tmux session.
6. Exercise network loss, lease contention/expiry, revoked credentials,
   replay-gap reset, and offline-host behavior without silent local fallback.

## Explicitly outside the first proof

- Native App Store or Play Store distribution.
- Managed remote browser surfaces and preview tunnels.
- Durable raw-output retention beyond bounded replay.
- Cross-host live migration, checkpoint recovery, collaboration, billing, or
  multi-tenant administration.
