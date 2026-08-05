# GBlockParty Chromux Next

Chromux Next is an experimental, local-first alignment workspace. It is a
separate Electron app from legacy Chromux in `../prototype/`: it has a distinct
package, bundle identifier, user-data directory, architecture, and release
line.

## Current demo slice: v0.1.1

This foundation prerelease includes:

- Runtime-validated `AlignmentDocumentV1`, semantic item, presentation view,
  review, mutation, provider, response, and IPC contracts.
- Atomic canonical JSON reads and writes. The app never reads or mutates legacy
  Chromux state.
- Revision-checked mutation application, history, and inverse batches for
  undo.
- A React alignment editor with outline, direct text editing, review status,
  insertion, document/deck/canvas projections, and save/open controls.
- A structured agent composer with context selection, streaming events,
  cancellation, result inspection, and review-before-apply proposals.
- A deterministic fake provider and a read-only `codex exec` adapter. The
  adapter inherits the CLI process environment and never reads or copies
  authentication files.
- Explicit-click HTTP(S) link detection and a popup-denying,
  main-process-owned `WebContentsView`. There is no preview queue or automatic
  navigation.

Later roadmap slices—including deterministic PPTX/portable HTML exports,
editable canvas operations, qualified Claude/Gemini adapters, fan-out
workflows, PTY, and curated legacy HTML migration—remain intentionally outside
this prerelease.

## Run

Requires Node.js 22.12 or newer.

```sh
npm install
npm start
```

Use `npm run verify` for TypeScript, contract/unit tests, and an Electron Forge
package build.

The successor uses an upward-chevron variation of the Chromux mark. Run
`npm run icons` after changing `build/icon.svg` to regenerate the packaged
ICNS, ICO, and PNG assets.

## Data model and trust boundaries

Workspace `.json` files are authoritative. Provider processes receive an
immutable snapshot and can only return proposed mutation batches. The main
process validates every IPC payload and mutation, then performs the canonical
write. Renderer isolation, context isolation, sandboxing, popup denial, and an
HTTP(S)-only navigation allowlist are enabled.

App-local settings and bounded run metadata live under the separate Electron
user-data directory named `GBlockParty Chromux Next`. Credentials are not
stored or logged.

## Release convention

Experimental releases use tags `chromux-next-v0.x.y`, titles
`GBlockParty Chromux Next v0.x.y`, and are GitHub prereleases. They must not
become GitHub `/releases/latest`, which remains the legacy Chromux update
channel until the cutover gates are met.
