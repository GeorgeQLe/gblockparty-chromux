import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import type {
  ModelOptionV1,
  PendingInteractionV1,
  RunnerEventV1,
  RunnerSessionV1,
  RunnerStateV1
} from "./runner/contracts";
import {
  DEFAULT_UI_PREFERENCES,
  type UiApproachV1,
  type UiPreferencesPatchV1,
  type UiPreferencesV1
} from "./settings/ui-preferences";
import { sampleDocument } from "./fixtures/sample-document";
import "./styles.css";

type CenterSurface = "runner" | "alignment" | "deck" | "canvas" | "browser";
const SURFACES: CenterSurface[] = ["runner", "alignment", "deck", "canvas", "browser"];
const terminalViewports = new Map<string, number>();

const EMPTY_STATE: RunnerStateV1 = {
  schemaVersion: 1,
  groups: [],
  sessions: [],
  triage: []
};

function ansi(event: RunnerEventV1): string {
  const color = event.kind === "user" ? "38;5;117"
    : event.kind === "agent" ? "38;5;151"
    : event.kind === "reasoning" ? "38;5;245"
    : event.kind === "command" ? "38;5;215"
    : event.kind === "file-change" ? "38;5;180"
    : event.kind === "error" ? "38;5;203"
    : event.kind === "status" ? "38;5;109"
    : "38;5;250";
  const label = event.kind.toUpperCase().padEnd(11);
  return `\x1b[${color}m${label}\x1b[0m ${event.text.replace(/\r?\n/g, "\r\n            ")}\r\n`;
}

function RunnerTerminal({ session }: { session?: RunnerSessionV1 }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const fit = useRef<FitAddon | undefined>(undefined);
  const search = useRef<SearchAddon | undefined>(undefined);
  const [needle, setNeedle] = useState("");

  useEffect(() => {
    if (!host.current) return;
    const instance = new Terminal({
      disableStdin: true,
      convertEol: true,
      cursorBlink: false,
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 10_000,
      theme: {
        background: "#0b0d0e",
        foreground: "#d8ddda",
        selectionBackground: "#48685899",
        cursor: "#a8c8b2"
      }
    });
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    instance.loadAddon(fitAddon);
    instance.loadAddon(searchAddon);
    instance.open(host.current);
    instance.registerLinkProvider({
      provideLinks(lineNumber, callback) {
        const line = instance.buffer.active.getLine(lineNumber)?.translateToString() ?? "";
        const links = [...line.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((match) => ({
          text: match[0],
          range: {
            start: { x: (match.index ?? 0) + 1, y: lineNumber },
            end: { x: (match.index ?? 0) + match[0].length + 1, y: lineNumber }
          },
          activate: () => void window.chromuxNext.browser.open(match[0])
        }));
        callback(links);
      }
    });
    terminal.current = instance;
    fit.current = fitAddon;
    search.current = searchAddon;
    fitAddon.fit();
    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(host.current);
    return () => {
      if (session?.id) terminalViewports.set(session.id, instance.buffer.active.viewportY);
      observer.disconnect();
      instance.dispose();
    };
  }, []);

  useEffect(() => {
    const instance = terminal.current;
    if (!instance) return;
    instance.reset();
    if (!session) {
      instance.writeln("\x1b[38;5;245mCreate or select a session to begin.\x1b[0m");
      return;
    }
    instance.writeln(`\x1b[1;38;5;151m${session.title}\x1b[0m  \x1b[38;5;245m${session.projectPath}\x1b[0m`);
    instance.writeln("");
    session.events.forEach((event) => instance.write(ansi(event)));
    const viewport = terminalViewports.get(session.id);
    if (viewport === undefined) instance.scrollToBottom();
    else instance.scrollToLine(viewport);
    return () => {
      terminalViewports.set(session.id, instance.buffer.active.viewportY);
    };
  }, [session?.id, session?.events]);

  return (
    <section className="terminal-shell" aria-label="Display-only Codex runner">
      <div className="terminal-tools">
        <span>DISPLAY ONLY</span>
        <input
          aria-label="Search transcript"
          placeholder="Search"
          value={needle}
          onChange={(event) => setNeedle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") search.current?.findNext(needle);
          }}
        />
        <button onClick={() => search.current?.findPrevious(needle)}>↑</button>
        <button onClick={() => search.current?.findNext(needle)}>↓</button>
        <button onClick={() => navigator.clipboard.writeText(terminal.current?.getSelection() ?? "")}>Copy</button>
      </div>
      <div className="terminal-host" ref={host} />
    </section>
  );
}

