# Lessons From Legacy Chromux for Chromux Next

The biggest lesson from the original Chromux is that the product should be an
alignment and supervision layer, not merely a terminal with an embedded
browser.

Legacy Chromux proved many useful ideas, but its growth also revealed where
Chromux Next needs stronger foundations.

## Main Lessons

### 1. Structured agent protocols beat terminal inference

Legacy Chromux repeatedly needed fixes whenever Codex changed its terminal
output, prompt footer, chooser format, or activity signals. Terminal scraping
is inherently fragile.

Chromux Next's decision to use the Codex app-server, validated JSONL messages,
and normalized events is the right response. The terminal should remain a
display and emergency escape hatch, not the source of truth for lifecycle,
approvals, questions, or completion.

### 2. Keep one authoritative workflow state

The first app accumulated session state across terminals, browser panes, tabs,
Threads, Composer, previews, dialogs, and restore snapshots. That produced
subtle bugs involving focus, scrolling, hidden tabs, stale choices, and
inconsistent activity indicators.

Chromux Next should continue using one runner-owned session model, with layouts
acting only as presentations. Switching between Control Room, Mission Board,
Spatial Canvas, and other views must never create separate interpretations of
the session.

This is already explicit in [Chromux Next's architecture](../chromux-next/docs/architecture.md).

### 3. Preserving context is part of correctness

Legacy showed that apparently small details matter enormously during real
work:

- Drafts must survive session and layout changes.
- Terminal scroll position must remain exact.
- Focus must return to the right control.
- Pending approvals must remain attached to their originating session.
- Restoring a session must not accidentally start a new turn.
- A UI refresh must not mutate a selector while the user is operating it.

These are not merely polish items. In a parallel-agent cockpit, losing
position or routing input incorrectly damages trust.

### 4. Use exact identity, not directory-based guesses

Legacy frequently used the working directory to detect or resume an agent.
That becomes ambiguous when multiple threads or worktrees share a directory.

Chromux Next should persist exact provider thread IDs, stable project/worktree
identities, and stable item IDs. Directory detection is useful for discovery,
but it should not be the durable identity model. This lesson is also reflected
in the proposed [workspace resource model](gblockparty-iaas-integration.md).

### 5. Make mutations transactional and main-process authoritative

Legacy state evolved through numerous schema versions and multiple storage
locations. Chromux Next benefits from a stricter rule:

- Validate at every boundary.
- Reread authoritative state before modifying it.
- Apply operations to a clone.
- Persist atomically.
- Reject stale revisions.
- Never leave half-created sessions, projects, or documents.

Chromux Next's document mutations, detected-session creation, preferences, and
runner restoration already follow this model. It should remain the standard
for every future feature.

### 6. Fail closed, but preserve the user's work

Legacy's strongest recovery behavior was that failures usually retained a
draft, capture, queued preview, retry command, or inspectable record.

Chromux Next should preserve that principle. A protocol failure should not
silently guess; an external document conflict should not overwrite; and a
rejected proposal should not damage the document. Drafts, evidence, and
recovery actions should remain available.

### 7. Attention must lead to a real decision

Legacy learned that simply navigating to a session is often not a meaningful
action. For example, an update warning should offer execution or dismissal; an
approval should present the permitted choices; and an agent question should
make answering direct.

Chromux Next's attention system should remain action-oriented:

- Deterministic approvals and questions appear above model-generated
  recommendations.
- Explanations link to inspectable evidence.
- Every item has clear session and thread ownership.
- Snooze and dismiss semantics are explicit.
- An apparently actionable control must produce a visible result.

### 8. Security boundaries must be architectural

The original product eventually accumulated browser navigation, captures,
filesystem access, PTYs, OAuth, local services, update installation, and MCP
tools. Adding security after each feature became increasingly difficult.

Chromux Next should preserve its narrow boundaries:

- Raw provider messages stay in the main process.
- Renderer IPC is typed, bounded, and runtime validated.
- xterm input remains disabled by default.
- Navigation requires an explicit click and an HTTP(S) allowlist.
- Approval replies must match the exact pending thread request.
- Analyzer processes remain read-only, redacted, bounded, and disposable.
- Credentials are inherited by provider processes and never copied into
  Chromux state.

### 9. Keep the core modular before adding feature breadth back

Legacy's main renderer reached roughly 16,000 lines, with another 3,800 lines
in the main process. That made otherwise small behavior changes require broad
regression testing.

Chromux Next should resist rebuilding every legacy capability inside
`renderer.tsx` or `main.ts`. Browser, capture, Git, updates, shipping,
detection, attention, documents, and providers should remain separate modules
with narrow contracts.

If a feature introduces new state ownership, define the domain contract first
and add UI second.

### 10. Real UI testing is essential

Synthetic DOM tests were insufficient for several legacy failures. Real xterm
focus, native selectors, scrollback geometry, window activation, narrow
layouts, and Electron lifecycle behavior exposed issues unit tests could not.

The repository's [recorded implementation lessons](../tasks/lessons.md)
reinforce this:

- Test real focused xterm DOM.
- Check computed opacity across every theme.
- Verify actual geometry and clearances.
- Exercise native focus and window behavior.
- Capture packaged UI at standard and narrow sizes.

Chromux Next's packaged smoke tests and visual qualification should remain
release gates, not optional finishing work.

### 11. Avoid feature breadth without adoption evidence

Legacy became impressively feature-rich: browser capture, Git review, Vercel
shipping, Windows/WSL, updates, labs, attention modes, and themes. However,
the repository still lacks a completed multi-day daily-driver record and
clean-user installation proof.

Feature completion alone did not prove that Chromux improved daily work. For
Chromux Next, measure:

- Daily-driver reliability.
- Time to the first useful session.
- Correct attention routing.
- Successful resume after restart.
- Frequency of fallback to an outside terminal.
- Wrong-session or lost-context incidents.
- Clean-install success.

The missing evidence is documented in [the record queue](../tasks/record-todo.md)
and [the adoption research](../research/devtool-adoption.md).

### 12. Cutover is a product capability, not a release-number change

Chromux Next must not replace legacy Chromux merely because it contains the
desired features. It needs:

- A real macOS daily-driver record.
- Clean-install evidence.
- Windows and Linux package verification.
- A signed/update-channel strategy.
- An explicit migration or coexistence policy.
- Rollback proof.
- Confirmation that legacy data is never silently damaged.

These are correctly listed as the remaining gates in
[the task queue](../tasks/todo.md).

## Recommended Near-Term Priorities

1. Use Chromux Next as the daily driver and record actual failures.
2. Finish the migration/coexistence contract before touching legacy state.
3. Keep strengthening the runner and session model around exact provider
   identities.
4. Add browser and evidence workflows through isolated services, without
   making them renderer-owned.
5. Validate clean installation and recovery on macOS.
6. Only then broaden platform packaging and promote Chromux Next to the stable
   release line.

## Guiding Principle

Chromux One taught us that the winning capability is trustworthy coordination
of parallel agent work. Chromux Next should optimize for stable identity,
structured protocols, preserved context, explicit authority, and measured
daily usefulness before rebuilding the original app's entire feature surface.
