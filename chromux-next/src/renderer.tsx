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
import { sampleDocument } from "./fixtures/sample-document";
import "./styles.css";

type CenterSurface = "runner" | "alignment" | "deck" | "canvas" | "browser";

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
    instance.scrollToBottom();
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

function App() {
  const [state, setState] = useState<RunnerStateV1>(EMPTY_STATE);
  const [models, setModels] = useState<ModelOptionV1[]>([]);
  const [surface, setSurface] = useState<CenterSurface>("runner");
  const [error, setError] = useState("");
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [newTitle, setNewTitle] = useState("New session");
  const [newPermission, setNewPermission] = useState<"workspace" | "read-only">("workspace");
  const [newModel, setNewModel] = useState("");
  const [newEffort, setNewEffort] = useState("");

  useEffect(() => {
    void Promise.all([window.chromuxNext.runner.state(), window.chromuxNext.runner.models()])
      .then(([nextState, nextModels]) => { setState(nextState); setModels(nextModels); })
      .catch((reason) => setError(String(reason)));
    return window.chromuxNext.runner.onState(setState);
  }, []);

  const selectedGroup = state.groups.find((group) => group.id === state.selectedGroupId) ?? state.groups[0];
  const groupSessions = selectedGroup
    ? selectedGroup.sessionIds.map((id) => state.sessions.find((session) => session.id === id)).filter(Boolean) as RunnerSessionV1[]
    : [];
  const selectedSession = state.sessions.find((session) => session.id === state.selectedSessionId) ?? groupSessions[0];
  const groupAttention = useMemo(() => new Map(state.groups.map((group) => [
    group.id,
    group.sessionIds.reduce((total, sessionId) => {
      const session = state.sessions.find((item) => item.id === sessionId);
      return total + (session?.interactions.length ?? 0) + (session?.status === "failed" ? 1 : 0);
    }, 0) + (state.attention?.recommendations ?? []).filter((recommendation) => {
      const triage = [...state.triage].reverse().find((item) => item.fingerprint === recommendation.fingerprint);
      if (triage?.action === "dismiss") return false;
      if (triage?.until && Date.parse(triage.until) > Date.now()) return false;
      return recommendation.sourceIds.some((sourceId) => group.sessionIds.some((sessionId) => {
        const session = state.sessions.find((item) => item.id === sessionId);
        return session?.id === sourceId
          || session?.events.some((event) => event.id === sourceId)
          || session?.interactions.some((interaction) => interaction.id === sourceId);
      }));
    }).length
  ])), [state]);

  async function createSession() {
    if (!newProject) return;
    try {
      const groupId = selectedGroup?.kind === "custom" ? selectedGroup.id : undefined;
      await window.chromuxNext.runner.create({
        projectPath: newProject,
        title: newTitle || "New session",
        permissionPreset: newPermission,
        ...(groupId ? { groupId } : {}),
        ...(newModel ? { model: newModel } : {}),
        ...(newEffort ? { reasoningEffort: newEffort } : {})
      });
      setNewSessionOpen(false);
      setSurface("runner");
    } catch (reason) { setError(String(reason)); }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><img src="./mark.svg" alt="" /><div><span>Experimental</span><h1>Chromux Next</h1></div></div>
        <nav className="surface-tabs" aria-label="Center surfaces">
          {(["runner", "alignment", "deck", "canvas", "browser"] as const).map((item) => (
            <button className={surface === item ? "active" : ""} key={item} onClick={() => setSurface(item)}>{item}</button>
          ))}
        </nav>
        <button className="new-session" onClick={() => {
          const recommended = models.find((model) => model.recommended) ?? models[0];
          setNewProject(selectedSession?.projectPath ?? "");
          setNewModel(recommended?.id ?? "");
          setNewEffort(recommended?.defaultReasoningEffort ?? "");
          setNewSessionOpen(true);
        }}>+ Session</button>
      </header>
      <section className="session-navigation">
        <div className="group-tabs">
          {state.groups.map((group) => (
            <button
              className={selectedGroup?.id === group.id ? "active" : ""}
              key={group.id}
              onDoubleClick={() => {
                const title = window.prompt("Rename group", group.title);
                if (title) void window.chromuxNext.runner.mutateGroup({ type: "rename", groupId: group.id, title });
              }}
              onClick={() => {
                const first = group.sessionIds[0];
                if (first) void window.chromuxNext.runner.select(group.id, first);
              }}
            >
              {group.title}{Boolean(groupAttention.get(group.id)) && <b>{groupAttention.get(group.id)}</b>}
            </button>
          ))}
          <button onClick={() => {
            const title = window.prompt("Custom group name");
            if (title) void window.chromuxNext.runner.mutateGroup({ type: "create", title });
          }}>＋</button>
        </div>
        <div className="session-tabs">
          {groupSessions.map((session) => (
            <button className={selectedSession?.id === session.id ? "active" : ""} key={session.id} onClick={() => void window.chromuxNext.runner.select(session.groupId, session.id)}>
              <i className={session.status} />{session.title}
              {session.interactions.length > 0 && <b>{session.interactions.length}</b>}
              <span onClick={(event) => {
                event.stopPropagation();
                if (session.activeTurnId && !window.confirm("This session is active. Interrupt and close it?")) return;
                void window.chromuxNext.runner.close(session.id);
              }}>×</span>
            </button>
          ))}
        </div>
      </section>
      <section className="center">
        <div className="center-header">
          <div><h2>{selectedSession?.title ?? "Codex sessions"}</h2><p>{selectedSession?.projectPath ?? "Create a session for a project or worktree"}</p></div>
          {selectedSession && <>
            <select value={selectedSession.model ?? ""} disabled aria-label="Session model">
              <option>{models.find((item) => item.id === selectedSession.model)?.displayName ?? selectedSession.model ?? "Recommended"}</option>
            </select>
            <span className={`permission ${selectedSession.permissionPreset}`}>{selectedSession.permissionPreset === "workspace" ? "Workspace" : "Read only"}</span>
            <select
              aria-label="Move session to group"
              value={selectedSession.groupId}
              onChange={(event) => void window.chromuxNext.runner.mutateGroup({
                type: "move-session",
                groupId: event.target.value,
                sessionId: selectedSession.id
              })}
            >
              {state.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
            </select>
          </>}
        </div>
        {surface === "runner" ? <RunnerTerminal {...(selectedSession ? { session: selectedSession } : {})} /> : <SecondarySurface mode={surface} />}
        {surface === "runner" && <Composer {...(selectedSession ? { session: selectedSession } : {})} />}
        {error && <button className="error-banner" onClick={() => setError("")}>{error} ×</button>}
      </section>
      <AttentionSidebar state={state} />
      {newSessionOpen && (
        <div className="modal-backdrop" onMouseDown={() => setNewSessionOpen(false)}>
          <form className="session-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => {
            event.preventDefault();
            void createSession();
          }}>
            <header><div><span>Codex app-server</span><h2>New session</h2></div><button type="button" onClick={() => setNewSessionOpen(false)}>×</button></header>
            <label>Project or worktree path<input autoFocus value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="/absolute/path/to/project" /></label>
            <label>Session title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /></label>
            <div className="modal-grid">
              <label>Permissions<select value={newPermission} onChange={(event) => setNewPermission(event.target.value as "workspace" | "read-only")}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label>
              <label>Model<select value={newModel} onChange={(event) => {
                setNewModel(event.target.value);
                setNewEffort(models.find((model) => model.id === event.target.value)?.defaultReasoningEffort ?? "");
              }}>{models.map((model) => <option value={model.id} key={model.id}>{model.displayName}{model.recommended ? " · recommended" : ""}</option>)}</select></label>
              <label>Reasoning<select value={newEffort} onChange={(event) => setNewEffort(event.target.value)}>
                {(models.find((model) => model.id === newModel)?.reasoningEfforts ?? []).map((effort) => <option key={effort}>{effort}</option>)}
              </select></label>
            </div>
            <p>{newPermission === "workspace" ? "Writes are limited to this workspace. Network is off by default and escalations require approval." : "Files are read-only. Network is off and approval prompts are never accepted."}</p>
            <footer><button type="button" onClick={() => setNewSessionOpen(false)}>Cancel</button><button className="primary" disabled={!newProject.trim()}>Create session</button></footer>
          </form>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
