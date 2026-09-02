# Chromux Next 0.18.0 UAT

1. Open **New Session** at standard width. Confirm **Find a project** is the
   first and most prominent card, with a full-width sage-outlined search bar,
   search icon, source explanation, keyboard guidance, folder browser, and
   selected session-directory summary.
2. Confirm the search field receives initial focus and its prefilled project
   path is selected. Type a query without manually clearing the field and
   verify the query replaces the old path.
3. Search for a repository basename and for a relative-path-only fragment.
   Confirm registered, recent `p`, and discovered Git results retain the v0.15
   ranking and path detail.
4. Use Arrow Up/Down, Tab, Enter, Escape, and mouse selection. Confirm each
   behaves as described in the visible helper text and the selected directory
   updates without creating a session.
5. Use **Browse folders…** for a non-Git directory and confirm the chosen path
   appears in both the search field and session-directory summary.
6. Repeat at 820×720. Confirm the search card remains fully visible, the folder
   action stacks cleanly, and the secondary settings scroll without hiding the
   modal footer.
7. Create one session from a search result and confirm its exact directory,
   title fallback, permission preset, model, and reasoning effort are retained.
8. Run `npm run verify` and `npm run visual:packaged -- <evidence-directory>`.
9. Publish `chromux-next-v0.18.0` as a non-draft prerelease titled
   `GBlockParty Chromux Next v0.18.0`. Confirm legacy `/releases/latest`
   remains unchanged.
