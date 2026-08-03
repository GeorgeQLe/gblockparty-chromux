# Chromux troubleshooting

## Windows / WSL2 readiness

- Open **Settings → Windows Setup & Diagnostics**, then choose **Refresh
  Checks**. Required checks must show **Ready**.
- `wsl.exe --list --verbose` must report version `2`; WSL1 is rejected.
- Inside that distribution verify Bash, Git, and Node 22.12+. Agent CLIs are
  optional; a missing agent disables only its own launcher.
- A missing or read-only Projects Root blocks **Create Project**, not **Open
  Existing**. Use an absolute Linux path. **Create & Verify** requires explicit
  confirmation and then checks that the directory is writable.
- If every launch action is unavailable, copy the displayed remediation
  command, run it yourself in PowerShell or WSL, and refresh. Chromux never
  installs WSL, runs an administrator command, authenticates an agent, or edits
  shell configuration on your behalf.
- The no-model self-test opens a WSL login-shell PTY and checks the selected
  root. It does not invoke an agent. Copy its sanitized result when reporting a
  setup issue.
- Records tied to a removed distribution remain unresolved and are never
  silently redirected. Reinstall that exact distro name or recreate the record.
- Windows drive paths map to `/mnt/<drive>/...`; Linux-home paths are exposed
  to Electron through `\\wsl.localhost\<distro>\...`.
- Windows normally reaches WSL dev servers over `localhost`. If it does not,
  test the URL from PowerShell and inspect firewall or VPN policy.

## Windows installation and updates

Local developer builds are unsigned. Official Windows releases are
Authenticode-signed through Microsoft Artifact Signing and include
`SHA256SUMS`; verify the installer hash and publisher before launch. Signing
does not guarantee immediate SmartScreen reputation, so a new correctly signed
release can still show a temporary warning.

Windows updates require the matching installer, full `.nupkg`, and `RELEASES`
from one GitHub release-download directory. Chromux rejects incomplete,
mismatched, or renamed assets instead of passing a direct `RELEASES` URL to
Squirrel. Installation, update, and uninstall are per-user. Uninstall retains
`%APPDATA%\chromux` and `%USERPROFILE%\.chromux`; see
[Windows installation and first-run setup](windows-setup.md) before removing
those directories manually.

## Settings missing after an update

Chromux v0.63.1 fixes a profile-name change that could make an update appear to
reset renderer settings such as theme, brightness, rail mode, Threads ordering
and preview size, activity indicators, browser-fullscreen behavior, and custom
session groups. The installer did not delete those settings. Electron began
looking under the display-name profile `GBlockParty Chromux` instead of the
earlier `chromux` profile.

On every production launch Chromux now chooses profiles in this order:

1. An existing `chromux` profile, which restores the original settings for
   affected macOS and Linux installations.
2. An existing `GBlockParty Chromux` profile, which preserves installations
   that have only the renamed profile.
3. The stable `chromux` path for a clean installation.

Quit every running copy of Chromux, install or launch v0.63.1 or newer, and
reopen it. Recovery is automatic; do not move or delete either profile first.
When both exist, `chromux` wins deliberately because it is the original stable
profile. The usual locations are:

- macOS: `~/Library/Application Support/chromux` and
  `~/Library/Application Support/GBlockParty Chromux`
- Linux: `$XDG_CONFIG_HOME/chromux` and
  `$XDG_CONFIG_HOME/GBlockParty Chromux` when `XDG_CONFIG_HOME` is set;
  otherwise use the same directory names under `~/.config`
- Windows: `%APPDATA%\chromux` and `%APPDATA%\GBlockParty Chromux`

Preferences stored separately in `~/.chromux/preferences.json` are unaffected.
Explicit `--user-data-dir` launches and smoke tests intentionally keep their
chosen isolated profiles. If settings still appear missing, back up both app
profile directories before changing either one and confirm the desired
profile's `Local Storage` directory exists.

## Saved project cannot start

Chromux enables **START PROJECT** only when the directory exists, contains a readable `package.json`, and
the selected script still exists. The runner comes from `packageManager` or a recognized lockfile, falling
back to npm. Started server URLs remain in the review queue until explicitly opened. Delete
`~/.chromux/projects.json` while Chromux is closed to clear saved projects; malformed or stale entries are
ignored safely.

## Project creation fails

- Confirm **Settings → Projects Root** is an absolute path in the active
  runtime. On Windows it must be a canonical Linux path such as
  `/home/me/projects`, and each WSL distribution has its own value.
