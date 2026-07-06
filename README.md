# GBlockParty Chromux

GBlockParty Chromux is an OSS Electron/Chromium desktop front-end for local and GBlockParty-managed agent/browser workspaces.

The current app lives in [`prototype/`](prototype/). It runs parallel Claude Code / Codex terminal sessions, pairs each session with an embedded Chromium browser pane, detects local previews, and packages browser evidence into payloads that can be sent back to an agent.

## Quickstart

```sh
cd prototype
npm install
npm start
```

For the full prototype guide, see [`prototype/README.md`](prototype/README.md).

## Releases

Chromux checks GitHub Releases at:

`https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest`

Release tags must use `chromux-vX.Y.Z`, and release titles must use `GBlockParty Chromux vX.Y.Z`. The app only opens the GitHub Release URL when a newer release exists; it does not auto-install binaries.

## License

MIT. See [`LICENSE`](LICENSE).

