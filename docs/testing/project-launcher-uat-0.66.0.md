# Chromux v0.66.0 Project Launcher UAT

Status: **NOT YET RUN**

Do not create `chromux-v0.66.0`, publish its GitHub Release, or update
`/releases/latest` until both sections record **PASS** with machine details.

## macOS visual and workflow pass

Record:

- macOS version:
- Mac model/architecture:
- Build commit:
- Tester/date:

1. Launch the packaged 0.66.0 app and open `+`, Command-T, and Command-N.
2. Verify `+` and Command-T land on **Open Existing**; Command-N lands on
   **Create Project**.
3. Focus a host input, terminal input, open modal, non-editable browser page,
   and editable browser field. Verify the shortcuts run only from the terminal,
   app surface, and non-editable browser page.
4. Create one fresh lifecycle project with **Create Only**. Confirm the
   destination preview, `.git`, visible created path, and no launched session.
5. Clone one local or disposable remote repository into a sandbox category
   with **Create & Launch**. Confirm the derived name, destination, selected
   agent, and exact launched cwd.
6. Inspect Light and Dark appearances for tab, field, warning, overflow, focus,
   and footer-button layout.
7. Trigger an existing destination and one failed clone. Confirm the existing
   directory is unchanged and only the `.chromux-*.staging` directory is
   removed.

Result: **NOT YET RUN**
## Windows 11 x64 / WSL2 pass

Record:

- Windows version/build:
- WSL version:
- Distribution(s):
- Build commit:
- Tester/date:

1. Complete the applicable base checks in
   [`windows-uat-0.62.0.md`](windows-uat-0.62.0.md), then install the 0.66.0
   candidate.
2. In two WSL2 distributions, set different **Projects Root** Linux paths.
   Switch distributions and verify each saved root returns unchanged.
3. Set `P_BASE` in a clean distribution with no saved root. Confirm the first
   launcher configuration inherits it; otherwise confirm the default is
   `<WSL-home>/projects`.
4. Verify configured flat, lifecycle, and sandbox destinations preserve Linux
   paths and never become Windows or UNC paths in the launcher or launched
   session.
5. Run fresh **Create Only** and authenticated clone **Create & Launch**. Confirm
   Git receives safe arguments, the selected WSL distribution owns the files,
   and the launched session opens at the exact returned path.
6. Verify Control-T and Control-N from host, terminal, non-editable webview,
   editable host/webview fields, and an open modal.
7. Preseed more than 50 `p_history` rows and both completion caches. Confirm
   successful creation deduplicates to the newest 50 rows and removes only
   `p_completion` and `sp_completion`.
8. Run one successful and one failing executable `P_NP_HOOK`. Confirm its four
   arguments are name, category, category type, and target; failure is a visible
   warning and does not remove the created repository.
9. Force a clone failure and existing-destination failure. Confirm no existing
   content changes and only Chromux's unique staging directory is cleaned.
10. Build the matching Squirrel `.exe`, `.nupkg`, and `RELEASES` assets and
    complete install/update checks before release publication.

Result: **NOT YET RUN**
