# Contextual Sidebar Lab

The Sidebar Lab is an internal product/design experiment. It does not replace
or import the production Threads renderer.

## Run the lab

From `prototype/`:

```sh
npm run sidebar-lab
```

Gallery shows all ten concepts over one deterministic fixture. Study presents
one full-size concept at a time in a seeded order. Press **Start trial**, follow
the visible task, then rate orientation, attention clarity, and switching
effort. `/` focuses search, arrow keys move through session rows, Enter opens a
focused row, and `H` toggles history.

The six tasks cover approval blocking, status churn, cross-project switching,
interruption recovery, working-versus-review judgment, and completed-work
recovery. Status churn is deterministic, so row relocation can be compared
independently from speed.

## Evidence and scoring

Each trial records duration, completion, incorrect opens, clicks, keystrokes,
scroll distance, session switches, and row relocations. The score is:

- 40% completion
- 25% normalized speed
- 15% error avoidance
- 10% interaction efficiency
- 10% mean flow rating

Reports use medians by task and variant and expose median spatial churn
separately. The recommendation names task-level winners and proposes a
synthesis; it intentionally does not promote the aggregate leader
automatically.

## Reproduce deterministic validation

```sh
npm run test:sidebar-lab
npm run uat:sidebar-lab
npm run test:session-rail-renderer
```

`uat:sidebar-lab` is a no-model pipeline baseline covering all 60
variant/scenario pairs. Its synthetic perfect-task timings are not usability
findings. Run human Study trials before making a production decision.

## Privacy and isolation

The lab main process creates a temporary Electron profile and exposes only
configuration, sanitized export, and smoke completion through its own preload.
Fixture worktrees use `fixture://` identifiers. Reports exclude real paths,
prompts, terminal output, user preferences, and user sessions.