function InteractionCard({
  interaction,
  onRespond
}: {
  interaction: PendingInteractionV1;
  onRespond(decision: "accept" | "accept-session" | "decline" | "cancel" | "accept-amendment", answers?: Record<string, string[]>): void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  return (
    <article className="interaction-card">
      <header><strong>{interaction.title}</strong><span>{interaction.kind}</span></header>
      <pre>{interaction.detail}</pre>
      {interaction.questions.map((question) => (
        <fieldset key={question.id}>
          <legend>{question.header}</legend>
          <p>{question.question}</p>
          {question.options.map((option) => (
            <label key={option.label}>
              <input
                type="radio"
                name={question.id}
                value={option.label}
                checked={answers[question.id]?.[0] === option.label}
                onChange={() => setAnswers((current) => ({ ...current, [question.id]: [option.label] }))}
              />
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
            </label>
          ))}
          <input
            className="free-answer"
            placeholder="Or type an answer"
            onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: [event.target.value] }))}
          />
        </fieldset>
      ))}
      <div className="interaction-actions">
        {interaction.kind === "question" ? (
          <>
            <button className="primary" onClick={() => onRespond("accept", answers)}>Submit</button>
            <button onClick={() => onRespond("cancel")}>Cancel</button>
          </>
        ) : interaction.offeredDecisions.map((decision) => (
          <button
            key={decision}
            className={decision === "accept" ? "primary" : ""}
            onClick={() => onRespond(decision)}
          >
            {decision === "accept" ? "Accept once"
              : decision === "accept-session" ? "Accept for session"
              : decision === "accept-amendment" ? "Accept policy"
              : decision[0]!.toUpperCase() + decision.slice(1)}
          </button>
        ))}
      </div>
    </article>
  );
}

