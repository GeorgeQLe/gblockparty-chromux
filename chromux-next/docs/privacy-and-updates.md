# Privacy and update data

Chromux Next contacts only public HTTPS release endpoints: repository releases
and assets, the official OpenAI Codex GitHub release, Homebrew cask metadata,
and npm package metadata when that install kind is detected.

Requests contain no workspace content, transcript, thread ID, draft,
credential, or local path. Codex authentication and configuration are not read
or changed. Duplicate Codex startup-update prompting is disabled only in
Chromux-owned subprocess environments.

The renderer sees bounded versions, progress, sanitized failure categories,
release links, check times, trust state, and blockers. It never sees staging
paths, installer commands, raw payloads, or subprocess output. Downloads are
mode `0600`; private extraction directories are mode `0700`.
