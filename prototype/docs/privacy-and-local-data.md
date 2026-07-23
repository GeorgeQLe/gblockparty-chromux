# Chromux privacy and local data

## Saved projects

Saved project start configurations are stored in `~/.chromux/projects.json`. Each record contains a
display name, absolute project directory, `package.json` script name, detected package runner, and derived
start command. Chromux revalidates the directory and script against the current `package.json`; it does not
store arbitrary command text and does not sync these paths or commands.

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
| Update checks | Yes. Chromux checks GitHub Releases for newer versions. |
| Browser network traffic | Yes. Pages loaded in the embedded browser behave like normal Chromium pages. |
| Agent network traffic | Yes. Claude Code, Codex, Grok Build, shell commands, and `claude -p` use their own network behavior and account settings. |

## Local Data Inventory

| Data | Trigger | Local location | Retention | Outbound behavior |
| --- | --- | --- | --- | --- |
| Capture payloads | User clicks `CAPTURE` or completes element picking. | `~/.chromux/captures/<timestamp>/payload.yaml` | Never auto-deleted by Chromux. | Sent only when the user chooses `SEND - claude -p`; not sent by `FILE-DROP ONLY`. |
| Screenshots | Capture attempts to save the visible browser viewport. | `~/.chromux/captures/<timestamp>/screenshot.png` when available. | Never auto-deleted by Chromux. | Chromux includes the screenshot path in the payload. It does not separately upload image bytes, but the receiving CLI/agent may read local files according to its own capabilities and permissions. |
| Capture console tail | Browser console messages seen by the pane after it opens. | Included inside `payload.yaml`; also held in renderer memory while the pane is open. | Persisted only as part of a saved payload. In-memory state disappears when the session closes. | Sent with `SEND - claude -p` because it is part of the YAML payload. |
| Selected element data | User selects an element with `PICK ELEMENT`. | Included inside `payload.yaml`. | Persisted only as part of a saved payload. | Sent with `SEND - claude -p` because it is part of the YAML payload. |
| User capture notes | User types a note in the capture modal. | Included inside `payload.yaml` and the delivery prompt. | Persisted only as part of a saved payload. | Sent with `SEND - claude -p`. |
| Delivery log | User sends a payload or chooses file-drop. | `~/.chromux/delivery-log.jsonl` | Appended indefinitely until the user deletes it. | Not sent by Chromux. |
| Restore snapshot | App close, managed update, or Developer Mode restart stores reopen state, including each agent tab's validated provider conversation ID, last deliberate activity time, ordered page-tab URLs/titles, active page or project-explorer path/query, an optional bounded composer draft, and up to 20 session-scoped Needs Attention records (type, detail up to 4 KiB, occurrence time, and identifier). Browser queue entries remain in their existing queue field; console buffers, captures, cookies, global favorites, and global update status are not included. | `~/.chromux/restore-sessions.json` | One schema-v7 snapshot file is overwritten by later snapshots and marked consumed after restore; it is not auto-deleted. Schemas v1-v6 remain readable and use the snapshot save time as shared legacy activity. Restored completion history clears when its thread is opened, while other restored attention remains until dismissed. | Not sent by Chromux. Draft text is sent only if the user later submits it to the terminal. |
| Prompt history | A successful composer submission. | `~/.chromux/prompt-history.json` | Atomically replaced with mode `0600`; exact prompts are deduplicated, up to 100 remain per canonical project directory, and the complete file is capped at 5 MiB by evicting globally oldest entries. Individual and per-project deletion are available in **HISTORY**. | Chromux does not sync or separately send the file. Submitted prompts still pass to the selected agent CLI or shell and follow that tool's network and retention behavior. |
| Global favorites | User pins the current paired-browser page or a queued document/URL. | `~/.chromux/favorites.json` | Atomically replaced after each change; up to 200 entries remain until unpinned or the file is deleted. | Not synced or sent by Chromux. Opening a favorite can cause ordinary browser network traffic. |
| Renderer preferences | User chooses a theme, Light or Dark mode, rail mode, Threads Recent/A–Z order, tab activity indicators, or thread-preview size. | Chromium-managed local storage for the Chromux renderer. | Validated selections remain until changed or the app profile is cleared. | Not synced or sent by Chromux. |
| Agent hook files | Chromux starts and writes local hook helpers. | `~/.chromux/signal-classifier.js`, `~/.chromux/signal-*.json`, `~/.chromux/hooks-claude.json`, `~/.chromux/codex-notify.sh`, `~/.chromux/hooks-grok.json`, `~/.chromux/grok-hook.sh`, and `~/.grok/hooks/chromux-turn-signals.json` | Rewritten at startup; small per-session correlation records remain local. | Not sent by Chromux. Hook JSON is bounded, classified locally, and emitted into the owning PTY with a per-session random authentication token. Claude/Codex paths are passed at launch; Grok discovers its global hook, which no-ops outside Chromux. |
| Update cache | Startup or manual update check. | `~/.chromux/update-cache.json` | Rewritten after checks; non-manual checks use a one-day cache. | GitHub receives the update-check request. Capture data and project paths are not included in the request. |
| Update source | `npm run install-app` records the local install source. | `~/.chromux/update-source.json` | Kept until deleted or overwritten by a later install. | Not sent by Chromux. |
| Update install log | Managed update install runs from the recorded source. | `~/.chromux/update-install.log` | Overwritten by each managed install attempt. | Not sent by Chromux. |
| Browser profiles | All page tabs paired to one terminal session share one randomly identified persistent Electron partition; different terminal sessions use different partitions. | Chromium-managed Electron app data for the Chromux app, outside `~/.chromux`. | Kept until the user clears or deletes the app profile. | Pages loaded in each browser can make their own network requests and store isolated cookies/local storage/cache. |
| Project HTML index | Opening/searching the HTML explorer walks the session Git root or launch directory and records relative `.html`/`.htm` paths in renderer memory. VCS, dependency/cache trees, directory symlinks, and targets outside the project are excluded. | In memory only. Explorer path/query may be included in the restore snapshot. | Rebuilt on refresh or restart. | Not sent by Chromux. |
| Resource broker | Unix socket, singleton lock, and lease-recovery state under `~/.chromux/resource-broker.*`. | Client display names, process/session IDs, resource IDs, lease timing, and simulator capacity override. | Active state is replaced locally; the socket and lock exist only while the daemon runs. | The broker opens no network listener. Simulator actions explicitly requested through MCP invoke local `xcrun simctl`. |
| External terminal detection metadata | User clicks `DETECT`. | Read from local process tables, cwd lookup, and Terminal/iTerm tab titles; not stored unless the user opens sessions and later saves a restore snapshot. | Detection results are runtime UI state. | Not sent by Chromux. |
| Terminal output preview hints | Session terminal prints localhost URLs or local HTML paths. | Held in renderer memory for preview routing; queued URLs may be stored in `restore-sessions.json`. | In-memory unless saved in a restore snapshot. | Not sent by Chromux. |

