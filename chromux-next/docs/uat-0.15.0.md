# Chromux Next 0.15.0 UAT

1. Open **New session** and confirm the project field is a searchable combobox,
   not a registered-folder-only select.
2. Search with a case-insensitive substring from a Git repository basename.
   Confirm basename matches appear before any relative-path-only matches and
   standalone repositories appear before nested repositories.
3. Use Arrow Up/Down to move the highlight. Press Tab and confirm the
   highlighted project completes into the field. Repeat with Enter, then use
   Escape to close the result list.
4. Search using a category/path fragment that is absent from every basename.
   Confirm matching relative paths appear.
5. Create a session from a discovered, previously unregistered project.
   Confirm the session starts there and the project becomes registered for
   future sessions.
6. Use **Add folder** to choose a non-Git directory and confirm it remains
   available in search. Deny project-root filesystem access (where practical)
   and confirm registered folders remain usable with a non-blocking scan note.
7. Run `npm run typecheck`, `npm test`, `npm run package`, and
   `npm run smoke:packaged`.
8. Publish `chromux-next-v0.15.0` as a non-draft prerelease titled
   `GBlockParty Chromux Next v0.15.0`. Confirm the legacy stable release at
   `/releases/latest` is unchanged.
