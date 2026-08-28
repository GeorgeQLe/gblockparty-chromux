# Chromux Next 0.16.0 UAT

Use a disposable profile and disposable Git repositories. Do not point the
mutation checks at a valuable working tree. Record screenshots for standard
1440×900 and narrow 820×720 windows.

## Preconditions

- Install the signed/notarized macOS arm64 `0.16.0` prerelease.
- Create two disposable canonical project folders. Initialize one Git
  repository with one commit and no remote; leave the other as a plain folder.
- Register both folders, then create two sessions in the Git project and one in
  the plain project.
- Record `git status --porcelain=v2 --branch`, `git rev-parse HEAD`, and a tree
  hash before testing Repository.

## Attention

1. Select the first Git-project session. Confirm the default scope is Session
   and only that session's blockers and recommendation context appear.
2. Change to Group and All. Confirm broader cards identify their source and
   click through to the exact session.
3. Switch sessions while a refresh is running. Confirm old recommendations
   disappear immediately and never reappear in the new context.
4. Force one Luna failure. Confirm a previous result remains only if its scope
   and target IDs still match.
5. Collapse and reopen the panel, restart the app, and confirm the desktop
   preference persists. At 820×720 confirm it behaves as an overlay drawer.

## Repository

1. Open Repository. Confirm current view shows the selected session's canonical
   repository, branch, short HEAD, no upstream, clean state, worktree type, and
   two attached sessions.
2. Add staged, unstaged, untracked, and conflicted examples in the disposable
   repo outside Chromux. Refresh and confirm every count.
3. Enable All projects. Confirm canonical deduplication and the plain folder's
   non-Git state. Filter by branch and path, then clear the filter.
4. Compare the recorded HEAD, porcelain output, and tree hash. They must be
   unchanged by every Repository action.

## Picker and project documents

1. In New Session, type a valid directory, choose Add folder, and confirm the
   native dialog opens there, accepts existing folders only, and immediately
   places the exact canonical selection in the combobox.
2. Select a project with no document. Confirm Alignment offers Open document and
   Create document; Deck and Canvas show project-specific empty states.
3. Create a document. Confirm Save As appears before any file is written and the
   saved JSON is blank but valid.
4. Switch to the other project, open a different document, then alternate
   sessions. Confirm same-project sessions share their binding, while the other
   project never shows it. Restart and repeat.
5. During a read-only contributor run, switch projects. Confirm the run is
   cancelled and undo, proposal, response, event, and selected-item state clear.

## Cmd-K and terminal boundary

1. From every interface approach, press Cmd-K. Search by title prefix,
   substring, group, project path, and status. Verify Arrow Up/Down, Enter,
   Escape, focus containment, and focus restoration.
2. Activate a local result. Confirm the exact group/session is selected and
   Runner opens.
3. Attach a Fleet terminal, invoke Cmd-K, and activate its result. Confirm the
   existing attached tab opens; no new session or transport is created.
4. Confirm there are no local PTY, package-script launch, or Host Resource
   Broker controls.

## Release and update qualification

- [x] `npm run verify`: TypeScript, 36 files/200 tests, arm64 package, and all
  packaged smoke lanes. Final focused verification passed 37 files/203 tests.
- [x] `npm run visual:packaged`: 46 primary, 8 Situation Room, and 2 renderer
  recovery captures.
- [x] Signed/notarized/stapled arm64 update ZIP and manifest. A fresh extraction
  at `/private/tmp/chromux-next-0.16.0-final-verify.fFVsWg` passed strict
  codesign, bundle ID, Team ID, Gatekeeper, stapler, version, and arm64 checks.
  ZIP: 119,025,109 bytes, SHA-256
  `2bcd6f82426e30753394b4ece48c2b668cc9080af96745b9b9258e982ab9e4f7`.
- [ ] Public asset redownload and managed-update qualification follow
  publication because update discovery intentionally consumes GitHub releases.
- Confirm GitHub prerelease `chromux-next-v0.16.0` is visible with title
  `GBlockParty Chromux Next v0.16.0`.
- Confirm GitHub `/releases/latest` still resolves to the unchanged legacy
  stable Chromux release.
