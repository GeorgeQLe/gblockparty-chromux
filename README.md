# GBlockParty Chromux

GBlockParty Chromux is an OSS Electron/Chromium desktop front-end for local and GBlockParty-managed agent/browser workspaces.

The current app lives in [`prototype/`](prototype/). It runs parallel Claude Code / Codex / Grok Build terminal sessions, pairs each session with an embedded Chromium browser pane, detects local previews, and packages browser evidence into payloads that can be sent back to an agent.

## Quickstart

```sh
cd prototype
npm install
npm start
```

Chromux supports macOS and Windows 10 22H2+ x64 (build 19045 or newer),
including Windows 11. Windows sessions run inside a selected, updated WSL2
distribution; Bash, Git, Node 22.12+, and the desired agent CLIs must be
installed there. Run `wsl --update` before setup. The initial Windows installer
is unsigned, so SmartScreen normally shows **Windows protected your PC**. Use
**More info → Run anyway** only after verifying the installer came from the
official GitHub Release; enterprise policy may prevent bypassing the warning.

For the full prototype guide, see [`prototype/README.md`](prototype/README.md).

## Architecture

See [`docs/gblockparty-iaas-integration.md`](docs/gblockparty-iaas-integration.md)
for the proposed boundary between the local-first Chromux cockpit and optional
GBlockParty-managed workspace execution, persistence, and cross-device access.

See [`docs/terminal-interaction-roadmap.md`](docs/terminal-interaction-roadmap.md)
for the shipped multiline composer contract and the ordered path toward structured
agent interactions and a future Monaco editor adapter.

## Releases

Chromux checks GitHub Releases at:

`https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest`

Release tags must use `chromux-vX.Y.Z`, and release titles must use `GBlockParty Chromux vX.Y.Z`. macOS source installs retain the local managed updater. Windows Squirrel installs use the matching release’s `RELEASES` manifest and full package; an incomplete Windows asset set is never routed through the macOS installer.

## License

MIT. See [`LICENSE`](LICENSE).
