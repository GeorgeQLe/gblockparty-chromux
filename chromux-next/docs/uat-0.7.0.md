# Chromux Next v0.7.0 detect-first onboarding UAT

## Automated release gate

From `chromux-next/`:

```sh
npm run typecheck
npm test
npm run package
npm run smoke:packaged
npm run smoke:runner-restoration
npm run visual:packaged -- /tmp/chromux-next-0.7.0-visual
```

The visual command must report 26 captures. Review scanning and populated
DETECT at standard and narrow widths, plus empty, denied-title, and
configuration states. Retain review of New Session, Settings, and Alignment
in all five layouts.

## Detection and onboarding

- On a clean successor profile, confirm DETECT opens automatically and macOS
  requests Terminal/iTerm Automation access on the first scan.
- With access granted, confirm terminal tab names, detected agents, canonical
  folders, and exact-directory Codex previews appear. Deny access and confirm
  only tab names disappear; process, agent, and folder results remain.
- Confirm search and keyboard traversal work, Rescan replaces the previous
  result, and an expired/replaced target requires another scan.
- Start fresh from shell, Claude, Codex, and Grok rows. Confirm each starts a
  new Codex thread in the detected folder and the external terminal remains
  unchanged.
- Resume a Codex row and confirm the divergence warning appears. When that
  thread is already open in Chromux Next, confirm Focus Existing selects it
  without a duplicate.
- Force start/resume failure and confirm no project, group, session, or
  onboarding completion is persisted. Confirm successful creation registers
  the project/worktree and completes onboarding.
- Confirm Choose Folder and Continue Without Session remain usable fallbacks.
  After onboarding, confirm DETECT remains in the global header.

## Release checks

Publish `chromux-next-v0.7.0` as a prerelease titled
`GBlockParty Chromux Next v0.7.0`. Confirm it does not replace the stable
legacy release returned by GitHub `/releases/latest`.
