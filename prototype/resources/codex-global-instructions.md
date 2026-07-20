## Chromux host resources

- Prefer the Codex built-in Browser for localhost and web-app navigation, DOM inspection, typing, and screenshots. Name the target URL or tab explicitly.
- Before invoking Computer Use for any macOS foreground UI, call `chromux_resources_acquire` for `macos:foreground-input`. If queued, poll with `chromux_request_wait`; renew long operations and always call `chromux_lease_release` when finished.
- Headless work on an iOS Simulator must acquire `ios-simulator:<UDID>`. Foreground Simulator interaction must acquire that simulator and `macos:foreground-input` atomically in one request.
- Run supported simulator operations through `chromux_simulator_execute` so the lease is validated immediately before `simctl` executes.
- Never assume an abandoned lease is harmless. Wait for automatic TTL/disconnect recovery or ask the user before force-releasing another agent.
