# Host resource broker

Windows uses `windows:foreground-input` over a user-scoped named pipe. macOS
retains `macos:foreground-input` and its Unix socket. iOS Simulator resources
and capacity controls are macOS-only; browser resources, leases, FIFO queues,
renewal, cancellation, and force release are shared.

`npm run broker:install` installs the host-appropriate integration. On Windows
it writes a launcher into the selected WSL2 distribution and registers it with
Codex. The launcher invokes the installed Windows Electron executable with
`ELECTRON_RUN_AS_NODE=1`, so the helper reaches the named pipe without exposing
a network port.

Chromux coordinates exclusive host resources across Chromux windows, Codex app
sessions, and Codex CLI processes. One background service owns a user-only Unix
socket at `~/.chromux/resource-broker.sock`; the Electron app and the stdio MCP
bridge are clients of that service. The socket is mode `0600`, requests are
bounded JSON records, and no network listener is opened.

The daemon starts automatically when either client first connects and outlives the Chromux window. For login startup and global Codex guidance, run:

```sh
cd prototype
npm run broker:install
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.georgele.chromux-resource-broker.plist
codex mcp add chromux -- node "$PWD/resource-broker/mcp-server.js"
```

Restart Codex after MCP registration. `/mcp` shows the connected server in the CLI. The equivalent project or global `config.toml` entry is:

```toml
[mcp_servers.chromux]
command = "node"
args = ["/absolute/path/to/chromux/prototype/resource-broker/mcp-server.js"]
required = true
```

## Resource contract

- `macos:foreground-input` serializes native GUI control, including foreground Simulator interaction.
- `ios-simulator:<UDID>` serializes work on a particular simulator. Acquire it alone for headless `simctl`/`xcodebuild`, or atomically with foreground input for visible interaction.
- `browser:<Chromux session ID>` identifies each paired Chromux browser target. These targets use separate persistent Electron partitions; Codex's built-in Browser remains preferred for web testing because it can work in its own browser surface without moving the macOS pointer.

Acquisition is atomic. A request is granted only when every requested exclusive resource is available, so agents cannot deadlock by holding half of a multi-resource request. Conflicting requests retain FIFO order; unrelated resources can proceed concurrently. Leases have a bounded TTL, may be renewed, and release on explicit completion or client disconnect. A restarted daemon records prior leases as recovered but never resurrects an unverifiable owner.

The MCP bridge exposes:

- `chromux_resources_list`
- `chromux_resources_acquire`
- `chromux_request_wait` / `chromux_request_cancel`
- `chromux_lease_renew` / `chromux_lease_release`
- `chromux_simulator_execute`
- `chromux_client_rename`
- `chromux_capture_targets_list`
- `chromux_capture_screenshot`
- `chromux_record_start` / `chromux_record_stop`
- `chromux_browser_queue_add`

Chromux's **RESOURCES** view shows owners, expirations, queues, wait time, simulator capacity, cancellation, and force release. Force release does not stop an operation that is already running; use it only after checking the owner is stale.

## Capture control and artifact resources

The stdio server advertises MCP resource support in addition to tools. Capture
tools use a separate user-only `~/.chromux/capture-control.sock` owned by the
running Electron app. This keeps window access and the approval UI inside
Chromux while preserving the MCP caller identity. Requests and responses are
bounded, disconnects stop caller-owned recordings, and no TCP listener is
opened. If the app is not running, the bridge returns an actionable error and
does not auto-launch it.

`chromux_browser_queue_add` requires `url` and accepts an optional reason of at
most 240 characters. The bridge takes the originating session and its
authentication token from `CHROMUX_SESSION_ID` and `CHROMUX_SIGNAL_TOKEN`;
callers cannot select another session. Chromux accepts normalized HTTP(S) URLs
without embedded credentials and existing local `file:` targets. A successful
call returns `{ status: "queued" }`, `{ status: "alreadyQueued" }`, or
`{ status: "refreshed" }`. Queueing never navigates; **OPEN** remains a user
action. The same control channel and named-pipe path are used by the Windows/WSL
MCP launcher.

Agents that cannot call MCP may emit an authenticated v2 OSC envelope to their
own `/dev/tty`. Its base64url JSON body uses:

```json
{
  "v": 2,
  "event": "browser-preview",
  "sessionId": "<CHROMUX_SESSION_ID>",
  "token": "<CHROMUX_SIGNAL_TOKEN>",
  "url": "http://localhost:5173/",
  "reason": "review the running UI"
}
```

The complete terminal sequence is `ESC ] 777 ; chromux ; v2 ; <body> BEL`
(ST is also accepted). Missing, exited, mismatched, malformed, oversized, or
unauthenticated session claims are rejected. MCP and OSC enter the same
attention-visible queue action.

`chromux_capture_targets_list` returns only opaque Chromux-window or
paired-browser target IDs, labels, and capability flags; page URLs remain hidden
until an approved browser screenshot. Each capture requires **ALLOW ONCE** in
Chromux. Recording is limited to one Chromux-window stream at a time and only
the starting MCP client or the visible in-app **STOP** control can stop it.

Screenshot results include direct MCP `image` content and generated
`chromux://capture/...` resource links. Recording stop results include a direct
contact-sheet image plus links to the WebM, contact sheet, and manifest.
`resources/read` returns text for YAML/JSON and base64 blobs for binary files.
It resolves only opaque generated IDs and manifest-listed files beneath
`~/.chromux/captures`, rejecting traversal, symlinks, arbitrary paths, and
oversized reads.

Capture is macOS-only in 0.65. Other platforms retain the protocol boundary but
return an explicit unsupported-platform result. See
[`capture-payload.md`](capture-payload.md) for evidence/manifest contracts and
[`privacy-and-local-data.md`](privacy-and-local-data.md) for permission, audio,
and retention behavior.

## Simulator capacity

Auto mode allows one booted simulator below 32 GiB RAM, two at 32–63 GiB, and three at 64 GiB or more. A new boot is admitted only while free memory is at least 25%, normalized one-minute load is below 75%, swap growth is at most 64 MiB per sample, and thermal state is nominal or unavailable without another pressure signal. Pressure blocks new boots and never revokes an active lease. The 16 GiB host therefore admits one simulator in Auto. The Resources view can override the ceiling to one, two, or three; pressure signals still apply. Idle simulators above the ceiling drain after a 15-second hysteresis window, while leased simulators are never selected.

Supported lease-validated actions are `boot`, `shutdown`, `install`, `launch`, `terminate`, and `erase`. Direct `xcrun simctl` and `xcodebuild` calls cannot be prevented by an MCP server, so the Computer Use and command gate remains cooperative for external sessions.

## Limits

Chromux cannot intercept the built-in Computer Use tool before invocation. The global guidance installed by `broker:install` tells compliant Codex sessions to acquire and release foreground input. Unregistered sessions are outside enforcement and should be treated as unbrokered.