- Names must use lowercase letters, numbers, and hyphens, without leading or
  trailing hyphens. Clone mode can derive the name from the repository URL.
- An existing destination is never reused or overwritten. Choose another name
  or move the existing directory yourself.
- Fresh and clone creation require Git in the active runtime. Clone
  authentication and network errors are reported from Git.
- Chromux removes only its uniquely named staging directory after a creation
  failure. A warning after **CREATED** means the repository is valid but
  `p_history`, completion-cache invalidation, or `P_NP_HOOK` failed.

This guide covers the first local loop: terminal output opens a paired browser preview, browser evidence becomes a capture payload, and delivery runs through `claude -p`.

## Preview detection

Chromux watches complete terminal lines from each session. It auto-detects:

- `http://` or `https://` URLs on `localhost`, `127.0.0.1`, `0.0.0.0`, or `[::1]`
- loopback URLs with a port, such as `http://localhost:5173`
- loopback URLs with a path, such as `http://localhost/app`
- absolute local `.html` or `.htm` paths that exist on disk

`0.0.0.0` and `[::1]` are normalized to `localhost` before loading in the browser pane. Bare `http://localhost` is ignored because it is too easy to match accidentally.

If a preview did not open:

1. Reprint the full URL on one line in the paired terminal.
2. Make sure the URL includes a port or path.
3. Paste the URL into the pane's URL bar as a manual fallback.
4. Check the pane's QUEUE badge; if the pane was already showing another page, the new URL waits there instead of replacing the current page.

If the same URL is printed again, Chromux refreshes the pane instead of adding a duplicate queue item.

To distinguish fixture/server trouble from preview-routing trouble, run the
durable local fixture from `prototype/`:

```sh
PORT=0 npm run fixture:localhost-first-success
```

Copy the emitted `Local: http://localhost:<port>/` URL and check
`http://localhost:<port>/healthz`. If health succeeds but QUEUE stays empty,
reprint the complete canonical `Local:` line in the originating Chromux
session. If health fails, stop any stale fixture process and restart it; the
server reports an occupied port and exits instead of silently choosing another
port.

## File previews

Chromux detects absolute `.html` and `.htm` paths only after confirming the file exists. The resulting preview loads through `file://`.

For terminal link clicks, Chromux resolves HTML paths against the live PTY directory,
the session launch directory, and the Git/project root. If those do not resolve, a
repository-wide filename/suffix match opens only when it is unique. Ambiguous matches
open the project HTML explorer prefiltered to the filename instead of guessing.

If a file preview did not open:

1. Click **⌕** to open the HTML explorer rooted at the session's Git root (or launch directory).
2. Filter by filename, browse folders containing HTML descendants, and use **REFRESH** after generating a file.
3. Confirm the path stays inside the project and ends in `.html` or `.htm`; dependency/cache/VCS trees and outside symlinks are excluded.
4. Paste absolute, home-relative, live-terminal-relative, launch-relative, or project-relative paths into the URL bar. Spaces and `#` characters are encoded when the file opens.

## Paired browser tabs

Terminal HTTP(S) links, queue **OPEN**, favorites, and explorer file selections
create or focus a page tab in the originating session. Exact normalized URLs are
deduplicated. A typed web URL navigates the active page tab, or creates one from
the explorer/blank state. Closing the active tab chooses its nearest neighbor;
closing the last tab returns to the blank preview.

Back, reload, favorite, console, picker, and capture controls always target the
active page tab. Page tabs in one session share cookies/storage, while different
terminal sessions remain isolated.

## Review queue

Chromux never auto-opens a preview. Terminal localhost / loopback / local
`.html` hits are deduplicated within the current agent turn and promoted at an
actionable or completion boundary; starting another turn clears stale
candidates. Codex uses its completion callback. If no hook signal is available,
a short delayed browser-only fallback preserves ordinary dev-server discovery.
Terminal fallback records appear only in the paired browser QUEUE, not Threads,
session-tab badges, or tab-group attention. Explicit MCP/OSC requests and page
popups remain attention-visible. Opening a queued or favorite URL
creates/focuses a page tab and restores the browser if it was shut.

For intentional agent routing, prefer `chromux_browser_queue_add` from the
registered Chromux MCP server. It must run inside the originating Chromux
session so `CHROMUX_SESSION_ID` and `CHROMUX_SIGNAL_TOKEN` are available. If the
tool reports that Chromux is not running, open the app; if it reports a missing
or exited session, retry from a live Chromux terminal. Wrong-session/token
claims, credential-bearing URLs, unsupported protocols, overlong values, and
missing/non-file local targets are rejected.