function Composer({ session }: { session?: RunnerSessionV1 }) {
  const [draft, setDraft] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => setDraft(session?.draft ?? ""), [session?.id]);
  useEffect(() => {
    const flush = () => {
      if (session) void window.chromuxNext.runner.saveDraft(session.id, draft);
    };
    window.addEventListener("chromux:flush-drafts", flush);
    return () => window.removeEventListener("chromux:flush-drafts", flush);
  }, [session?.id, draft]);

  function update(value: string) {
    const bounded = value.slice(0, 64 * 1024);
    setDraft(bounded);
    if (!session) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void window.chromuxNext.runner.saveDraft(session.id, bounded);
    }, 250);
  }
  async function send() {
    if (!session || !draft.trim()) return;
    const value = draft;
    setDraft("");
    await window.chromuxNext.runner.send(session.id, value);
  }
  return (
    <section className="composer-panel">
      {session?.interactions.map((interaction) => (
        <InteractionCard
          key={interaction.id}
          interaction={interaction}
          onRespond={(decision, answers) => void window.chromuxNext.runner.respond({
            sessionId: session.id,
            interactionId: interaction.id,
            decision,
            ...(answers ? { answers } : {})
          })}
        />
      ))}
      <div className="composer-row">
        <textarea
          aria-label="Prompt composer"
          rows={4}
          placeholder={session ? "Message Codex… Enter adds a line; ⌘/Ctrl+Enter sends." : "Create a session to message Codex."}
          disabled={!session || session.status === "closed"}
          value={draft}
          onChange={(event) => update(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-actions">
          <button className="primary" disabled={!session || !draft.trim()} onClick={() => void send()}>
            {session?.activeTurnId ? "Steer" : "Send"}
          </button>
          <button disabled={!session?.activeTurnId} onClick={() => session && void window.chromuxNext.runner.interrupt(session.id)}>
            Stop
          </button>
        </div>
      </div>
    </section>
  );
}

function SecondarySurface({ mode }: { mode: CenterSurface }) {
  if (mode === "alignment") return (
    <section className="secondary-surface">
      <h2>{sampleDocument.title}</h2>
      <p className="muted">Alignment remains available as a secondary surface.</p>
      {sampleDocument.items.slice(0, 5).map((item) => (
        <article key={item.id}><span>{item.kind}</span><p>{"text" in item ? item.text : "question" in item ? item.question : item.kind}</p></article>
      ))}
    </section>
  );
  if (mode === "deck") {
    const deck = sampleDocument.views.find((view) => view.kind === "deck");
    return <section className="secondary-surface deck">{deck?.slides.map((slide) => <article key={slide.id}><span>Slide</span><h2>{slide.title}</h2></article>)}</section>;
  }
  if (mode === "canvas") return <section className="secondary-surface canvas"><h2>Canvas</h2><p>Spatial alignment projection stays mounted independently of runner state.</p></section>;
  return <section className="secondary-surface browser-placeholder"><h2>Browser</h2><p>HTTP(S) links open here only after an explicit click in the runner.</p></section>;
}

function AttentionSidebar({ state }: { state: RunnerStateV1 }) {
  const now = Date.now();
  const visible = (state.attention?.recommendations ?? []).filter((recommendation) => {
    const triage = [...state.triage].reverse().find((item) => item.fingerprint === recommendation.fingerprint);
    if (!triage) return true;
    if (triage.action === "dismiss") return false;
    return !triage.until || Date.parse(triage.until) <= now;
  });
  const blockers = state.sessions.flatMap((session) => [
    ...session.interactions.map((interaction) => ({
      id: interaction.id,
      title: interaction.title,
      reason: interaction.detail,
      sessionId: session.id,
      groupId: session.groupId,
      priority: "critical"
    })),
    ...(session.status === "failed" ? [{
      id: `failed-${session.id}`,
      title: `${session.title} needs recovery`,
      reason: session.events.filter((event) => event.kind === "error").at(-1)?.text ?? "Session failed",
      sessionId: session.id,
      groupId: session.groupId,
      priority: "critical"
    }] : [])
  ]);
  return (
    <aside className="attention-sidebar">
      <header>
        <div><span>Contextual</span><h2>Attention</h2></div>
        <button title="Refresh attention" onClick={() => void window.chromuxNext.attention.refresh()}>↻</button>
      </header>
      {blockers.map((blocker) => (
        <article className="attention-card blocker" key={blocker.id} onClick={() => void window.chromuxNext.runner.select(blocker.groupId, blocker.sessionId)}>
          <span>BLOCKER</span><h3>{blocker.title}</h3><p>{blocker.reason}</p>
          <small>Resolve in session · cannot dismiss</small>
        </article>
      ))}
      {visible.map((recommendation) => (
        <article
          className={`attention-card ${recommendation.priority}`}
          key={recommendation.id}
          onClick={() => {
            const source = recommendation.sourceIds
              .map((sourceId) => state.sessions.find((session) =>
                session.id === sourceId
                || session.events.some((event) => event.id === sourceId)
                || session.interactions.some((interaction) => interaction.id === sourceId)))
              .find(Boolean);
            if (source) void window.chromuxNext.runner.select(source.groupId, source.id);
          }}
        >
          <span>{recommendation.priority}</span><h3>{recommendation.title}</h3>
          <p>{recommendation.reason}</p><strong>{recommendation.suggestedAction}</strong>
          <details><summary>Evidence</summary>{recommendation.evidence}</details>
          <div>
            <select
              aria-label={`Snooze ${recommendation.title}`}
              defaultValue=""
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const duration = event.target.value as "15m" | "1h" | "4h" | "tomorrow";
                if (duration) void window.chromuxNext.attention.triage({ fingerprint: recommendation.fingerprint, action: "snooze", duration });
              }}
            >
              <option value="">Snooze…</option><option value="15m">15 minutes</option>
              <option value="1h">1 hour</option><option value="4h">4 hours</option><option value="tomorrow">Until tomorrow</option>
            </select>
            <button onClick={(event) => {
              event.stopPropagation();
              void window.chromuxNext.attention.triage({ fingerprint: recommendation.fingerprint, action: "dismiss" });
            }}>Dismiss</button>
          </div>
        </article>
      ))}
      {!blockers.length && !visible.length && <p className="empty">No items need attention.</p>}
      <footer>
        <span>{state.attention ? `Luna · ${new Date(state.attention.generatedAt).toLocaleTimeString()}` : "Luna has not run yet"}</span>
        {state.attentionFailure && <small title={state.attentionFailure}>Last refresh failed · showing prior result</small>}
      </footer>
    </aside>
  );
}

