# Windows installation and first-run setup

Chromux supports Windows 10 Pro 22H2 build 19045 x64 and current Windows 11
x64. The Windows app installs per user through Squirrel and does not require an
administrator account. Download these files only from the same official GitHub
Release:

- `GBlockParty-Chromux-Setup-X.Y.Z-x64.exe`
- `GBlockPartyChromux-X.Y.Z-full.nupkg`
- `RELEASES`
- `SHA256SUMS`
- `build-metadata.json`

Verify the installer's SHA-256 value against `SHA256SUMS` before running it.
Official Windows releases are Authenticode-signed with Microsoft Artifact
Signing and RFC 3161 timestamped. Signing establishes publisher identity and
file integrity; a newly signed release can still receive a temporary Microsoft
Defender SmartScreen reputation warning.

The installer does not install WSL, modify Windows features, request elevation,
or remove user data during upgrade or uninstall. Chromux update checks consume
the complete Squirrel asset directory from GitHub Releases.

## First run

Packaged Windows launches open **Windows Setup & Diagnostics** until the
required checks pass and setup is finished. The five stages are resumable:

1. **System** verifies x64 and Windows build 19045 or newer.
2. **WSL2 Runtime** lists installed distributions, rejects WSL1, and stores one
   validated default WSL2 distribution for new sessions.
3. **Tools & Agents** requires Bash, Git, and Node 22.12 or newer. Claude,
   Codex, and Grok CLIs are optional and independently detected.
4. **Projects Root** defaults to `$HOME/projects`. Chromux creates it only
   after **Create & Verify** is explicitly confirmed, then verifies that it is
   a writable directory.
5. **Ready** can run a no-model WSL PTY self-test and finish setup.

Each check is labeled **Ready**, **Optional**, or **Action Required**.
Remediation commands are copied to the clipboard; Chromux never runs them
automatically. `wsl --update` is safe to copy when the WSL runtime needs
maintenance. Documentation buttons open only allowlisted Microsoft, Node.js,
and Chromux project pages.

Setup completion stores only a schema version and completion time in
`~/.chromux/preferences.json`. The selected distribution remains in the
existing `wslDistro` preference, and each distribution's canonical Linux
Projects Root remains in `projectsRoots`. Existing profiles with a ready WSL2
distribution and writable persisted root migrate to completed setup
automatically.

## Readiness gates

Setup completion is not a bypass. Chromux recalculates capabilities from live
readiness:

- unsupported Windows, no WSL2 distribution, or missing Bash, Git, or Node
  disables all session creation;
- a missing agent CLI disables only that agent; Shell and installed agents
  remain available;
- a missing or read-only Projects Root disables **Create Project** only;
  **Open Existing** remains available;
- automatic restore remains unconsumed while the required runtime is blocked
  and resumes after readiness recovers.

The setup wizard can always be reopened through
**Settings → Windows Setup & Diagnostics**. Its no-model self-test starts a WSL
login-shell PTY, verifies input/output and the selected Projects Root, sanitizes
the bounded output, and never invokes or authenticates an agent.

## Removal

Squirrel uninstall removes the installed application from the current user's
local application directory. It intentionally retains:

- `%APPDATA%\chromux` (Electron settings, browser profiles, and local storage);
- `%USERPROFILE%\.chromux` (preferences, restore state, captures, logs, and
  other Chromux state).

After uninstall, remove those two directories manually only if their retained
local data is no longer wanted. Back up any captures or restore state first.