Use QUEUE to open the next preview intentionally. Command-J reveals and focuses the next queued OPEN button without opening it. If a page seems stale, check whether the updated URL is waiting in QUEUE.

Loopback rows briefly show **CHECKING…**, then **READY** or **SERVER OFFLINE** after a bounded TCP-only check. Chromux does not make an HTTP request during this check. Use **RECHECK** after starting a server manually. If the row is offline, **START SERVER…** reads only validated scripts from the originating session directory's `package.json`; it recommends `dev`, `start`, `serve`, then `preview`, or waits for an explicit script selection. The selected script runs in a visible, non-focused shell tab labeled `<project> dev server`. Chromux polls for up to 15 seconds, but still requires **OPEN** before browser navigation. If startup times out, inspect the server shell's logs and recheck the row.

When a loopback page tab fails to connect, Chromux keeps the failed tab and returns its URL to QUEUE as **SERVER OFFLINE**. Fix or start the server, then press **OPEN** to retry that existing tab. Navigation-cancel events do not create queue rows, and a successful load removes the matching failure row.

New sessions start with the paired browser shut so the terminal owns the workspace. Use the browser rail's BROWSER control (or Command-Shift-B) to open it, and COLLAPSE / Command-Shift-B again to shut it. Toggle does not clear URL, queue, or capture state.

## Favorites

Use the star beside the URL bar to pin the current page, or `PIN` on a review
queue row. Favorites are global in v1: every session shows the same list, and
choosing one opens it in whichever session is active. Opening a favorite also
restores that session's paired browser if it was shut.

Chromux stores at most 200 favorites in `~/.chromux/favorites.json`. It accepts
only `http:`, `https:`, and `file:` URLs, removes fragments such as `#section`
before deduplication, and safely treats a missing or malformed file as an empty
list. To reset the list, quit Chromux and delete `~/.chromux/favorites.json`.

## Screenshots

Capture tries to save the visible viewport as `screenshot.png` next to the YAML payload. Screenshot failure does not cancel the capture. The payload is still written and `screenshot.mode` becomes `unavailable`.

If screenshots are missing:

1. Retry after the page finishes loading.
2. Make sure the browser pane is showing the page you meant to capture.
3. Use the payload path shown in the capture modal; the YAML is still usable without the image.

## Local MCP screenshots and recordings

The four capture tools are macOS-only in Chromux 0.65:

- `chromux_capture_targets_list`
- `chromux_capture_screenshot`
- `chromux_record_start`
- `chromux_record_stop`

Keep Chromux open before calling them. The capture bridge intentionally does not
launch the app; “Chromux is not running” means open it and retry. Each screenshot
or recording opens an in-app approval dialog. A denial, Escape, or 30 seconds
without an answer rejects that request. The page URL remains hidden until a
paired-browser screenshot is approved.

For first use, macOS may ask for Screen & System Audio Recording access after
you choose **ALLOW ONCE**. If video capture is denied, enable Chromux under
**System Settings → Privacy & Security → Screen & System Audio Recording**, then
quit and reopen Chromux if macOS requests it. Chromux never asks for microphone
capture. If loopback audio is unavailable, recording continues visibly as
`AUDIO: UNAVAILABLE`; this is expected video-only fallback, not a failed video
recording.

Only one recording can run at a time. The red HUD must remain visible until the
recording is persisted. Stop it from that HUD or through
`chromux_record_stop` from the same MCP client that started it. It also stops on
the 60-second deadline, requesting-client disconnect, window close, or app
shutdown. A repeated stop returns the completed artifact.

Generated resource links use `chromux://capture/...` and can be read through MCP
`resources/read`; they are not ordinary web URLs. A recording returns the WebM
link plus a directly viewable contact-sheet image. If a resource read fails,
confirm the capture directory still exists and use the exact URI from the tool
result. Chromux rejects edited paths, traversal, symlinks, files absent from the
manifest, and files over the read limit.

## Console logs

Chromux records browser console messages seen by the pane after it opens. Capture includes the last 50 entries, and each message is capped at 500 characters. The payload reports `console.total_captured`, `console.included`, and whether entries were truncated.

If the expected log is not in the payload:

1. Reproduce the issue after the pane is open.
2. Check the console chip in the pane header for the current log count and error count.
3. Capture soon after reproducing; older messages drop out of the 50-entry tail.
4. Add important missing context in the capture note before delivery.

## CLI auth and delivery

