# Chromux privacy and local data

## Windows and WSL2

Windows desktop preferences, restore records, broker state, and captures live
under the Windows user’s `.chromux` directory. Agent processes run inside each
record’s selected WSL2 distribution. Capture payloads contain WSL-readable
paths; Explorer reveal actions use the corresponding Windows or
`\\wsl.localhost` path.

The Windows resource broker uses a user-scoped named pipe. Its WSL MCP wrapper
starts the installed Windows Electron executable in Node mode through WSL
interop. No TCP listener is opened. Agent configuration and authentication are
separate in each distribution.

## Saved projects

Saved project start configurations are stored in `~/.chromux/projects.json`. Each record contains a
display name, absolute project directory, `package.json` script name, detected package runner, and derived
start command. Chromux revalidates the directory and script against the current `package.json`; it does not
store arbitrary command text and does not sync these paths or commands.

## Project creation

The **Create Project** launcher reads `~/.config/p/categories.conf` and the
`P_BASE`, `XDG_CACHE_HOME`, and `P_NP_HOOK` environment values from the active
host or WSL runtime. It creates only a validated destination inside the active
runtime's configured Projects Root. Projects Root preferences live in
`~/.chromux/preferences.json`, with separate entries for the host and each WSL
distribution.

Fresh creation runs local Git initialization. Clone creation passes the entered
repository location directly to `git clone`, so Git and the selected remote may
make network requests and apply their own authentication and retention rules.
After success, Chromux updates `p`'s local `p_history`, invalidates its two
completion caches, and may execute the user-configured `P_NP_HOOK`. That hook is
outside Chromux's control and may read files, modify other systems, or use the
network. A hook, history, or cache failure produces a visible warning and does
not roll back the created repository.

This document describes the current Chromux prototype. It is a product data
handling notice, not a legal privacy policy, compliance certification, or legal
advice.

Use this page as the boundary for public trust claims. Accurate current claims
are:

- Chromux is a local-first desktop prototype.
- Chromux has no Chromux-hosted account, cloud sync, capture upload, or product
  telemetry in the current prototype.
- Captures are written to local files before delivery.

Do not claim that "nothing leaves the machine", "private by default", "secure",
or "GDPR/CCPA compliant". Browser pages, update checks, agent CLIs, and
`SEND - claude -p` can all create outbound network activity.

## Design Principles

Chromux's local-data behavior should stay aligned with common privacy and data
security practice:

- Be transparent about what data exists, where it lives, why it exists, and
  when it may leave the machine.
- Collect only data needed for the browser-to-agent evidence loop.
- Prefer inspectable local files over opaque app databases for capture evidence.
- Make delivery explicit: file-drop stays local; `claude -p` delivery sends the
  reviewed payload through the user's configured Claude CLI.
- Keep retention and deletion understandable, even when the current prototype
  has no automatic cleanup.
- Avoid broad privacy or security claims until the implementation and docs prove
  them.

These principles follow the shape of FTC data security guidance, CCPA/CPRA-style
notice concepts, UK GDPR/GDPR principles, and the NIST Privacy Framework:
inventory data, minimize what is collected, protect what is kept, disclose
retention and sharing, and dispose of data that is no longer needed.

## Quick Boundary

| Boundary | Current behavior |
| --- | --- |
| Chromux account | None. |
| Chromux-hosted backend | None. |
| Product telemetry | None in the current prototype. |
| Cloud sync | None. |
| Capture upload by Chromux | None. Captures are local files unless the user delivers them. |
| Local MCP capture | macOS only. Every screenshot or recording requires a visible one-time approval in Chromux. |
| Update checks | Yes. Chromux checks GitHub Releases for newer versions. |
| Browser network traffic | Yes. Pages loaded in the embedded browser behave like normal Chromium pages. |
| Agent network traffic | Yes. Claude Code, Codex, Grok Build, shell commands, and `claude -p` use their own network behavior and account settings. |

## Local Data Inventory

### Stable Electron app profile

Production Chromux launches choose the Electron app profile explicitly instead
of deriving it from `productName`, the executable name, or other display
metadata. The preferred profile directory is `chromux` under the platform app
data directory: `~/Library/Application Support/chromux` on macOS,
`$XDG_CONFIG_HOME/chromux` on Linux when `XDG_CONFIG_HOME` is set (otherwise
`~/.config/chromux`), and `%APPDATA%\chromux` on Windows.