## Capture Payload Contents

See [capture-payload.md](capture-payload.md) for the versioned YAML schema and
field bounds. In v1, a payload can contain:

- capture timestamp;
- Chromux session id and name;
- project path or target cwd;
- page URL and title;
- selected element selector and bounded `outer_html`;
- last 50 browser console messages, with each message capped;
- screenshot path and screenshot availability;
- delivery adapter and target;
- user note.

These fields may include sensitive project data, local file paths, private
localhost URLs, DOM text, error messages, tokens accidentally printed to the
console, or visual information in screenshots. Inspect the payload before
sending it to an agent.

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

The browser profile is Chromium-managed Electron app data for the
session-specific `persist:chromux-<session ID>` partitions. The exact macOS path can vary between development
and packaged builds. Quit Chromux before deleting profile data, and delete only
the Chromux app profile directory, not shared browser or unrelated app data.

## Current Limitations

- Chromux does not encrypt `~/.chromux` files itself. Protection depends on the
  local macOS user account, filesystem permissions, backups, and disk encryption
  such as FileVault.
- Chromux does not redact secrets from screenshots, DOM snippets, console logs,
  local URLs, file paths, or user notes.
- Chromux does not automatically delete old captures or delivery logs.
- Favorites are not encrypted or synced and may reveal local paths, hosts, or browsing targets to anyone who can read the user's local files or backups.
- Composer drafts and prompt history are local plaintext and may contain source code, secrets, instructions, or other sensitive text. They are not included in diagnostics or console logs, but remain visible to the local account, backups, and anyone with filesystem access.
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