`SEND - claude -p` starts a one-off `claude -p` through your login shell in the target directory. Finder-launched app builds use the same login-shell PATH behavior as the terminal PTYs.

If delivery fails:

1. Run `claude -p` in Terminal and confirm it is installed and authenticated.
2. Check the capture modal for the exact manual retry command.
3. Use FILE-DROP ONLY if you want to save the payload without sending it.
4. Open DELIVERY LOG from the status bar to inspect prior attempts.

Every capture is written before delivery, so a failed send does not lose the payload.
The controlled failure-to-recovery proof and its exact artifact checks are
archived in
[`capture-delivery-recovery-uat-0.69.4.md`](../../docs/testing/capture-delivery-recovery-uat-0.69.4.md).

## Wrong-session routing

The capture modal target defaults to the paired session and can send to another session or one-off
`claude -p`. The full-browser Composer separately defaults to the paired live session every time it
opens and does not remember a prior routing target.

If evidence went to the wrong place:

1. Check the target selector in the capture modal before sending.
2. In full-browser mode, verify the Composer **TARGET** immediately before sending. A successful send
   reports `Sent to <session>` without switching away from the source browser.
3. Confirm the target cwd shown in the modal or session tab.
4. If routing is blocked, use **SWITCH TO TARGET** and clear its unsubmitted Composer draft or pending
   terminal input. Exited and removed targets cannot receive new input. The source draft and attached
   evidence remain staged after every blocked or cancelled attempt.
5. For DETECT rows, remember that RESUME opens one inferred latest saved conversation for the exact project directory. Codex rows use the newest interactive CLI thread by `recency_at`; the displayed Codex name and latest-agent excerpt describe that inferred thread but do not correlate it to a particular live process. Two live agents in the same directory therefore remain indistinguishable. If the installed Codex does not support the required app-server methods, Chromux preserves the same resume identity through its bounded `~/.codex/sessions` rollout fallback and shows the legacy terminal/directory label.
6. For external terminal adoption, DETECT is read-only: it starts a new Chromux PTY from the detected cwd or saved session; it does not attach to the original terminal tab.

If DETECT rows are missing tab titles, grant Chromux Automation access to Terminal and iTerm2 in System Settings, Privacy & Security, Automation. The `ps` and `lsof` scan can still find processes without tab-title access.

Codex thread names, first-user previews, and latest-agent excerpts are read locally through a short-lived `codex app-server --stdio` process. Labels are capped at 80 Unicode code points, excerpts at 160, and both are retained only in the active DETECT scan. App-server errors, malformed responses, or the four-second enrichment deadline do not fail DETECT or remove RESUME.

## Storage cleanup

Chromux stores local artifacts under your home directory:

| Data | Location |
| --- | --- |
| Capture payloads, screenshots, recordings, manifests, and contact sheets | `~/.chromux/captures/<timestamp>-<unique-suffix>/` |
| Delivery log | `~/.chromux/delivery-log.jsonl` |
| Global favorites | `~/.chromux/favorites.json` |
| Git repository catalog | `~/.chromux/git-repositories.json` |
| Vercel credentials, mappings, and non-secret job history | `~/.chromux/vercel-credentials.json`, `~/.chromux/vercel-projects.json`, `~/.chromux/vercel-jobs.json` |
| Restore and inbox triage state | `~/.chromux/restore-sessions.json` |
| Hook settings and notify scripts | `~/.chromux/` |
| Renderer settings | `Local Storage` inside the selected stable Electron app profile |
| Browser profiles | Session-specific Electron partitions `persist:chromux-<session ID>` |
| Capture control socket | `~/.chromux/capture-control.sock` while the app is running |

Closed-session browser profiles and exact stale
`signal-<24 lowercase hex>.json` files are reclaimed automatically the next
time Chromux launches. Cleanup runs before the first window is created and is
best-effort: an unreadable entry is reported without blocking startup or other
eligible entries. Unrelated partitions, malformed names, ordinary partition
files, top-level symlinks, nonmatching signal files, captures, delivery history,
restore snapshots, prompt history, and agent-owned directories are not removed.

Chromux does not currently expire capture directories. To reclaim disk space, delete old directories under `~/.chromux/captures/`. To clear delivery history, delete `~/.chromux/delivery-log.jsonl`.

## Vercel shipping stopped or needs recovery

Reopen **VERCEL · READY** in any session under the mapped repository. A changed
root, connection, project ID, trigger, branch, or Git status invalidates the old
review; choose **SHIP** again. Detached HEADs and unresolved conflicts are
blocked. Chromux does not pull or resolve divergence automatically.