type ShellProps = {
  state: RunnerStateV1;
  models: ModelOptionV1[];
  surface: CenterSurface;
  selectedSession: RunnerSessionV1 | undefined;
  error: string;
  setSurface(surface: CenterSurface): void;
  openSettings(): void;
  openNewSession(): void;
  clearError(): void;
};

function Brand({ approach, openSettings, openNewSession }: {
  approach: UiApproachV1;
  openSettings(): void;
  openNewSession(): void;
}) {
  return <header className="shell-brand">
    <div className="brand"><img src="./mark.svg" alt="" /><div><span>{approach.replaceAll("-", " ")}</span><h1>Chromux Next</h1></div></div>
    <div className="brand-actions"><button aria-label="Create group" onClick={() => { const title = window.prompt("Custom group name"); if (title) void window.chromuxNext.runner.mutateGroup({ type: "create", title }); }}>+ Group</button><button aria-label="Open Settings" onClick={openSettings}>⚙ Settings</button><button className="new-session" onClick={openNewSession}>+ Session</button></div>
  </header>;
}

function SurfaceTabs({ surface, setSurface, editor = false }: { surface: CenterSurface; setSurface(value: CenterSurface): void; editor?: boolean }) {
  return <nav className={`surface-tabs ${editor ? "editor-tabs" : ""}`} aria-label="Workspace surfaces">
    {SURFACES.map((item) => <button className={surface === item ? "active" : ""} key={item} onClick={() => setSurface(item)}>{item}</button>)}
  </nav>;
}

function closeSession(session: RunnerSessionV1) {
  if (session.activeTurnId && !window.confirm("This session is active. Interrupt and close it?")) return;
  void window.chromuxNext.runner.close(session.id);
}

function SessionTree({ state, selectedSession, compact = false }: { state: RunnerStateV1; selectedSession: RunnerSessionV1 | undefined; compact?: boolean }) {
  return <nav className={`session-tree ${compact ? "compact-tree" : ""}`} aria-label="Projects and sessions">
    <header><span>Projects</span><button aria-label="Create group" onClick={() => {
      const title = window.prompt("Custom group name");
      if (title) void window.chromuxNext.runner.mutateGroup({ type: "create", title });
    }}>＋</button></header>
    {state.groups.map((group) => <section key={group.id}>
      <h2 onDoubleClick={() => {
        const title = window.prompt("Rename group", group.title);
        if (title) void window.chromuxNext.runner.mutateGroup({ type: "rename", groupId: group.id, title });
      }}>{group.title}</h2>
      {group.sessionIds.map((id) => state.sessions.find((session) => session.id === id)).filter(Boolean).map((session) => session && <button
        className={session.id === selectedSession?.id ? "active" : ""}
        key={session.id}
        onClick={() => void window.chromuxNext.runner.select(group.id, session.id)}
      ><i className={session.status} /><span>{session.title}</span>{session.interactions.length > 0 && <b>{session.interactions.length}</b>}<em onClick={(event) => { event.stopPropagation(); closeSession(session); }}>×</em></button>)}
    </section>)}
  </nav>;
}

