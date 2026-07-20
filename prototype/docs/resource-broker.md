# Host resource broker

Chromux 0.32 coordinates exclusive host resources across Chromux windows, Codex app sessions, and Codex CLI processes. One background service owns a user-only Unix socket at `~/.chromux/resource-broker.sock`; the Electron app and the stdio MCP bridge are clients of that service. The socket is mode `0600`, requests are bounded JSON records, and no network listener is opened.

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

Chromux's **RESOURCES** view shows owners, expirations, queues, wait time, simulator capacity, cancellation, and force release. Force release does not stop an operation that is already running; use it only after checking the owner is stale.

## Simulator capacity

Auto mode allows one booted simulator below 32 GiB RAM, two at 32–63 GiB, and three at 64 GiB or more. A new boot is admitted only while free memory is at least 25%, normalized one-minute load is below 75%, swap growth is at most 64 MiB per sample, and thermal state is nominal or unavailable without another pressure signal. Pressure blocks new boots and never revokes an active lease. The 16 GiB host therefore admits one simulator in Auto. The Resources view can override the ceiling to one, two, or three; pressure signals still apply. Idle simulators above the ceiling drain after a 15-second hysteresis window, while leased simulators are never selected.

Supported lease-validated actions are `boot`, `shutdown`, `install`, `launch`, `terminate`, and `erase`. Direct `xcrun simctl` and `xcodebuild` calls cannot be prevented by an MCP server, so the Computer Use and command gate remains cooperative for external sessions.

## Limits

Chromux cannot intercept the built-in Computer Use tool before invocation. The global guidance installed by `broker:install` tells compliant Codex sessions to acquire and release foreground input. Unregistered sessions are outside enforcement and should be treated as unbrokered.