To recover settings after the product display name changed, Chromux first reuses
an existing `chromux` profile. If that directory does not exist but an existing
`GBlockParty Chromux` profile does, Chromux reuses the latter so newer-only
installations retain their data. A clean installation uses `chromux`. This
selection is made before Electron creates a window or session and remains
independent of future display-name changes. Explicit `--user-data-dir` launches
and isolated smoke-test profiles are not replaced by this production policy.

| Data | Trigger | Local location | Retention | Outbound behavior |
| --- | --- | --- | --- | --- |
| Capture payloads | User clicks `CAPTURE`, completes element picking, chooses `ATTACH CURRENT PAGE`, or refreshes a staged attachment. | `~/.chromux/captures/<timestamp>-<unique-suffix>/payload.yaml` | Never auto-deleted by Chromux. | Sent only when the user chooses `SEND - claude -p` or submits a routed Composer prompt that explicitly includes the staged reference; file-drop and New-session draft staging remain local until later submission. |
| Screenshots | A user capture attempts to save the visible browser viewport, or an MCP client requests and the user approves a paired-browser or whole-Chromux screenshot. | `~/.chromux/captures/<timestamp>-<unique-suffix>/screenshot.png` when available. | Never auto-deleted by Chromux. | Chromux itself does not upload the image. An approved MCP response returns the image bytes and a local `chromux://capture/...` resource link to the requesting same-device client. |
| Window recordings | A local MCP client requests the Chromux window and the user chooses **ALLOW ONCE**. | One private artifact directory containing `recording.webm`, `contact-sheet.png`, and `manifest.json` under `~/.chromux/captures/`. | Never auto-deleted by Chromux. Recordings stop at 60 seconds or sooner on user/requester stop, requester disconnect, window close, or app shutdown. | Chromux opens no upload or network listener. The requesting same-device MCP client receives local resource links and the contact-sheet image. |
| Capture console tail | Browser console messages seen by the pane after it opens. | Included inside `payload.yaml`; also held in renderer memory while the pane is open. | Persisted only as part of a saved payload. In-memory state disappears when the session closes. | Sent with `SEND - claude -p` because it is part of the YAML payload. |
| Selected element data | User selects an element with `PICK ELEMENT`. | Included inside `payload.yaml`. | Persisted only as part of a saved payload. | Sent with `SEND - claude -p` because it is part of the YAML payload. |
| User capture notes | User types a note in the capture modal. | Included inside `payload.yaml` and the delivery prompt. | Persisted only as part of a saved payload. | Sent with `SEND - claude -p`. |
| Delivery log | User sends a payload or chooses file-drop. | `~/.chromux/delivery-log.jsonl` | Appended indefinitely until the user deletes it. | Not sent by Chromux. |
| Restore snapshot | App close, managed update, or Developer Mode restart stores reopen state, including each agent tab's validated provider conversation ID, last deliberate activity time, optional custom tab-group membership, prior active/last-active-in-group state, ordered page-tab URLs/titles, active page or project-explorer path/query, an optional bounded Composer draft, staged local capture references, whether the full-browser Composer drawer was open, and up to 20 session-scoped Needs Attention records (type, detail up to 4 KiB, occurrence time, and identifier). Routing targets are runtime-only. Browser queue entries remain in their existing queue field; chat messages, console buffers, capture contents, cookies, global favorites, custom-group definitions, and global update status are not included. | `~/.chromux/restore-sessions.json` | One schema-v9 snapshot file is overwritten by later snapshots and marked consumed after restore; it is not auto-deleted. Schemas v1-v8 remain readable with empty routed-Composer state; schemas v1-v6 use the snapshot save time as shared legacy activity. The unshipped schema-v9 `chatOpen` field is read as a drawer-open fallback, while old `chatMessages` are discarded. | Not sent by Chromux. Draft text and local evidence references reach an agent only if the user later submits them to the terminal or invokes another delivery path. |
| Prompt history | A successful composer submission. | `~/.chromux/prompt-history.json` | Atomically replaced with mode `0600`; exact prompts are deduplicated, up to 100 remain per canonical project directory, and the complete file is capped at 5 MiB by evicting globally oldest entries. Individual and per-project deletion are available in **HISTORY**. | Chromux does not sync or separately send the file. Submitted prompts still pass to the selected agent CLI or shell and follow that tool's network and retention behavior. |
| Global favorites | User pins the current paired-browser page or a queued document/URL. | `~/.chromux/favorites.json` | Atomically replaced after each change; up to 200 entries remain until unpinned or the file is deleted. | Not synced or sent by Chromux. Opening a favorite can cause ordinary browser network traffic. |
| Renderer preferences | User chooses a theme, Light or Dark mode, rail mode, Threads Recent/A–Z order, tab activity indicators, thread-preview size, session grouping, or custom tab-group definitions/order. | Chromium-managed Local Storage inside the selected stable Electron app profile described above. | Validated selections remain until changed or the app profile is cleared. Custom groups are bounded to 100 definitions with names of 1–80 characters. | Not synced or sent by Chromux. |
| Agent hook files | Chromux starts and writes local hook helpers. | `~/.chromux/signal-classifier.js`, `~/.chromux/signal-*.json`, `~/.chromux/hooks-claude.json`, `~/.chromux/codex-notify.sh`, `~/.chromux/hooks-grok.json`, `~/.chromux/grok-hook.sh`, and `~/.grok/hooks/chromux-turn-signals.json` | Helpers are rewritten at startup. Exact regular files named `signal-<24 lowercase hex>.json` are removed on the next launch; malformed names, directories, and symlinks are retained. | Not sent by Chromux. Hook JSON is bounded, classified locally, and emitted into the owning PTY with a per-session random authentication token. Claude/Codex paths are passed at launch; Grok discovers its global hook, which no-ops outside Chromux. |
| Update cache | Startup or manual update check. | `~/.chromux/update-cache.json` | Rewritten after valid release results; non-manual checks reuse those results for one day. Transient request failures are not cached, and legacy cached network errors are ignored so the next check retries immediately. | GitHub receives the update-check request. If the Releases API request fails, Chromux may also request GitHub's public latest-release redirect. Capture data and project paths are not included in either request. |
| Update source | `npm run install-app` records the local install source. | `~/.chromux/update-source.json` | Kept until deleted or overwritten by a later install. | Not sent by Chromux. |
| Update install log | Managed update install runs from the recorded source. | `~/.chromux/update-install.log` | Overwritten by each managed install attempt. | Not sent by Chromux. |
| Browser profiles | All page tabs paired to one terminal session share one randomly identified persistent Electron partition; different terminal sessions use different partitions. | Chromium-managed Electron app data for the Chromux app, outside `~/.chromux`. | Closed-session Chromux partitions are removed on the next launch, before any new window or session is created. Unrelated partitions and symlinks are retained. | Pages loaded in each browser can make their own network requests and store isolated cookies/local storage/cache. |
| Project HTML index | Opening/searching the HTML explorer walks the session Git root or launch directory and records relative `.html`/`.htm` paths in renderer memory. VCS, dependency/cache trees, directory symlinks, and targets outside the project are excluded. | In memory only. Explorer path/query may be included in the restore snapshot. | Rebuilt on refresh or restart. | Not sent by Chromux. |
| Resource broker | Unix socket, singleton lock, and lease-recovery state under `~/.chromux/resource-broker.*`. | Client display names, process/session IDs, resource IDs, lease timing, and simulator capacity override. | Active state is replaced locally; the socket and lock exist only while the daemon runs. | The broker opens no network listener. Simulator actions explicitly requested through MCP invoke local `xcrun simctl`. |
| Capture control | User-only socket at `~/.chromux/capture-control.sock` while Chromux is running. | The registered MCP caller identity, pending one-time approval, and active recording state. | Socket and pending state end with the app; completed artifacts follow the capture retention rule above. | No TCP or network listener is opened. The MCP bridge does not auto-launch Chromux. |
| External terminal detection metadata | User clicks `DETECT`. | Read from local process tables, cwd lookup, Terminal/iTerm tab titles, and local agent session metadata. For Codex, a short-lived `codex app-server --stdio` process may return the newest exact-cwd interactive CLI thread's bounded name/first-user preview and latest-agent excerpt; older/incompatible versions fall back to the bounded `~/.codex/sessions` rollout index. | Detection results are runtime UI state. Codex labels are capped at 80 Unicode code points and latest-agent excerpts at 160; excerpts are discarded with the active scan and are not added to restore snapshots or other Chromux storage. Opening a session can persist the chosen launch name and validated provider conversation ID through the ordinary restore path. | Not sent by Chromux. Codex metadata remains subject to the Codex CLI's own local-data behavior. |
| Terminal output preview hints | Session terminal prints localhost URLs or local HTML paths. | Held in renderer memory for preview routing; queued URLs may be stored in `restore-sessions.json`. Loopback liveness, probe timers, launcher state, and server-shell relationships remain runtime-only and are reprobed or discarded after restart. | In-memory unless the existing queue fields are saved in a restore snapshot. | Liveness checks make TCP connections only to validated local loopback ports; they do not make HTTP requests or contact remote hosts. |

