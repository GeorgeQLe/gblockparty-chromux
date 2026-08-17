# Chromux Next 0.10.5 Paginated Continuation History UAT

## Automated qualification

1. From `chromux-next/`, run a clean `npm ci`, then `npm run typecheck`,
   `npm test`, `npm run package`, and all three packaged smoke commands.
2. Confirm the protocol fixture still rejects malformed and oversized frames,
   while excluded fork/resume responses and paginated summary pages remain
   below its test-only limit.
3. Run packaged visual qualification and inspect standard and narrow DETECT
   continuation configuration plus populated transcript states.

## Active-writer repair gate

1. Keep the original external Codex process for `omega-war` active and
   responsive. Install and launch Chromux Next 0.10.5.
2. Open the existing `Continue · omega-war` Chromux session. Confirm its earlier
   conversation appears without a new continuation or another fork.
3. Confirm the session remains below 1,000 events. If older history was omitted,
   confirm the transcript begins with a clear truncation notice. If hydration
   fails, confirm a visible retry explanation remains and relaunch once to
   exercise retry on the same owned thread.
4. Send a harmless message from Chromux. Confirm it appends to the Chromux-owned
   thread while the original external process remains active, responsive, and
   independent.
5. Inspect diagnostic request evidence: restoration uses `thread/resume` with
   `excludeTurns: true`, history pages target that same owned thread with
   `itemsView: "summary"`, and no `thread/fork`, steer, interrupt, or other
   mutation targets the external source.

## Release gate

Publish `chromux-next-v0.10.5` as a prerelease titled
`GBlockParty Chromux Next v0.10.5`. Confirm the legacy stable release returned
by `/releases/latest` is unchanged.
