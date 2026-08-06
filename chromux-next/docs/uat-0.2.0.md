# Chromux Next v0.2.0 runner-first UAT

## Automated verification

```sh
cd chromux-next
codex --version
npm run verify
```

Confirm Codex reports `0.146.0` or newer and all type, unit, package, and
packaged smoke checks pass.

## Session and restoration

1. Create two sessions for the same project and confirm they share a project
   group while retaining separate drafts and transcripts.
2. Create a custom group, rename it by double-clicking its tab, and move one
   session into it with the group selector.
3. Send a multiline prompt with Cmd/Ctrl+Enter. While the turn is active,
   confirm the primary action reads Steer and another submission joins the
   active turn.
4. Stop a turn and confirm it completes as interrupted.
5. Restart Chromux Next. Confirm groups, tabs, drafts, cached display, model,
   reasoning, permissions, and thread IDs return without a new turn.
6. Close an active session, confirm the warning, and verify the Codex thread
   remains resumable outside Chromux Next.

## Permissions and interactions

1. Create one Workspace session and one Read only session.
2. Confirm Workspace explains workspace-write, network-off, on-request
   behavior and Read only explains read-only, network-off, never approvals.
3. Trigger a command or network escalation. Confirm the card appears above the
   composer and in Attention with Accept once, Accept for session, Decline,
   Cancel, and policy action only when offered.
4. Trigger an agent question and answer it using the structured response mode.
5. Confirm terminal typing does nothing, selection/copy/search work, and only
   explicit HTTP(S) link clicks open Browser.

## Contextual attention

1. Confirm pending approvals, questions, crashes, and failed turns appear
   immediately and cannot be dismissed.
2. Manually refresh Luna. Confirm freshness updates and no more than five
   recommendations appear.
3. Test 15-minute, 1-hour, 4-hour, and until-tomorrow snoozes.
4. Dismiss a recommendation, change its supporting evidence, refresh, and
   confirm the changed fingerprint allows it to reappear.
5. Simulate timeout or malformed analyzer output and confirm the last valid
   recommendations remain visible with a failure indicator.

## Isolation

1. Confirm legacy Chromux state, package version, release, and `/releases/latest`
   remain unchanged.
2. Confirm Chromux Next stores state only in its own user-data directory and
   does not locate or copy Codex credentials.