## Capture Payload Contents

See [capture-payload.md](capture-payload.md) for the versioned YAML schema and
field bounds. In v1, a payload can contain:

- capture timestamp;
- Chromux session id and name;
- project path or target cwd;
- page URL and title;
- visible page text capped at 24 KiB, with truncation declared;
- selected element selector and bounded `outer_html`;
- last 50 browser console messages, with each message capped;
- screenshot path and screenshot availability;
- delivery adapter and target;
- user note.

These fields may include sensitive project data, local file paths, private
localhost URLs, DOM text, error messages, tokens accidentally printed to the
console, or visual information in screenshots. Inspect the payload before
sending it to an agent.

## Local MCP Screenshots And Recordings

The MCP target list exposes opaque target IDs, labels, and screenshot/recording
capabilities. It does not expose a paired page URL. For every capture, Chromux
shows the requesting client identity, target, and capture type with **ALLOW
ONCE** and **DENY**. Unanswered requests time out as denied, approvals are not
remembered, and approval occurs before any macOS capture permission prompt.

Paired-browser screenshots include the approved PNG plus the existing URL,
title, bounded visible text, console tail, and YAML evidence bundle. Whole-window
screenshots include the Chromux window image and capture metadata. Recording is
limited to the Chromux window, 1280×720, 15 fps, and 60 seconds. A red HUD keeps
the requester, elapsed time, audio state, and **STOP** action visible throughout.