function TabNavigation({ state, selectedSession }: { state: RunnerStateV1; selectedSession: RunnerSessionV1 | undefined }) {
  const selectedGroup = state.groups.find((group) => group.id === selectedSession?.groupId) ?? state.groups[0];
  return <section className="session-navigation">
    <div className="group-tabs">{state.groups.map((group) => <button className={selectedGroup?.id === group.id ? "active" : ""} key={group.id} onClick={() => {
      const first = group.sessionIds[0];
      if (first) void window.chromuxNext.runner.select(group.id, first);
    }}>{group.title}</button>)}</div>
    <div className="session-tabs">{selectedGroup?.sessionIds.map((id) => state.sessions.find((session) => session.id === id)).filter(Boolean).map((session) => session && <button className={selectedSession?.id === session.id ? "active" : ""} key={session.id} onClick={() => void window.chromuxNext.runner.select(session.groupId, session.id)}><i className={session.status} />{session.title}{session.interactions.length > 0 && <b>{session.interactions.length}</b>}<span onClick={(event) => { event.stopPropagation(); closeSession(session); }}>×</span></button>)}</div>
  </section>;
}

function Workspace({ state, models, selectedSession, surface, setSurface, error, clearError, hideHeader = false }: Omit<ShellProps, "openSettings" | "openNewSession"> & { hideHeader?: boolean }) {
  return <section className="center workflow-workspace">
    {!hideHeader && <div className="center-header"><div><h2>{selectedSession?.title ?? "Codex sessions"}</h2><p>{selectedSession?.projectPath ?? "Create a session for a project or worktree"}</p></div>{selectedSession && <>
      <select value={selectedSession.model ?? ""} disabled aria-label="Session model"><option>{models.find((item) => item.id === selectedSession.model)?.displayName ?? selectedSession.model ?? "Recommended"}</option></select>
      <span className={`permission ${selectedSession.permissionPreset}`}>{selectedSession.permissionPreset === "workspace" ? "Workspace" : "Read only"}</span>
      <select aria-label="Move session to group" value={selectedSession.groupId} onChange={(event) => void window.chromuxNext.runner.mutateGroup({ type: "move-session", groupId: event.target.value, sessionId: selectedSession.id })}>{state.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>
      <button aria-label="Close selected session" onClick={() => closeSession(selectedSession)}>Close</button>
    </>}</div>}
    {surface === "runner" ? <RunnerTerminal {...(selectedSession ? { session: selectedSession } : {})} /> : <SecondarySurface mode={surface} />}
    {surface === "runner" && <Composer {...(selectedSession ? { session: selectedSession } : {})} />}
    {error && <button className="error-banner" onClick={clearError}>{error} ×</button>}
  </section>;
}

function ControlRoomShell(props: ShellProps) {
  return <main className="approach-shell control-room"><Brand approach="control-room" {...props} /><SurfaceTabs {...props} /><TabNavigation {...props} /><Workspace {...props} /><AttentionSidebar state={props.state} /></main>;
}

function IdeWorkbenchShell(props: ShellProps) {
  return <main className="approach-shell ide-workbench"><Brand approach="ide-workbench" {...props} /><SessionTree {...props} /><SurfaceTabs {...props} editor /><Workspace {...props} /><aside className="inspector"><h2>Inspector</h2><dl><dt>Thread</dt><dd>{props.selectedSession?.threadId ?? "Not started"}</dd><dt>Status</dt><dd>{props.selectedSession?.status ?? "No selection"}</dd><dt>Surface</dt><dd>{props.surface}</dd></dl><AttentionSidebar state={props.state} /></aside></main>;
}

function FocusStudioShell(props: ShellProps) {
  const [attentionOpen, setAttentionOpen] = useState(false);
  const blockers = props.state.sessions.reduce((total, session) => total + session.interactions.length + (session.status === "failed" ? 1 : 0), 0);
  return <main className="approach-shell focus-studio"><Brand approach="focus-studio" {...props} /><header className="focus-nav"><span>{props.state.groups.find((group) => group.id === props.selectedSession?.groupId)?.title ?? "Workspace"} /</span><select aria-label="Switch session" value={props.selectedSession?.id ?? ""} onChange={(event) => {
    const session = props.state.sessions.find((item) => item.id === event.target.value);
    if (session) void window.chromuxNext.runner.select(session.groupId, session.id);
  }}>{props.state.sessions.filter((session) => session.status !== "closed").map((session) => <option value={session.id} key={session.id}>{session.title}</option>)}</select><SurfaceTabs {...props} /><button className={blockers ? "blocker-toggle has-blockers" : "blocker-toggle"} onClick={() => setAttentionOpen((open) => !open)}>{blockers ? `${blockers} blocker${blockers === 1 ? "" : "s"}` : "Attention"}</button></header>{blockers > 0 && <button className="blocker-banner" onClick={() => setAttentionOpen(true)}>Action required — open the attention drawer to resolve pending work.</button>}<Workspace {...props} />{attentionOpen && <div className="attention-drawer"><button className="drawer-close" onClick={() => setAttentionOpen(false)}>Close ×</button><AttentionSidebar state={props.state} /></div>}</main>;
}

type MissionLane = "Action Required" | "Working" | "Ready" | "Idle";
function missionLane(session: RunnerSessionV1): MissionLane {
  if (session.interactions.length || session.status === "failed") return "Action Required";
  if (session.activeTurnId || session.status === "active" || session.status === "starting") return "Working";
  if (session.events.at(-1)?.kind === "agent") return "Ready";
  return "Idle";
}
function MissionBoard({ state, selectedSession }: { state: RunnerStateV1; selectedSession: RunnerSessionV1 | undefined }) {
  const lanes: MissionLane[] = ["Action Required", "Working", "Ready", "Idle"];
  return <section className="mission-board" aria-label="Session mission board">{lanes.map((lane) => <section key={lane}><h2>{lane}<b>{state.sessions.filter((session) => session.status !== "closed" && missionLane(session) === lane).length}</b></h2><div role="list">{state.sessions.filter((session) => session.status !== "closed" && missionLane(session) === lane).map((session) => <button role="listitem" key={session.id} className={session.id === selectedSession?.id ? "active" : ""} onClick={() => void window.chromuxNext.runner.select(session.groupId, session.id)}><i className={session.status} /><strong>{session.title}</strong><small>{state.groups.find((group) => group.id === session.groupId)?.title}</small></button>)}</div></section>)}</section>;
}
function MissionBoardShell(props: ShellProps) {
  return <main className="approach-shell mission-board-shell"><Brand approach="mission-board" {...props} /><SurfaceTabs {...props} /><MissionBoard {...props} /><Workspace {...props} /></main>;
}

function SpatialMap({ state, selectedSession }: { state: RunnerStateV1; selectedSession: RunnerSessionV1 | undefined }) {
  return <nav className="spatial-map" aria-label="Spatial session map">{state.groups.map((group, groupIndex) => <section className={`cluster cluster-${groupIndex % 4}`} key={group.id}><h2>{group.title}</h2><div role="tree">{group.sessionIds.map((id) => state.sessions.find((session) => session.id === id)).filter(Boolean).map((session) => session && <button role="treeitem" aria-selected={session.id === selectedSession?.id} className={`session-node ${session.status} ${session.id === selectedSession?.id ? "active" : ""}`} key={session.id} onClick={() => void window.chromuxNext.runner.select(group.id, session.id)}><i />{session.title}{session.interactions.length > 0 && <b>{session.interactions.length}</b>}</button>)}</div></section>)}</nav>;
}
function SpatialCanvasShell(props: ShellProps) {
  return <main className="approach-shell spatial-canvas-shell"><Brand approach="spatial-canvas" {...props} /><SurfaceTabs {...props} /><SpatialMap {...props} /><section className="spatial-dock"><Workspace {...props} /></section><aside className="spatial-attention"><AttentionSidebar state={props.state} /></aside></main>;
}

const APPROACHES: Array<{ id: UiApproachV1; title: string; description: string }> = [
  { id: "control-room", title: "Control Room", description: "Top tabs, central runner, fixed composer, and attention rail." },
  { id: "ide-workbench", title: "IDE Workbench", description: "Project tree, editor tabs, interaction panel, and inspector." },
  { id: "focus-studio", title: "Focus Studio", description: "Single-session flow with a collapsible attention drawer." },
  { id: "mission-board", title: "Mission Board", description: "Status lanes paired with a full runner detail workspace." },
  { id: "spatial-canvas", title: "Spatial Canvas", description: "Project clusters, session nodes, and a docked runner." }
];

function SettingsOverlay({ preferences, update, close }: { preferences: UiPreferencesV1; update(patch: UiPreferencesPatchV1): void; close(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = dialog.current;
    if (!root) return;
    const focusable = () => [...root.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index >= items.length - 1 ? 0 : index + 1);
      event.preventDefault(); items[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return <div className="modal-backdrop settings-backdrop" onMouseDown={close}><div ref={dialog} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Presentation preferences</span><h2 id="settings-title">Choose your workspace</h2></div><button aria-label="Close Settings" onClick={close}>×</button></header><div className="approach-grid" role="radiogroup" aria-label="Interface approach">{APPROACHES.map((approach) => <button role="radio" aria-checked={preferences.approach === approach.id} className={preferences.approach === approach.id ? "active" : ""} key={approach.id} onClick={() => update({ approach: approach.id })}><span className={`approach-preview preview-${approach.id}`}><i /><i /><i /></span><strong>{approach.title}</strong><small>{approach.description}</small></button>)}</div><section className="preference-controls"><fieldset><legend>Density</legend>{(["comfortable", "compact"] as const).map((density) => <label key={density}><input type="radio" name="density" checked={preferences.density === density} onChange={() => update({ density })} />{density}</label>)}</fieldset><fieldset><legend>Motion</legend>{(["system", "full", "reduced"] as const).map((motion) => <label key={motion}><input type="radio" name="motion" checked={preferences.motion === motion} onChange={() => update({ motion })} />{motion}</label>)}</fieldset></section><footer><button onClick={() => update({ approach: "control-room", density: "comfortable", motion: "system" })}>Reset to Control Room defaults</button><button className="primary" onClick={close}>Done</button></footer></div></div>;
}

function NewSessionDialog({ models, selectedSession, selectedGroupId, close, created, fail }: { models: ModelOptionV1[]; selectedSession: RunnerSessionV1 | undefined; selectedGroupId: string | undefined; close(): void; created(): void; fail(reason: unknown): void }) {
  const recommended = models.find((model) => model.recommended) ?? models[0];
  const [project, setProject] = useState(selectedSession?.projectPath ?? "");
  const [title, setTitle] = useState("New session");
  const [permission, setPermission] = useState<"workspace" | "read-only">("workspace");
  const [model, setModel] = useState(recommended?.id ?? "");
  const [effort, setEffort] = useState(recommended?.defaultReasoningEffort ?? "");
  return <div className="modal-backdrop" onMouseDown={close}><form className="session-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void window.chromuxNext.runner.create({ projectPath: project, title: title || "New session", permissionPreset: permission, ...(selectedGroupId ? { groupId: selectedGroupId } : {}), ...(model ? { model } : {}), ...(effort ? { reasoningEffort: effort } : {}) }).then(created).catch(fail); }}><header><div><span>Codex app-server</span><h2>New session</h2></div><button type="button" onClick={close}>×</button></header><label>Project or worktree path<input autoFocus value={project} onChange={(event) => setProject(event.target.value)} placeholder="/absolute/path/to/project" /></label><label>Session title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="modal-grid"><label>Permissions<select value={permission} onChange={(event) => setPermission(event.target.value as "workspace" | "read-only")}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label><label>Model<select value={model} onChange={(event) => { setModel(event.target.value); setEffort(models.find((item) => item.id === event.target.value)?.defaultReasoningEffort ?? ""); }}>{models.map((item) => <option value={item.id} key={item.id}>{item.displayName}{item.recommended ? " · recommended" : ""}</option>)}</select></label><label>Reasoning<select value={effort} onChange={(event) => setEffort(event.target.value)}>{(models.find((item) => item.id === model)?.reasoningEfforts ?? []).map((item) => <option key={item}>{item}</option>)}</select></label></div><p>{permission === "workspace" ? "Writes are limited to this workspace. Network is off by default and escalations require approval." : "Files are read-only. Network is off and approval prompts are never accepted."}</p><footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={!project.trim()}>Create session</button></footer></form></div>;
}

function App() {
  const [state, setState] = useState<RunnerStateV1>(EMPTY_STATE);
  const [models, setModels] = useState<ModelOptionV1[]>([]);
  const [preferences, setPreferences] = useState<UiPreferencesV1>({ ...DEFAULT_UI_PREFERENCES });
  const [surface, setSurface] = useState<CenterSurface>("runner");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  useEffect(() => {
    void Promise.all([window.chromuxNext.runner.state(), window.chromuxNext.runner.models(), window.chromuxNext.settings.getUiPreferences()]).then(([nextState, nextModels, nextPreferences]) => { setState(nextState); setModels(nextModels); setPreferences(nextPreferences); }).catch((reason) => setError(String(reason)));
    const offState = window.chromuxNext.runner.onState(setState);
    const offPreferences = window.chromuxNext.settings.onUiPreferencesChanged(setPreferences);
    return () => { offState(); offPreferences(); };
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setSettingsOpen(true); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const selectedSession = state.sessions.find((session) => session.id === state.selectedSessionId) ?? state.sessions.find((session) => session.status !== "closed");
  const updatePreferences = (patch: UiPreferencesPatchV1) => {
    window.dispatchEvent(new Event("chromux:flush-drafts"));
    void window.chromuxNext.settings.updateUiPreferences(patch).then(setPreferences).catch((reason) => setError(String(reason)));
  };
  const shellProps: ShellProps = { state, models, surface, selectedSession, error, setSurface, openSettings: () => setSettingsOpen(true), openNewSession: () => setNewSessionOpen(true), clearError: () => setError("") };
  const Shell = preferences.approach === "ide-workbench" ? IdeWorkbenchShell : preferences.approach === "focus-studio" ? FocusStudioShell : preferences.approach === "mission-board" ? MissionBoardShell : preferences.approach === "spatial-canvas" ? SpatialCanvasShell : ControlRoomShell;
  return <div className={`app-root density-${preferences.density} motion-${preferences.motion}`} data-approach={preferences.approach}><Shell {...shellProps} />{settingsOpen && <SettingsOverlay preferences={preferences} update={updatePreferences} close={() => setSettingsOpen(false)} />}{newSessionOpen && <NewSessionDialog models={models} selectedSession={selectedSession} selectedGroupId={state.groups.find((group) => group.id === selectedSession?.groupId)?.kind === "custom" ? selectedSession?.groupId : undefined} close={() => setNewSessionOpen(false)} created={() => { setNewSessionOpen(false); setSurface("runner"); }} fail={(reason) => setError(String(reason))} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
