# Chromux and GBlockParty IaaS

Status: proposed architecture direction. This document records product and
ownership boundaries; it is not yet an implemented GBlockParty service
contract.

## Architecture stance

Chromux is the local-first cockpit for agent/browser workspaces. GBlockParty
IaaS is the optional continuity and execution layer behind it.

The local Chromux app must remain useful without an account or hosted service.
When a user connects GBlockParty, the same UI can attach to workspaces running
on a registered local Mac, a customer-managed host, or a GBlockParty-managed
runner.

```text
Chromux clients
desktop / mobile / web
        |
        | workspace API and event streams
        v
GBlockParty control plane
identity / fleet / scheduling / leases / policy
        |
        v
Workspace hosts
local Mac / customer host / managed runner
        |
        +-- repository and worktree
        +-- Claude, Codex, or Grok PTYs
        +-- paired browser and preview tunnel
        +-- captures and other artifacts
```

Claude Code, Codex, and Grok remain native CLI processes on the workspace
host. Chromux and GBlockParty orchestrate those processes without replacing
their runtimes or silently taking ownership of their credentials.

## Ownership boundaries

### Chromux owns

- Fleet, attention, session, terminal, browser, and evidence user interfaces.
- A fully functional local-only mode.
- Agent-specific launch, resume, signal, and presentation adapters.
- Explicit user interventions: approve, deny, reply, raw terminal input,
  inspect, capture, and send.
- A shared client protocol that can support desktop, mobile, and web clients.

### GBlockParty IaaS owns

- Identity, organizations, device trust, and authorization.
- Host registration, health, scheduling, and workspace lifecycle.
- Durable remote PTYs, agent processes, browsers, and preview tunnels.
- Workspace and session metadata plus bounded event history.
- Encrypted artifact and checkpoint storage.
- Input leases so only one client controls a session at a time.
- Secrets, policy, retention, audit, quotas, cleanup, and billing for managed
  infrastructure.
- Recovery onto another compatible host after a durable checkpoint.

## Resource model

The shared protocol should expose a small set of provider-neutral resources:

| Resource | Purpose |
| --- | --- |
| `Host` | A registered local Mac, customer runner, or GBlockParty runner. |
| `Workspace` | Repository, worktree, environment, runtime policy, and lifecycle. |
| `Session` | Agent, exact provider session ID, PTY, status, and attention state. |
| `Surface` | A terminal or paired browser attached to a session. |
| `Artifact` | Capture, screenshot, recording, transcript checkpoint, or log. |
| `Lease` | Short-lived authority for a device to send session input. |
| `Event` | Append-only output, lifecycle, preview, approval, and evidence activity. |

Project identity should not rely only on an absolute `cwd`. Portable workspace
records should use repository identity, revision or worktree identity, and a
repo-relative root. Session records should store the exact Claude/Codex/Grok
resume identifier instead of rediscovering the newest conversation by working
directory.

## State placement

| State | Authoritative location |
| --- | --- |
| Live PTY, process, and browser profile | Assigned workspace host |
| Fleet and workspace metadata | GBlockParty control plane |
| Terminal and lifecycle events | Bounded event stream and history |
| Captures, recordings, and checkpoints | Encrypted artifact storage |
| Repository source | Git remote plus workspace disk |
| Dirty worktree | Encrypted workspace volume or explicit checkpoint |
| CLI credentials | Runtime-host secret store; never general Chromux sync |
| Browser credentials and cookies | Host browser profile; never metadata sync |
| Exact agent resume identifier | Session record |
| Device input ownership | Short-lived lease |

A running PTY or in-flight model request is not treated as serializable state.
Live continuity comes from attaching another client to the same host. Host
migration resumes from the latest durable checkpoint and must be presented as
recovery rather than lossless continuation.

## Cross-device flow

1. Desktop Chromux creates or adopts a workspace on a registered host.
2. The host daemon keeps the repository, PTYs, agents, browser, and local
   preview processes alive independently of any connected client.
3. It publishes bounded session events and durable checkpoint metadata to the
   GBlockParty control plane.
4. Another authenticated Chromux client lists the same fleet and attaches to
   the workspace through a secure tunnel or relay.
5. The client claims a short-lived input lease before approving, replying, or
   typing into a session. Read-only observation can remain multi-client.
6. Client disconnect does not stop the workspace.
7. If the host becomes unavailable, GBlockParty can prepare the repository and
   latest durable session checkpoint on another compatible host.

Registered local hosts and managed runners should implement the same host
protocol. This keeps `home-mac`, a private build server, and a paid managed
runner interchangeable from the Chromux client's perspective.

## Security and retention

- Workspace events and artifacts can contain source code, prompts, paths,
  screenshots, DOM, console output, and secrets. Encrypt them in transit and at
  rest with tenant-scoped keys.
- Do not copy complete `~/.claude`, `~/.codex`, browser-profile, or home
  directories into generic sync storage.
- Authenticate provider CLIs on each execution host or inject narrowly scoped
  runtime secrets through the managed secret boundary.
- Make artifact retention, deletion, export, and audit behavior explicit.
- Separate interactive approval, agent reply, and raw shell input in both the
  protocol and UI; they have different safety consequences.
- Use revocable device credentials and short-lived connection and input tokens.

## Product and packaging boundary

The durable split is local-free versus managed-paid:

- Local Chromux remains free and account-optional.
- Connecting GBlockParty adds cross-device access, persistent remote sessions,
  managed browsers, artifact history, recovery, and hosted runners.
- Usage pricing can map to real costs such as runner hours, parallel workers,
  browser hours, storage, and retention.
- Team and enterprise packaging can add shared fleets, policy, audit, budgets,
  network controls, and access management.

This means "Chromux Sync" should not become a separate Dropbox-like subsystem.
It should be the persistence, event, and attachment behavior of GBlockParty
workspaces, consumed through the same protocol by local and remote Chromux
clients.

## Delivery sequence

1. Define a versioned workspace/session manifest with stable IDs and exact
   provider resume IDs.
2. Add a local host daemon and attach protocol while keeping local-only startup
   unchanged.
3. Support secure attachment from a second desktop or mobile client, including
   single-writer leases.
4. Add encrypted checkpoints and explicit recovery onto another host.
5. Add optional GBlockParty-managed runners, artifact retention, policy, and
   metering after the local daily-driver and remote-control loops are proven.

## Related decisions

- [`../research/devtool-integration-map.md`](../research/devtool-integration-map.md)
  establishes Chromux as a cockpit around unchanged terminal-native agents.
- [`../research/devtool-monetization.md`](../research/devtool-monetization.md)
  identifies local-free versus managed-paid as the intended packaging boundary.
- [`../mobile-prototypes/SPEC.md`](../mobile-prototypes/SPEC.md) defines the
  remote fleet, attention, session, terminal/browser, and evidence interaction
  hierarchy that this architecture must support.
- [`../prototype/docs/privacy-and-local-data.md`](../prototype/docs/privacy-and-local-data.md)
  inventories the current prototype's local storage and outbound boundaries.