Chromux requests macOS system-loopback audio, never microphone audio. If system
audio is denied, unsupported, or starts without a usable track, capture continues
as video-only and the HUD, manifest, and MCP result say `audio: unavailable`.
macOS may separately require Screen & System Audio Recording permission in
System Settings. Other platforms return an explicit unsupported-platform result
in this release.

Artifact directories use mode `0700` and artifact files use mode `0600` on
POSIX systems. MCP resource reads accept only generated
`chromux://capture/<artifact-id>/<manifest-file>` links beneath the capture
directory; arbitrary filesystem paths, symlinks, traversal, and oversized reads
are rejected.

## Outbound Activity

Chromux has no product telemetry in the current prototype, but the following
outbound paths exist.

### Embedded Browser

The paired browser is Chromium. Pages loaded in it can make normal page network
requests, set cookies, use local storage, and load third-party resources. Chromux
does not add network telemetry capture in v1, but the page itself behaves like a
browser page.

### GitHub Update Checks

By default, Chromux checks:

```text
https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest
```

The request uses a `GBlockParty-Chromux` user agent and asks GitHub for release
metadata. The request does not include capture payloads, screenshots, delivery
logs, browser profile data, project paths, or terminal output. GitHub may still
receive ordinary request metadata such as IP address and headers.

### Agent CLIs

Chromux launches Claude Code, Codex, or shell sessions through the user's login
shell. Those tools keep their own authentication, network behavior, logs, and
provider-side policies. Chromux does not rewrite or proxy those CLIs.

#### Grok Build / xAI warning

Security researchers reported in July 2026 that Grok Build sent whole repository
bundles to xAI-controlled infrastructure, potentially including files, Git
history, secrets, and other material beyond the code needed for a task. The
published findings are version-specific, and provider behavior and controls can
change independently of Chromux. Treat Grok Build as capable of transmitting the
codebase it can access.
Before using Grok with proprietary, regulated, or sensitive code, review xAI's
current data controls and consult a cybersecurity or data-security professional.

Chromux displays this warning whenever Grok Build is selected for a new session
or opened from a tab context menu. Grok launch controls stay disabled until the
user explicitly acknowledges the warning for that session; the acknowledgement
is reset for the next Grok launch. Chromux cannot verify, limit, or audit what
the separately installed Grok CLI sends after launch.

Sources and current provider guidance:

- [Reproducible wire-level analysis of Grok Build 0.2.93](https://gist.github.com/cereblab/dc9a40bc26120f4540e4e09b75ffb547), including captured artifacts, checksums, limitations, and reproduction steps.
- [Open reproduction harness and downloadable evidence](https://github.com/cereblab/grok-build-exfil-repro) for independently testing the version-specific finding with fake canary data.
- [Independent report summarizing the repository-upload findings](https://sourcefeed.dev/a/grok-build-quietly-uploads-entire-repos-to-gcs).
- [xAI's current privacy policy](https://x.ai/legal/privacy-policy).

### `SEND - claude -p`

When the user chooses `SEND - claude -p`, Chromux starts a one-off `claude -p`
process in the target project directory and sends a prompt containing the YAML
payload text, the local payload path, and the user's note. That transfer is
handled by the user's installed Claude CLI and account configuration. Chromux
does not control Anthropic or Claude retention, training, logging, or policy
behavior.

### `FILE-DROP ONLY`

`FILE-DROP ONLY` writes the payload and delivery-log entry locally. It does not
invoke `claude -p`.

## Deletion And Cleanup

Chromux does not currently offer automatic retention windows or a one-click
privacy reset. Delete local files manually when they are no longer needed.

Review paths before running destructive commands.

```sh
rm -rf ~/.chromux/captures
rm -f ~/.chromux/delivery-log.jsonl
rm -f ~/.chromux/restore-sessions.json
rm -f ~/.chromux/prompt-history.json
rm -f ~/.chromux/favorites.json
rm -f ~/.chromux/update-cache.json
rm -f ~/.chromux/update-source.json
rm -f ~/.chromux/update-install.log
rm -f ~/.chromux/hooks-claude.json
rm -f ~/.chromux/codex-notify.sh
```

Do not delete a capture directory until you no longer need its `payload.yaml` or
`screenshot.png` for manual retry, debugging, or audit.

The browser profile is Chromium-managed Electron app data inside the selected
stable app profile for the session-specific `persist:chromux-<session ID>`
partitions. Chromux removes only its
legacy exact partition name, current UUID partition names, and strict renderer
fallback partition names at the next launch. Cleanup does not follow top-level
symlinks or inspect agent-owned `~/.codex`, `~/.claude`, or similar directories.
Quit Chromux before manually deleting broader profile data, and delete only the
Chromux app profile directory, not shared browser or unrelated app data.

## Current Limitations

- Chromux does not encrypt `~/.chromux` files itself. Protection depends on the
  local macOS user account, filesystem permissions, backups, and disk encryption
  such as FileVault.
- Chromux does not redact secrets from screenshots, DOM snippets, console logs,
  local URLs, file paths, or user notes.
- Chromux does not automatically delete old captures or delivery logs.
- Approved MCP recordings can contain everything visible in the Chromux window
  and any audible system output; video-only fallback does not imply visual
  redaction.
- Favorites are not encrypted or synced and may reveal local paths, hosts, or browsing targets to anyone who can read the user's local files or backups.
- Composer drafts, staged browser-context paths, and prompt history are local plaintext and may contain source code, secrets, instructions, or other sensitive text. They are not included in diagnostics or console logs, but remain visible to the local account, backups, and anyone with filesystem access.
- Chromux does not provide a current UI for clearing the browser profile.
- Chromux does not provide enterprise policy controls, audit export controls,
  DPA terms, data residency controls, or managed retention settings.
- Local-first does not mean risk-free. A local file containing secrets is still
  sensitive if the machine, backup, screen share, or user account is exposed.

## Public Claim Guidance

Acceptable public wording after linking this document:

- "Local-first desktop prototype."
- "Captures are inspectable local files before delivery."
- "No Chromux-hosted account, sync, capture upload, or product telemetry in the
  current prototype."
- "Agent delivery uses the user's installed CLI and account configuration."

Avoid public wording that is broader than the implementation:

- "Nothing leaves your machine."
- "Private by default."
- "Secure browser automation."
- "GDPR compliant" or "CCPA compliant."
- "No third-party processing."
- "No network activity."

## References

- [FTC: Start with Security](https://www.ftc.gov/business-guidance/resources/start-security-guide-business)
- [FTC: Protecting Personal Information: A Guide for Business](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business)
- [California DOJ: California Consumer Privacy Act](https://oag.ca.gov/privacy/ccpa)
- [ICO: A guide to the data protection principles](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/)
- [ICO: The right to be informed](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