If a commit hook fails, fix the hook failure and review again. If the commit
succeeded but push failed, Chromux keeps the commit SHA and offers a push-only
retry only while `HEAD` still matches. It never deletes or rolls back that
commit. If a hook left additional changes after committing, review those
changes before any push.

**CANCEL MONITORING** does not cancel a remote Vercel deployment or undo Git.
Use **RETRY MONITORING** to resume SHA discovery or inspect the same URL. After
restart, jobs with a verified commit SHA or deployment URL resume automatically;
an interruption before either identity existed requires a fresh review.

If **SIGN IN WITH VERCEL** reports that OAuth is not configured, use an existing
Vercel CLI login or encrypted personal token. Public OAuth builds require the
registered callback `http://127.0.0.1:47891/vercel/oauth/callback`; another
process occupying port 47891 prevents sign-in and is reported without opening
the browser.

The opt-in localhost first-success UAT is an exception to normal retention: it
uses an isolated temporary `CHROMUX_HOME_DIR`, records only sanitized artifact
existence/size metadata in its report, then removes the temporary profile and
capture directory. It never deletes captures from the normal Chromux home.

Do not delete a capture directory until you no longer need its payload,
screenshot, recording, contact sheet, or manifest for manual retry or audit.

### Resource broker unavailable or stuck

Open **RESOURCES** and use **REFRESH** first. The daemon normally starts on demand at `~/.chromux/resource-broker.sock`. If MCP tools are missing, run `/mcp` in Codex and follow the registration steps in [`resource-broker.md`](resource-broker.md). A queued request advances automatically when its owner releases, disconnects, or reaches TTL. Use **FORCE RELEASE** only after confirming the displayed owner is stale; it cannot stop an operation that already escaped the wrapper.

## Manual retry reference

From a capture directory:

```sh
claude -p "$(cat payload.yaml)"
```

From another directory:

```sh
cd /path/to/project
claude -p "$(cat /Users/me/.chromux/captures/<timestamp>-<unique-suffix>/payload.yaml)"
```

See [capture-payload.md](capture-payload.md) for the YAML schema and field limits.
See [privacy-and-local-data.md](privacy-and-local-data.md) for the complete local-data map, outbound boundaries, and cleanup guidance.

## A thread's attention reason is missing or marked legacy

Use the rail's **Threads** icon for the always-visible **Action Required**,
**Ready to Finish**, **Working**, and **All Sessions** sections. Open a card by
selecting its header or pressing Enter/`o`. The clock icon (or `s`) temporarily
Snoozes any reason. The × icon (or `d`) Dismisses only supported reasons; it is
intentionally absent for permission, authentication, conflict, rate-limit,
tool-failure, and Queue reasons. Arrow icons appear only for specialized Queue,
Git, or system actions. A new turn, changed attention sequence, changed Git
status, or expired snooze reopens the matching item. Existing saved Done
records remain honored until their reopen token changes, but new Done records
are not created. Permission, authentication, input, conflict, rate-limit,
tool-failure, and delivery failures remain urgent. Completed turns, queued
previews, uncommitted changes, unpublished branches, and outgoing commits
appear in Ready to Finish.

**Git Changes** reads the bounded repository catalog rather than only live
sessions. If a repository is missing, open a session anywhere inside it. If it
should no longer appear, choose **Forget**; this removes catalog metadata only.
The review drawer intentionally does not offer discard/reset, force push,
rebase, worktree pruning/removal, branch deletion, stash mutation, or
partial-hunk staging.

Remote actions set `GIT_TERMINAL_PROMPT=0`. Authentication failures therefore
return immediately instead of opening a hidden prompt. Authenticate with the
provider in a terminal, then explicitly retry. Pull and Sync use fast-forward
only; divergence or conflicts are surfaced for manual resolution. Commit
failures include bounded hook output, and a changed staged state invalidates
the prior commit preview.

Chromux regenerates its classifier and installed hook files at startup. New v2
events are authenticated to one PTY; copied terminal output, callbacks from a
different session, and stale or duplicate callbacks are intentionally rejected.
If classifier installation fails, Claude, Codex, and Grok use the existing v1
adapter where it can be written, otherwise that agent launches uninstrumented—a
command is never launched with a missing helper path. Existing user settings and
configs are not replaced: Claude receives an additional `--settings` file,
Codex receives a launch-scoped `notify` value, and Grok uses its global hook
discovery file, which no-ops outside Chromux.
