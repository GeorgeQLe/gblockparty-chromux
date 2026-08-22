# Privacy and update data

Chromux Next contacts only public HTTPS release endpoints: repository releases
and assets, the official OpenAI Codex GitHub release, Homebrew cask metadata,
and npm package metadata when that install kind is detected.

Requests contain no workspace content, transcript, thread ID, draft,
credential, or local path. Codex authentication and configuration are not read
or changed. Duplicate Codex startup-update prompting is disabled only in
Chromux-owned subprocess environments.

## GBlockParty fleet privacy

Fleet integration is disabled unless `CHROMUX_NEXT_GBP_FLEET=1`. When enabled,
the main process connects to the configured GBlockParty control plane and may
hold an optional signed session cookie or bearer token supplied through the
process environment. These values are never persisted by Chromux Next, logged,
included in renderer events, or exposed through preload.

The renderer receives only bounded display names, opaque resource IDs, tool,
status, attention, and availability fields. Absolute host workspace paths and
host-daemon credentials are excluded by the server projection and by the
Chromux Next IPC schema. Terminal output is retained only by xterm's bounded
in-memory scrollback for the open tab; closing the tab detaches without stopping
or deleting the remote session.

The renderer sees bounded versions, progress, sanitized failure categories,
release links, check times, trust state, and blockers. It never sees staging
paths, installer commands, raw payloads, or subprocess output. Downloads are
mode `0600`; private extraction directories are mode `0700`.
