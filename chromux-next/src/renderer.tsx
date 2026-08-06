import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import {
  AlertTriangle,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  CirclePlus,
  Copy,
  FileText,
  FolderPlus,
  Globe2,
  MessagesSquare,
  PanelTop,
  Plus,
  Search,
  Send,
  Settings,
  Square,
  TerminalSquare,
  X
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import type {
  ModelOptionV1,
  CompatibilityDiagnosticsV1,
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
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  type WorkspacePreferencesPatchV1,
  type WorkspacePreferencesV1
} from "./settings/workspace-preferences";
import type {
  AgentRunEvent,
  AlignmentDocumentV1,
  AlignmentItem,
  AlignmentMutationBatchV1,
  AlignmentMutationOperation
} from "./domain/schema";
import {
  createItem,
  humanReview,
  isProposalStale,
  itemLabel,
  mutationBatch,
  normalizeTable,
  type AlignmentItemKind
} from "./alignment/editor-model";
import { sampleDocument } from "./fixtures/sample-document";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Tabs
} from "./ui/components";
import "./styles.css";

type CenterSurface = "runner" | "alignment" | "deck" | "canvas" | "browser";
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
        <Badge tone="sage">Display only</Badge>
        <label className="transcript-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="Search transcript"
            placeholder="Search transcript"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search.current?.findNext(needle);
            }}
          />
        </label>
        <IconButton label="Previous transcript match" icon={ArrowUp} onClick={() => search.current?.findPrevious(needle)} />
        <IconButton label="Next transcript match" icon={ArrowDown} onClick={() => search.current?.findNext(needle)} />
        <Button icon={Copy} tone="quiet" onClick={() => navigator.clipboard.writeText(terminal.current?.getSelection() ?? "")}>Copy</Button>
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
          <Button icon={Send} tone="primary" disabled={!session || !draft.trim()} onClick={() => void send()}>
            {session?.activeTurnId ? "Steer" : "Send"}
          </Button>
          <Button icon={Square} disabled={!session?.activeTurnId} onClick={() => session && void window.chromuxNext.runner.interrupt(session.id)}>
            Stop
          </Button>
        </div>
      </div>
    </section>
  );
}

type AlignmentWorkspaceProps = {
  document: AlignmentDocumentV1;
  filePath: string | undefined;
  selectedItemId: string | undefined;
  mutationStatus: string;
  undoDepth: number;
  runStatus: "idle" | "running" | "completed" | "cancelled" | "failed";
  runId: string | undefined;
  events: AgentRunEvent[];
  response: string;
  proposals: AlignmentMutationBatchV1[];
  select(itemId: string): void;
  open(): void;
  save(): void;
  saveAs(): void;
  apply(summary: string, operations: AlignmentMutationOperation[]): void;
  undo(): void;
  run(provider: "fake" | "codex", prompt: string): void;
  cancel(): void;
  applyProposal(index: number): void;
  rejectProposal(index: number): void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="alignment-field"><span>{label}</span>{children}</label>;
}

function KindEditor({ item, update }: { item: AlignmentItem; update(next: AlignmentItem): void }) {
  const commit = (patch: Partial<AlignmentItem>) => update({ ...item, ...patch } as AlignmentItem);
  if (item.kind === "heading") return <div className="kind-editor two-column">
    <Field label="Level"><select defaultValue={item.level} onChange={(event) => commit({ level: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level}>{level}</option>)}</select></Field>
    <Field label="Text"><input defaultValue={item.text} onBlur={(event) => commit({ text: event.target.value })} /></Field>
  </div>;
  if (item.kind === "text") return <Field label="Body"><textarea rows={8} defaultValue={item.text} onBlur={(event) => commit({ text: event.target.value })} /></Field>;
  if (item.kind === "list") return <div className="kind-editor">
    <Field label="Style"><select defaultValue={item.style} onChange={(event) => commit({ style: event.target.value as "bullet" | "numbered" })}><option value="bullet">Bullet</option><option value="numbered">Numbered</option></select></Field>
    <Field label="Entries (one per line)"><textarea rows={8} defaultValue={item.items.join("\n")} onBlur={(event) => commit({ items: event.target.value.split("\n") })} /></Field>
  </div>;
  if (item.kind === "table") return <div className="kind-editor">
    <Field label="Columns (tab separated)"><input defaultValue={item.columns.join("\t")} onBlur={(event) => {
      const columns = event.target.value.split("\t");
      commit({ columns, rows: normalizeTable(columns, item.rows) });
    }} /></Field>
    <Field label="Rows (tabs and newlines)"><textarea rows={8} defaultValue={item.rows.map((row) => row.join("\t")).join("\n")} onBlur={(event) => commit({ rows: normalizeTable(item.columns, event.target.value.split("\n").map((row) => row.split("\t"))) })} /></Field>
  </div>;
  if (item.kind === "media") return <div className="kind-editor">
    <Field label="URL"><input type="url" defaultValue={item.url} onBlur={(event) => commit({ url: event.target.value })} /></Field>
    <Field label="Alt text"><input defaultValue={item.alt} onBlur={(event) => commit({ alt: event.target.value })} /></Field>
    <Field label="Caption"><textarea rows={3} defaultValue={item.caption ?? ""} onBlur={(event) => commit({ caption: event.target.value })} /></Field>
  </div>;
  if (item.kind === "code") return <div className="kind-editor">
    <Field label="Language"><input defaultValue={item.language} onBlur={(event) => commit({ language: event.target.value })} /></Field>
    <Field label="Code"><textarea className="code-input" rows={12} defaultValue={item.code} onBlur={(event) => commit({ code: event.target.value })} /></Field>
  </div>;
  if (item.kind === "decision" || item.kind === "question") return <div className="kind-editor">
    <Field label="Prompt"><textarea rows={3} defaultValue={item.question} onBlur={(event) => commit({ question: event.target.value })} /></Field>
    <Field label="Answer"><textarea rows={6} defaultValue={item.answer} onBlur={(event) => commit({ answer: event.target.value })} /></Field>
    <label className="check-field"><input type="checkbox" defaultChecked={item.gate} onChange={(event) => commit({ gate: event.target.checked })} /> Required gate</label>
  </div>;
  return <div className="kind-editor">
    <Field label="Label"><input defaultValue={item.label} onBlur={(event) => commit({ label: event.target.value })} /></Field>
    <div className="two-column"><Field label="Value type"><select defaultValue={typeof item.value} onChange={(event) => commit({ value: event.target.value === "number" ? Number(item.value) || 0 : String(item.value) })}><option value="string">String</option><option value="number">Number</option></select></Field>
      <Field label="Value"><input type={typeof item.value === "number" ? "number" : "text"} defaultValue={item.value} onBlur={(event) => commit({ value: typeof item.value === "number" ? Number(event.target.value) : event.target.value })} /></Field></div>
    <Field label="Unit"><input defaultValue={item.unit ?? ""} onBlur={(event) => commit({ unit: event.target.value })} /></Field>
  </div>;
}

function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return <p className="agent-response">{parts.map((part, index) => /^https?:\/\//.test(part)
    ? <button className="text-link" key={`${part}-${index}`} onClick={() => void window.chromuxNext.browser.open(part)}>{part}</button>
    : <React.Fragment key={index}>{part}</React.Fragment>)}</p>;
}

function ContributorPanel({ alignment }: { alignment: AlignmentWorkspaceProps }) {
  const [provider, setProvider] = useState<"fake" | "codex">("fake");
  const [prompt, setPrompt] = useState("Review the selected item and suggest a concrete improvement.");
  return <aside className="contributor-panel">
    <header><div><span>Read-only contributor</span><h3>Agent contribution</h3></div><strong className={`run-${alignment.runStatus}`}>{alignment.runStatus}</strong></header>
    <Field label="Adapter"><select value={provider} disabled={alignment.runStatus === "running"} onChange={(event) => setProvider(event.target.value as "fake" | "codex")}><option value="fake">Fake</option><option value="codex">Codex</option></select></Field>
    <Field label="Request"><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Field>
    <div className="button-row"><button className="primary" disabled={!prompt.trim() || alignment.runStatus === "running"} onClick={() => alignment.run(provider, prompt)}>Contribute</button><button disabled={alignment.runStatus !== "running"} onClick={alignment.cancel}>Cancel</button></div>
    <div className="agent-events" role="log" aria-live="polite">{alignment.events.map((event, index) => <small key={`${event.runId}-${index}`}>{event.type}{event.type === "progress" ? ` · ${event.message}` : event.type === "failed" ? ` · ${event.message}` : ""}</small>)}</div>
    {alignment.response && <LinkedText text={alignment.response} />}
    <section className="proposal-list"><h4>Unapplied proposals</h4>{alignment.proposals.map((proposal, index) => {
      const stale = isProposalStale(proposal, alignment.document);
      return <article className={stale ? "stale" : ""} key={`${proposal.baseRevision}-${index}`}><strong>{proposal.summary}</strong><small>{proposal.operations.length} operation{proposal.operations.length === 1 ? "" : "s"} · revision {proposal.baseRevision}{stale ? " · stale, rerun required" : ""}</small><div><button className="primary" disabled={stale || alignment.runStatus === "running"} onClick={() => alignment.applyProposal(index)}>Apply</button><button onClick={() => alignment.rejectProposal(index)}>Reject</button></div></article>;
    })}{!alignment.proposals.length && <p className="empty">No proposals awaiting review.</p>}</section>
  </aside>;
}

function AlignmentSurface({ alignment }: { alignment: AlignmentWorkspaceProps }) {
  const selected = alignment.document.items.find((item) => item.id === alignment.selectedItemId) ?? alignment.document.items[0];
  const [insertKind, setInsertKind] = useState<AlignmentItemKind>("text");
  const selectedIndex = selected ? alignment.document.items.findIndex((item) => item.id === selected.id) : -1;
  const updateItem = (item: AlignmentItem) => alignment.apply(`Edit ${item.kind} item`, [{ type: "item.update", itemId: item.id, item }]);
  return <section className="alignment-workspace" aria-label="Alignment document editor">
    <header className="alignment-toolbar">
      <div><h2>{alignment.document.title}</h2><p title={alignment.filePath}>{alignment.filePath ?? "Unsaved sample · first edit opens Save As"}</p></div>
      <div className="button-row"><button onClick={alignment.open}>Open</button><button onClick={alignment.save}>Save</button><button onClick={alignment.saveAs}>Save As</button><button disabled={!alignment.undoDepth} onClick={alignment.undo}>Undo ({alignment.undoDepth})</button></div>
      <div className="document-state"><span>Revision {alignment.document.revision}</span><select aria-label="Document status" value={alignment.document.status} onChange={(event) => alignment.apply("Change document status", [{ type: "status.set", status: event.target.value as AlignmentDocumentV1["status"] }])}><option value="draft">Draft</option><option value="in-review">In review</option><option value="approved">Approved</option><option value="archived">Archived</option></select><output aria-live="polite">{alignment.mutationStatus}</output></div>
    </header>
    <nav className="item-outline" aria-label="Document items"><div className="insert-row"><select aria-label="New item kind" value={insertKind} onChange={(event) => setInsertKind(event.target.value as AlignmentItemKind)}>{(["heading", "text", "list", "table", "media", "code", "decision", "question", "metric"] as const).map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select><button onClick={() => {
      const item = createItem(insertKind, `${insertKind}-${crypto.randomUUID()}`);
      alignment.apply(`Insert ${insertKind}`, [{ type: "item.insert", index: Math.max(0, selectedIndex + 1), item }]);
      alignment.select(item.id);
    }}>Insert</button></div>{alignment.document.items.map((item, index) => <button key={item.id} className={item.id === selected?.id ? "active" : ""} aria-current={item.id === selected?.id ? "true" : undefined} onClick={() => alignment.select(item.id)}><span>{index + 1}</span><strong>{itemLabel(item)}</strong><i className={`review-${item.review.status}`} /></button>)}</nav>
    <main className="item-editor">{selected ? <React.Fragment key={`${selected.id}-${alignment.document.revision}`}><header><div><span>{selected.kind}</span><h3>{itemLabel(selected)}</h3><small>{selected.id}</small></div><div className="button-row"><IconButton label="Move item up" icon={ArrowUp} disabled={selectedIndex <= 0} onClick={() => alignment.apply("Move item up", [{ type: "item.move", itemId: selected.id, toIndex: selectedIndex - 1 }])} /><IconButton label="Move item down" icon={ArrowDown} disabled={selectedIndex >= alignment.document.items.length - 1} onClick={() => alignment.apply("Move item down", [{ type: "item.move", itemId: selected.id, toIndex: selectedIndex + 1 }])} /><Button tone="danger" onClick={() => alignment.apply(`Remove ${selected.kind}`, [{ type: "item.remove", itemId: selected.id }])}>Remove</Button></div></header><KindEditor item={selected} update={updateItem} /><fieldset className="review-editor"><legend>Human review</legend><Field label="Status"><select value={selected.review.status} onChange={(event) => alignment.apply("Update item review", [{ type: "review.update", itemId: selected.id, review: humanReview(event.target.value as AlignmentItem["review"]["status"], selected.review.feedback, "Human editor") }])}><option value="unreviewed">Unreviewed</option><option value="changes-requested">Changes requested</option><option value="approved">Approved</option></select></Field><Field label="Feedback"><textarea rows={4} defaultValue={selected.review.feedback} onBlur={(event) => alignment.apply("Update review feedback", [{ type: "review.update", itemId: selected.id, review: humanReview(selected.review.status, event.target.value, "Human editor") }])} /></Field>{selected.review.reviewer && <small>Reviewed by {selected.review.reviewer} · {new Date(selected.review.reviewedAt!).toLocaleString()}</small>}</fieldset></React.Fragment> : <EmptyState icon={FileText} title="No document items" description="Insert an item to begin editing the Alignment document." />}</main>
    <ContributorPanel alignment={alignment} />
  </section>;
}

function ItemProjection({ item }: { item: AlignmentItem }) {
  if (item.kind === "heading") return React.createElement(`h${item.level}`, {}, item.text);
  if (item.kind === "text") return <p>{item.text}</p>;
  if (item.kind === "list") { const List = item.style === "numbered" ? "ol" : "ul"; return <List>{item.items.map((entry, index) => <li key={index}>{entry}</li>)}</List>; }
  if (item.kind === "table") return <table><thead><tr>{item.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{item.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table>;
  if (item.kind === "media") return <figure>{item.url && <img src={item.url} alt={item.alt} />}<figcaption>{item.caption}</figcaption></figure>;
  if (item.kind === "code") return <pre><code>{item.code}</code></pre>;
  if (item.kind === "metric") return <p><strong>{item.label}</strong> {item.value} {item.unit}</p>;
  return <blockquote><strong>{item.question}</strong><p>{item.answer || "Unanswered"}</p>{item.gate && <small>Required gate</small>}</blockquote>;
}

function DeckSurface({ document }: { document: AlignmentDocumentV1 }) {
  const deck = document.views.find((view) => view.kind === "deck");
  return <section className="secondary-surface deck">{deck?.slides.map((slide) => <article key={slide.id}><span>Slide · {slide.layout}</span><h2>{slide.title}</h2>{slide.itemIds.map((id) => document.items.find((item) => item.id === id)).filter(Boolean).map((item) => item && <ItemProjection key={item.id} item={item} />)}</article>) ?? <p className="empty">No deck view.</p>}</section>;
}

function CanvasSurface({ document }: { document: AlignmentDocumentV1 }) {
  const canvas = document.views.find((view) => view.kind === "canvas");
  return <section className="secondary-surface canvas"><div className="canvas-stage">{canvas?.nodes.map((node) => {
    const item = node.itemId ? document.items.find((candidate) => candidate.id === node.itemId) : undefined;
    return <article key={node.id} style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}><span>{node.shape}</span>{item ? <ItemProjection item={item} /> : node.text}</article>;
  })}</div></section>;
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
  alignment: AlignmentWorkspaceProps;
  setSurface(surface: CenterSurface): void;
  openSettings(): void;
  openNewSession(): void;
  openGroupDialog(group?: RunnerStateV1["groups"][number]): void;
  clearError(): void;
};

const SURFACE_ITEMS = [
  { value: "runner", label: "Runner", icon: TerminalSquare },
  { value: "alignment", label: "Alignment", icon: AlignLeft },
  { value: "deck", label: "Deck", icon: PanelTop },
  { value: "canvas", label: "Canvas", icon: Boxes },
  { value: "browser", label: "Browser", icon: Globe2 }
] satisfies Array<{ value: CenterSurface; label: string; icon: typeof TerminalSquare }>;

function Brand({ approach, surface, setSurface, openSettings, openNewSession }: {
  approach: UiApproachV1;
  surface: CenterSurface;
  setSurface(value: CenterSurface): void;
  openSettings(): void;
  openNewSession(): void;
}) {
  return <header className="shell-brand">
    <div className="brand"><img src="./mark.svg" alt="" /><div><span>{approach.replaceAll("-", " ")}</span><h1>Chromux Next</h1></div></div>
    <SurfaceTabs surface={surface} setSurface={setSurface} />
    <div className="brand-actions">
      <Button className="settings-button" icon={Settings} tone="quiet" aria-label="Open Settings" onClick={openSettings}>Settings</Button>
      <Button className="new-session" icon={Plus} tone="primary" onClick={openNewSession}>New Session</Button>
    </div>
  </header>;
}

function SurfaceTabs({ surface, setSurface, editor = false }: { surface: CenterSurface; setSurface(value: CenterSurface): void; editor?: boolean }) {
  return <Tabs label="Workspace surfaces" value={surface} items={SURFACE_ITEMS} onChange={setSurface} className={`surface-tabs ${editor ? "editor-tabs" : ""}`} />;
}

function closeSession(session: RunnerSessionV1) {
  if (session.activeTurnId && !window.confirm("This session is active. Interrupt and close it?")) return;
  void window.chromuxNext.runner.close(session.id);
}

function SessionTree({ state, selectedSession, openGroupDialog, compact = false }: { state: RunnerStateV1; selectedSession: RunnerSessionV1 | undefined; openGroupDialog(group?: RunnerStateV1["groups"][number]): void; compact?: boolean }) {
  return <nav className={`session-tree ${compact ? "compact-tree" : ""}`} aria-label="Projects and sessions">
    <header><span>Sessions</span><IconButton label="Create session group" icon={FolderPlus} onClick={() => openGroupDialog()} /></header>
    {state.groups.map((group) => <section key={group.id}>
      <header className="tree-group-header"><h2>{group.title}</h2>{group.kind === "custom" && <IconButton label={`Rename ${group.title}`} icon={Settings} onClick={() => openGroupDialog(group)} />}</header>
      {group.sessionIds.map((id) => state.sessions.find((session) => session.id === id)).filter(Boolean).map((session) => session && <div className="tree-session-row" key={session.id}>
        <button
          className={session.id === selectedSession?.id ? "active" : ""}
          onClick={() => void window.chromuxNext.runner.select(group.id, session.id)}
        ><i className={session.status} /><span>{session.title}</span>{session.interactions.length > 0 && <b>{session.interactions.length}</b>}</button>
        <IconButton label={`Close ${session.title}`} icon={X} onClick={() => closeSession(session)} />
      </div>)}
    </section>)}
    {!state.groups.length && <EmptyState icon={MessagesSquare} title="No sessions yet" description="Create a new session to start working with Codex." />}
  </nav>;
}

function TabNavigation({ state, selectedSession, openGroupDialog }: { state: RunnerStateV1; selectedSession: RunnerSessionV1 | undefined; openGroupDialog(group?: RunnerStateV1["groups"][number]): void }) {
  const selectedGroup = state.groups.find((group) => group.id === selectedSession?.groupId) ?? state.groups[0];
  return <section className="session-navigation">
    <select aria-label="Session group" value={selectedGroup?.id ?? ""} onChange={(event) => {
      const group = state.groups.find((item) => item.id === event.target.value);
      const first = group?.sessionIds[0];
      if (group && first) void window.chromuxNext.runner.select(group.id, first);
    }}>{state.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>
    <IconButton label="Create session group" icon={FolderPlus} onClick={() => openGroupDialog()} />
    <div className="session-tabs">{selectedGroup?.sessionIds.map((id) => state.sessions.find((session) => session.id === id)).filter(Boolean).map((session) => session && <div className={`session-tab ${selectedSession?.id === session.id ? "active" : ""}`} key={session.id}><button onClick={() => void window.chromuxNext.runner.select(session.groupId, session.id)}><i className={session.status} /><span>{session.title}</span>{session.interactions.length > 0 && <b>{session.interactions.length}</b>}</button><IconButton className="session-close" label={`Close ${session.title}`} icon={X} onClick={() => closeSession(session)} /></div>)}</div>
  </section>;
}

function Workspace({ state, models, selectedSession, surface, setSurface, error, clearError, alignment, hideHeader = false }: Omit<ShellProps, "openSettings" | "openNewSession"> & { hideHeader?: boolean }) {
  return <section className="center workflow-workspace">
    {!hideHeader && <div className="center-header"><div><h2>{selectedSession?.title ?? "Codex sessions"}</h2><p>{selectedSession?.projectPath ?? "Create a session for a project or worktree"}</p></div>{selectedSession && <>
      <select value={selectedSession.model ?? ""} disabled aria-label="Session model"><option>{models.find((item) => item.id === selectedSession.model)?.displayName ?? selectedSession.model ?? "Recommended"}</option></select>
      <span className={`permission ${selectedSession.permissionPreset}`}>{selectedSession.permissionPreset === "workspace" ? "Workspace" : "Read only"}</span>
      <select aria-label="Move session to group" value={selectedSession.groupId} onChange={(event) => void window.chromuxNext.runner.mutateGroup({ type: "move-session", groupId: event.target.value, sessionId: selectedSession.id })}>{state.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>
      <button aria-label="Close selected session" onClick={() => closeSession(selectedSession)}>Close</button>
    </>}</div>}
    <div className={`surface-pane runner-pane ${surface === "runner" ? "active" : ""}`} aria-hidden={surface !== "runner"}>
      <RunnerTerminal {...(selectedSession ? { session: selectedSession } : {})} />
      <Composer {...(selectedSession ? { session: selectedSession } : {})} />
    </div>
    <div className={`surface-pane ${surface === "alignment" ? "active" : ""}`} aria-hidden={surface !== "alignment"}><AlignmentSurface alignment={alignment} /></div>
    <div className={`surface-pane ${surface === "deck" ? "active" : ""}`} aria-hidden={surface !== "deck"}><DeckSurface document={alignment.document} /></div>
    <div className={`surface-pane ${surface === "canvas" ? "active" : ""}`} aria-hidden={surface !== "canvas"}><CanvasSurface document={alignment.document} /></div>
    <div className={`surface-pane ${surface === "browser" ? "active" : ""}`} aria-hidden={surface !== "browser"}><section className="secondary-surface browser-placeholder"><h2>Browser</h2><p>HTTP(S) links open here only after an explicit click in a runner transcript or contributor response.</p></section></div>
    {error && <button className="error-banner" onClick={clearError}><AlertTriangle aria-hidden="true" size={16} /><span>{error}</span><X aria-hidden="true" size={16} /></button>}
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
  }}>{props.state.sessions.filter((session) => session.status !== "closed").map((session) => <option value={session.id} key={session.id}>{session.title}</option>)}</select><SurfaceTabs {...props} /><button className={blockers ? "blocker-toggle has-blockers" : "blocker-toggle"} onClick={() => setAttentionOpen((open) => !open)}>{blockers ? `${blockers} blocker${blockers === 1 ? "" : "s"}` : "Attention"}</button></header>{blockers > 0 && <button className="blocker-banner" onClick={() => setAttentionOpen(true)}>Action required — open the attention drawer to resolve pending work.</button>}<Workspace {...props} />{attentionOpen && <div className="attention-drawer"><IconButton className="drawer-close" label="Close attention drawer" icon={X} onClick={() => setAttentionOpen(false)} /><AttentionSidebar state={props.state} /></div>}</main>;
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

function UnifiedApproachShell({ approach, ...props }: ShellProps & { approach: UiApproachV1 }) {
  const [attentionOpen, setAttentionOpen] = useState(false);
  const blockers = props.state.sessions.reduce((total, session) => total + session.interactions.length + (session.status === "failed" ? 1 : 0), 0);
  const shellClass = approach === "mission-board" ? "mission-board-shell"
    : approach === "spatial-canvas" ? "spatial-canvas-shell"
      : approach;
  return <main className={`approach-shell ${shellClass}`}>
    <Brand approach={approach} {...props} />
    {approach === "ide-workbench" && <SessionTree {...props} />}
    {approach === "control-room" && <TabNavigation {...props} />}
    {approach === "focus-studio" && <header className="focus-nav"><span>{props.state.groups.find((group) => group.id === props.selectedSession?.groupId)?.title ?? "Workspace"} /</span><select aria-label="Switch session" value={props.selectedSession?.id ?? ""} onChange={(event) => {
      const session = props.state.sessions.find((item) => item.id === event.target.value);
      if (session) void window.chromuxNext.runner.select(session.groupId, session.id);
    }}>{props.state.sessions.filter((session) => session.status !== "closed").map((session) => <option value={session.id} key={session.id}>{session.title}</option>)}</select><SurfaceTabs {...props} /><button className={blockers ? "blocker-toggle has-blockers" : "blocker-toggle"} onClick={() => setAttentionOpen((open) => !open)}>{blockers ? `${blockers} blocker${blockers === 1 ? "" : "s"}` : "Attention"}</button></header>}
    {approach === "focus-studio" && blockers > 0 && <button className="blocker-banner" onClick={() => setAttentionOpen(true)}>Action required — open the attention drawer to resolve pending work.</button>}
    {approach === "mission-board" && <MissionBoard {...props} />}
    {approach === "spatial-canvas" && <SpatialMap {...props} />}
    <section className={`workspace-host ${approach === "spatial-canvas" ? "spatial-dock" : ""}`}><Workspace key="persistent-workspace" {...props} /></section>
    {approach === "control-room" && <AttentionSidebar state={props.state} />}
    {approach === "ide-workbench" && <aside className="inspector"><h2>Inspector</h2><dl><dt>Thread</dt><dd>{props.selectedSession?.threadId ?? "Not started"}</dd><dt>Status</dt><dd>{props.selectedSession?.status ?? "No selection"}</dd><dt>Surface</dt><dd>{props.surface}</dd></dl><AttentionSidebar state={props.state} /></aside>}
    {approach === "focus-studio" && attentionOpen && <div className="attention-drawer"><IconButton className="drawer-close" label="Close attention drawer" icon={X} onClick={() => setAttentionOpen(false)} /><AttentionSidebar state={props.state} /></div>}
    {approach === "spatial-canvas" && <aside className="spatial-attention"><AttentionSidebar state={props.state} /></aside>}
  </main>;
}

const APPROACHES: Array<{ id: UiApproachV1; title: string; description: string }> = [
  { id: "control-room", title: "Control Room", description: "Top tabs, central runner, fixed composer, and attention rail." },
  { id: "ide-workbench", title: "IDE Workbench", description: "Project tree, editor tabs, interaction panel, and inspector." },
  { id: "focus-studio", title: "Focus Studio", description: "Single-session flow with a collapsible attention drawer." },
  { id: "mission-board", title: "Mission Board", description: "Status lanes paired with a full runner detail workspace." },
  { id: "spatial-canvas", title: "Spatial Canvas", description: "Project clusters, session nodes, and a docked runner." }
];

type SettingsSection = "appearance" | "projects" | "defaults" | "groups" | "diagnostics";

function GroupDialog({
  group,
  close
}: {
  group?: RunnerStateV1["groups"][number];
  close(): void;
}) {
  const [title, setTitle] = useState(group?.title ?? "");
  const input = useRef<HTMLInputElement>(null);
  const submit = () => {
    const normalized = title.trim();
    if (!normalized) return;
    void window.chromuxNext.runner.mutateGroup(group
      ? { type: "rename", groupId: group.id, title: normalized }
      : { type: "create", title: normalized }).then(close);
  };
  return <Dialog
    title={group ? "Rename group" : "New session group"}
    eyebrow="Session navigation"
    description="Custom groups organize sessions across projects without changing their working folders."
    close={close}
    initialFocus={input}
    className="group-dialog"
    footer={<><Button tone="quiet" onClick={close}>Cancel</Button><Button icon={Check} tone="primary" disabled={!title.trim()} onClick={submit}>{group ? "Save name" : "Create group"}</Button></>}
  >
    <label className="ui-field">
      <span>Group name</span>
      <input ref={input} value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); submit(); }
      }} />
      <small>Use a short name that describes the work or project.</small>
    </label>
  </Dialog>;
}

function SettingsOverlay({
  preferences,
  workspace,
  models,
  state,
  update,
  updateWorkspace,
  chooseProject,
  removeProject,
  openGroupDialog,
  close
}: {
  preferences: UiPreferencesV1;
  workspace: WorkspacePreferencesV1;
  models: ModelOptionV1[];
  state: RunnerStateV1;
  update(patch: UiPreferencesPatchV1): void;
  updateWorkspace(patch: WorkspacePreferencesPatchV1): void;
  chooseProject(): void;
  removeProject(projectId: string): void;
  openGroupDialog(group?: RunnerStateV1["groups"][number]): void;
  close(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SettingsSection>("projects");
  const [diagnostics, setDiagnostics] = useState<CompatibilityDiagnosticsV1>();
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const refreshDiagnostics = () => {
    setDiagnosticsError("");
    void window.chromuxNext.settings.compatibilityDiagnostics()
      .then(setDiagnostics)
      .catch((reason) => setDiagnosticsError(String(reason)));
  };
  useEffect(() => {
    if (section === "diagnostics" && !diagnostics) refreshDiagnostics();
  }, [section]);
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
  const selectedModel = models.find((model) => model.id === workspace.defaultModel)
    ?? models.find((model) => model.recommended) ?? models[0];
  return <div className="modal-backdrop settings-backdrop" onMouseDown={close}><div ref={dialog} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span>Successor-native preferences</span><h2 id="settings-title">Chromux Next Settings</h2></div><IconButton label="Close Settings" icon={X} onClick={close} /></header>
    <nav className="settings-tabs" aria-label="Settings sections">{(["projects", "defaults", "groups", "appearance", "diagnostics"] as SettingsSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item}</button>)}</nav>
    <div className="settings-content">
      {section === "appearance" && <><div className="approach-grid" role="radiogroup" aria-label="Interface approach">{APPROACHES.map((approach) => <button role="radio" aria-checked={preferences.approach === approach.id} className={preferences.approach === approach.id ? "active" : ""} key={approach.id} onClick={() => update({ approach: approach.id })}><span className={`approach-preview preview-${approach.id}`}><i /><i /><i /></span><strong>{approach.title}</strong><small>{approach.description}</small></button>)}</div><section className="preference-controls"><fieldset><legend>Density</legend>{(["comfortable", "compact"] as const).map((density) => <label key={density}><input type="radio" name="density" checked={preferences.density === density} onChange={() => update({ density })} />{density}</label>)}</fieldset><fieldset><legend>Motion</legend>{(["system", "full", "reduced"] as const).map((motion) => <label key={motion}><input type="radio" name="motion" checked={preferences.motion === motion} onChange={() => update({ motion })} />{motion}</label>)}</fieldset></section></>}
      {section === "projects" && <section className="settings-section"><header><div><h3>Projects and worktrees</h3><p>Folders registered only in Chromux Next. A Git worktree is identified when its <code>.git</code> entry is a file.</p></div><button className="primary" onClick={chooseProject}>Add folder…</button></header><div className="managed-list">{workspace.projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><small>{project.kind} · {project.path}</small></div><label><input type="radio" name="default-project" checked={workspace.defaultProjectId === project.id} onChange={() => updateWorkspace({ defaultProjectId: project.id })} /> Default</label><button disabled={state.sessions.some((session) => session.status !== "closed" && session.canonicalProjectPath === project.path)} onClick={() => removeProject(project.id)}>Remove</button></article>)}{!workspace.projects.length && <p className="empty">No projects yet. Add a project or Git worktree to use it from the session picker.</p>}</div></section>}
      {section === "defaults" && <section className="settings-section defaults-grid"><h3>New session defaults</h3><label>Permissions<select value={workspace.defaultPermissionPreset} onChange={(event) => updateWorkspace({ defaultPermissionPreset: event.target.value as "workspace" | "read-only" })}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label><label>Model<select value={workspace.defaultModel ?? selectedModel?.id ?? ""} onChange={(event) => { const next = models.find((item) => item.id === event.target.value); updateWorkspace({ defaultModel: event.target.value || null, defaultReasoningEffort: next?.defaultReasoningEffort ?? null }); }}><option value="">Recommended</option>{models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select></label><label>Reasoning<select value={workspace.defaultReasoningEffort ?? selectedModel?.defaultReasoningEffort ?? ""} onChange={(event) => updateWorkspace({ defaultReasoningEffort: event.target.value || null })}><option value="">Model default</option>{selectedModel?.reasoningEfforts.map((effort) => <option key={effort}>{effort}</option>)}</select></label><p>These values seed new sessions and remain editable before creation.</p></section>}
      {section === "groups" && <section className="settings-section"><header><div><h3>Session groups</h3><p>Project groups are created automatically. Custom groups can organize sessions across projects.</p></div><Button icon={FolderPlus} tone="primary" onClick={() => openGroupDialog()}>New custom group</Button></header><div className="managed-list">{state.groups.map((group) => <article key={group.id}><div><strong>{group.title}</strong><small>{group.kind} · {group.sessionIds.length} session{group.sessionIds.length === 1 ? "" : "s"}</small></div><Button tone="quiet" disabled={group.kind !== "custom"} onClick={() => openGroupDialog(group)}>Rename</Button><Button tone="danger" disabled={group.kind !== "custom" || group.sessionIds.length > 0} onClick={() => void window.chromuxNext.runner.mutateGroup({ type: "delete", groupId: group.id })}>Delete</Button></article>)}{!state.groups.length && <EmptyState icon={FolderPlus} title="No groups yet" description="Groups appear when you create a session or add a custom group." />}</div></section>}
      {section === "diagnostics" && <section className="settings-section diagnostics"><header><div><h3>Compatibility diagnostics</h3><p>Live checks from this successor process. Credential values are never displayed.</p></div><button onClick={refreshDiagnostics}>Refresh</button></header>{diagnosticsError && <p className="diagnostic-error">{diagnosticsError}</p>}{diagnostics && <><div className="diagnostic-summary"><span>Chromux Next {diagnostics.appVersion}</span><span>{diagnostics.platform}</span><span>successor-only state</span></div><div className="managed-list">{diagnostics.checks.map((check) => <article key={check.id}><i className={`diagnostic-${check.status}`} aria-label={check.status} /><div><strong>{check.label}</strong><small>{check.detail}</small></div></article>)}</div></>}</section>}
    </div>
    <footer><button onClick={() => { update({ approach: "control-room", density: "comfortable", motion: "system" }); updateWorkspace({ defaultProjectId: null, defaultPermissionPreset: "workspace", defaultModel: null, defaultReasoningEffort: null }); }}>Reset defaults</button><button className="primary" onClick={close}>Done</button></footer>
  </div></div>;
}

function OnboardingOverlay({ workspace, models, chooseProject, update, done }: { workspace: WorkspacePreferencesV1; models: ModelOptionV1[]; chooseProject(): void; update(patch: WorkspacePreferencesPatchV1): void; done(): void }) {
  const selectedModel = models.find((model) => model.id === workspace.defaultModel) ?? models.find((model) => model.recommended) ?? models[0];
  return <Dialog
    title="Set up Chromux Next"
    eyebrow="Welcome to the successor"
    description="Choose a project or Git worktree and defaults for new Codex sessions. This setup uses only Chromux Next storage and does not import or modify legacy Chromux state."
    close={() => undefined}
    dismissible={false}
    className="onboarding-modal"
    footer={<><small>Requires Codex CLI 0.146.0 or newer.</small><Button icon={Check} tone="primary" onClick={done}>Enter Chromux Next</Button></>}
  >
    <div className="onboarding-step"><b>1</b><div><h3>Add your first folder</h3><p>{workspace.projects.length ? `${workspace.projects.length} folder${workspace.projects.length === 1 ? "" : "s"} ready.` : "You can also continue and add one later from Settings."}</p></div><Button icon={FolderPlus} tone="primary" onClick={chooseProject}>Choose folder</Button></div>
    <div className="onboarding-step"><b>2</b><div><h3>Session defaults</h3><div className="modal-grid"><label>Permissions<select value={workspace.defaultPermissionPreset} onChange={(event) => update({ defaultPermissionPreset: event.target.value as "workspace" | "read-only" })}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label><label>Model<select value={workspace.defaultModel ?? selectedModel?.id ?? ""} onChange={(event) => update({ defaultModel: event.target.value || null })}><option value="">Recommended</option>{models.map((model) => <option value={model.id} key={model.id}>{model.displayName}</option>)}</select></label><label>Reasoning<select value={workspace.defaultReasoningEffort ?? selectedModel?.defaultReasoningEffort ?? ""} onChange={(event) => update({ defaultReasoningEffort: event.target.value || null })}><option value="">Model default</option>{selectedModel?.reasoningEfforts.map((effort) => <option key={effort}>{effort}</option>)}</select></label></div></div></div>
  </Dialog>;
}

function NewSessionDialog({ models, workspace, selectedSession, selectedGroupId, chooseProject, close, created, fail }: { models: ModelOptionV1[]; workspace: WorkspacePreferencesV1; selectedSession: RunnerSessionV1 | undefined; selectedGroupId: string | undefined; chooseProject(): void; close(): void; created(): void; fail(reason: unknown): void }) {
  const recommended = models.find((model) => model.id === workspace.defaultModel) ?? models.find((model) => model.recommended) ?? models[0];
  const preferredProject = workspace.projects.find((project) => project.id === workspace.defaultProjectId) ?? workspace.projects[0];
  const [project, setProject] = useState(selectedSession?.projectPath ?? preferredProject?.path ?? "");
  const [title, setTitle] = useState("New session");
  const [permission, setPermission] = useState<"workspace" | "read-only">(workspace.defaultPermissionPreset);
  const [model, setModel] = useState(recommended?.id ?? "");
  const [effort, setEffort] = useState(workspace.defaultReasoningEffort ?? recommended?.defaultReasoningEffort ?? "");
  const projectCount = useRef(workspace.projects.length);
  useEffect(() => {
    if (workspace.projects.length > projectCount.current) {
      setProject(workspace.projects.at(-1)?.path ?? project);
    }
    projectCount.current = workspace.projects.length;
  }, [workspace.projects]);
  return <Dialog
    title="New session"
    eyebrow="Codex app-server"
    description="Start a structured Codex session in a registered project or worktree."
    close={close}
    className="session-dialog"
    footer={<><Button tone="quiet" onClick={close}>Cancel</Button><Button form="new-session-form" type="submit" icon={CirclePlus} tone="primary" disabled={!project.trim() || !models.length}>Create session</Button></>}
  >
    <form id="new-session-form" className="session-form" onSubmit={(event) => {
      event.preventDefault();
      void window.chromuxNext.runner.create({
        projectPath: project,
        title: title || "New session",
        permissionPreset: permission,
        ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { reasoningEffort: effort } : {})
      }).then(created).catch(fail);
    }}>
      <label>Project or worktree<div className="path-picker"><select autoFocus value={project} onChange={(event) => setProject(event.target.value)}><option value="">Choose a registered folder</option>{workspace.projects.map((item) => <option value={item.path} key={item.id}>{item.name} · {item.kind}</option>)}{project && !workspace.projects.some((item) => item.path === project) && <option value={project}>{project}</option>}</select><Button type="button" icon={FolderPlus} onClick={chooseProject}>Add folder</Button></div></label>
      <label>Session title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="modal-grid"><label>Permissions<select value={permission} onChange={(event) => setPermission(event.target.value as "workspace" | "read-only")}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label><label>Model<select value={model} onChange={(event) => { setModel(event.target.value); setEffort(models.find((item) => item.id === event.target.value)?.defaultReasoningEffort ?? ""); }}><option value="">Recommended</option>{models.map((item) => <option value={item.id} key={item.id}>{item.displayName}{item.recommended ? " · recommended" : ""}</option>)}</select></label><label>Reasoning<select value={effort} onChange={(event) => setEffort(event.target.value)}><option value="">Model default</option>{(models.find((item) => item.id === model)?.reasoningEfforts ?? recommended?.reasoningEfforts ?? []).map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <p className="permission-help">{permission === "workspace" ? "Writes are limited to this workspace. Network is off by default and escalations require approval." : "Files are read-only. Network is off and approval prompts are never accepted."}</p>
    </form>
  </Dialog>;
}

function App() {
  const [state, setState] = useState<RunnerStateV1>(EMPTY_STATE);
  const [models, setModels] = useState<ModelOptionV1[]>([]);
  const [preferences, setPreferences] = useState<UiPreferencesV1>({ ...DEFAULT_UI_PREFERENCES });
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferencesV1>(
    structuredClone(DEFAULT_WORKSPACE_PREFERENCES)
  );
  const [settingsReady, setSettingsReady] = useState(false);
  const [surface, setSurface] = useState<CenterSurface>("runner");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; group?: RunnerStateV1["groups"][number] }>({ open: false });
  const [alignmentDocument, setAlignmentDocument] = useState<AlignmentDocumentV1>(() => structuredClone(sampleDocument));
  const alignmentDocumentRef = useRef(alignmentDocument);
  const [alignmentPath, setAlignmentPath] = useState<string>();
  const alignmentPathRef = useRef<string | undefined>(undefined);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(sampleDocument.items[0]?.id);
  const [mutationStatus, setMutationStatus] = useState("Ready");
  const [undoStack, setUndoStack] = useState<AlignmentMutationBatchV1[]>([]);
  const undoStackRef = useRef<AlignmentMutationBatchV1[]>([]);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const [runStatus, setRunStatus] = useState<AlignmentWorkspaceProps["runStatus"]>("idle");
  const [runId, setRunId] = useState<string>();
  const runIdRef = useRef<string | undefined>(undefined);
  const [agentEvents, setAgentEvents] = useState<AgentRunEvent[]>([]);
  const [agentResponse, setAgentResponse] = useState("");
  const [proposals, setProposals] = useState<AlignmentMutationBatchV1[]>([]);
  useEffect(() => {
    void Promise.all([
      window.chromuxNext.runner.state(),
      window.chromuxNext.runner.models(),
      window.chromuxNext.settings.getUiPreferences(),
      window.chromuxNext.settings.getWorkspacePreferences()
    ]).then(([nextState, nextModels, nextPreferences, nextWorkspacePreferences]) => {
      setState(nextState);
      setModels(nextModels);
      setPreferences(nextPreferences);
      setWorkspacePreferences(nextWorkspacePreferences);
      setSettingsReady(true);
    }).catch((reason) => setError(String(reason)));
    const offState = window.chromuxNext.runner.onState(setState);
    const offPreferences = window.chromuxNext.settings.onUiPreferencesChanged(setPreferences);
    const offWorkspacePreferences = window.chromuxNext.settings.onWorkspacePreferencesChanged(setWorkspacePreferences);
    return () => { offState(); offPreferences(); offWorkspacePreferences(); };
  }, []);
  useEffect(() => window.chromuxNext.agents.onEvent((event) => {
    if (event.runId !== runIdRef.current) return;
    setAgentEvents((current) => [...current, event].slice(-100));
  }), []);
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
  const updateWorkspacePreferences = (patch: WorkspacePreferencesPatchV1) => {
    void window.chromuxNext.settings.updateWorkspacePreferences(patch)
      .then(setWorkspacePreferences)
      .catch((reason) => setError(String(reason)));
  };
  const chooseProject = () => {
    void window.chromuxNext.settings.chooseProject()
      .then((next) => { if (next) setWorkspacePreferences(next); })
      .catch((reason) => setError(String(reason)));
  };
  const removeProject = (projectId: string) => {
    void window.chromuxNext.settings.removeProject(projectId)
      .then(setWorkspacePreferences)
      .catch((reason) => setError(String(reason)));
  };

  const replaceAlignment = (filePath: string | undefined, document: AlignmentDocumentV1) => {
    const copy = structuredClone(document);
    alignmentDocumentRef.current = copy;
    alignmentPathRef.current = filePath;
    setAlignmentDocument(copy);
    setAlignmentPath(filePath);
    setSelectedItemId(copy.items[0]?.id);
    undoStackRef.current = [];
    setUndoStack([]);
    setMutationStatus("Ready");
  };
  const addUndo = (inverse: AlignmentMutationBatchV1) => {
    const next = [...undoStackRef.current, inverse].slice(-100);
    undoStackRef.current = next;
    setUndoStack(next);
  };
  const applyAuthoritative = async (batch: AlignmentMutationBatchV1, recordUndo = true) => {
    let filePath = alignmentPathRef.current;
    let current = alignmentDocumentRef.current;
    if (!filePath) {
      setMutationStatus("Choose a location to continue…");
      const saved = await window.chromuxNext.documents.saveAs(current);
      if (!saved) { setMutationStatus("Save As cancelled · no changes applied"); return false; }
      filePath = saved.filePath;
      current = saved.document;
      alignmentPathRef.current = filePath;
      setAlignmentPath(filePath);
    }
    const authoritativeBatch = { ...batch, documentId: current.id, baseRevision: current.revision };
    setMutationStatus("Applying…");
    try {
      const result = await window.chromuxNext.documents.apply(filePath, authoritativeBatch);
      alignmentDocumentRef.current = result.document;
      setAlignmentDocument(result.document);
      if (recordUndo) addUndo(result.inverseBatch);
      setMutationStatus(`Saved revision ${result.document.revision}`);
      setSelectedItemId((selected) => result.document.items.some((item) => item.id === selected) ? selected : result.document.items[0]?.id);
      return true;
    } catch (reason) {
      undoStackRef.current = [];
      setUndoStack([]);
      setMutationStatus(`Conflict · ${String(reason)}`);
      setError(`Alignment mutation rejected: ${String(reason)}`);
      try {
        const latest = await window.chromuxNext.documents.read(filePath);
        alignmentDocumentRef.current = latest.document;
        setAlignmentDocument(latest.document);
        setMutationStatus(`External change loaded · revision ${latest.document.revision}`);
      } catch {
        // Keep the last validated in-memory document available for inspection.
      }
      return false;
    }
  };
  const enqueueMutation = (summary: string, operations: AlignmentMutationOperation[]) => {
    mutationQueue.current = mutationQueue.current.then(async () => {
      const batch = mutationBatch(alignmentDocumentRef.current, summary, operations);
      await applyAuthoritative(batch);
    }).catch((reason) => setError(String(reason)));
  };
  const alignment: AlignmentWorkspaceProps = {
    document: alignmentDocument,
    filePath: alignmentPath,
    selectedItemId,
    mutationStatus,
    undoDepth: undoStack.length,
    runStatus,
    runId,
    events: agentEvents,
    response: agentResponse,
    proposals,
    select: setSelectedItemId,
    open: () => void window.chromuxNext.documents.open().then((payload) => {
      if (payload) replaceAlignment(payload.filePath, payload.document);
    }).catch((reason) => setError(String(reason))),
    save: () => void (alignmentPathRef.current
      ? window.chromuxNext.documents.save(alignmentPathRef.current, alignmentDocumentRef.current).then((payload) => {
        alignmentDocumentRef.current = payload.document; setAlignmentDocument(payload.document); setMutationStatus("Saved");
      })
      : window.chromuxNext.documents.saveAs(alignmentDocumentRef.current).then((payload) => {
        if (payload) { alignmentPathRef.current = payload.filePath; setAlignmentPath(payload.filePath); setMutationStatus("Saved"); }
        else setMutationStatus("Save As cancelled");
      })).catch((reason) => setError(String(reason))),
    saveAs: () => void window.chromuxNext.documents.saveAs(alignmentDocumentRef.current).then((payload) => {
      if (payload) { alignmentPathRef.current = payload.filePath; setAlignmentPath(payload.filePath); setMutationStatus("Saved"); }
      else setMutationStatus("Save As cancelled");
    }).catch((reason) => setError(String(reason))),
    apply: enqueueMutation,
    undo: () => {
      const inverse = undoStackRef.current.at(-1);
      if (!inverse) return;
      mutationQueue.current = mutationQueue.current.then(async () => {
        const ok = await applyAuthoritative(inverse, false);
        if (ok) {
          const next = undoStackRef.current.slice(0, -1);
          undoStackRef.current = next;
          setUndoStack(next);
        }
      }).catch((reason) => setError(String(reason)));
    },
    run: (provider, prompt) => {
      const id = `contribution-${crypto.randomUUID()}`;
      runIdRef.current = id;
      setRunId(id);
      setRunStatus("running");
      setAgentEvents([]);
      setAgentResponse("");
      const snapshot = structuredClone(alignmentDocumentRef.current);
      void window.chromuxNext.agents.run({
        id,
        provider,
        prompt,
        projectPath: selectedSession?.projectPath ?? "/tmp",
        contextItemIds: selectedItemId ? [selectedItemId] : [],
        document: snapshot,
        timeoutMs: 120_000
      }).then((result) => {
        if (runIdRef.current !== id) return;
        setRunStatus(result.status);
        if (result.contribution) {
          setAgentResponse(result.contribution.response.slice(0, 500_000));
          setProposals((current) => [...current, ...result.contribution!.proposedBatches].slice(-100));
        }
        if (result.error) setError(result.error.message);
      }).catch((reason) => { setRunStatus("failed"); setError(String(reason)); });
    },
    cancel: () => {
      if (runIdRef.current) void window.chromuxNext.agents.cancel(runIdRef.current);
    },
    applyProposal: (index) => {
      const proposal = proposals[index];
      if (!proposal || isProposalStale(proposal, alignmentDocumentRef.current)) return;
      mutationQueue.current = mutationQueue.current.then(async () => {
        if (await applyAuthoritative(proposal)) setProposals((current) => current.filter((_, proposalIndex) => proposalIndex !== index));
      }).catch((reason) => setError(String(reason)));
    },
    rejectProposal: (index) => setProposals((current) => current.filter((_, proposalIndex) => proposalIndex !== index))
  };
  const openGroupDialog = (group?: RunnerStateV1["groups"][number]) => {
    setSettingsOpen(false);
    setGroupDialog({ open: true, ...(group ? { group } : {}) });
  };
  const shellProps: ShellProps = { state, models, surface, selectedSession, error, alignment, setSurface, openSettings: () => setSettingsOpen(true), openNewSession: () => setNewSessionOpen(true), openGroupDialog, clearError: () => setError("") };
  return <div className={`app-root density-${preferences.density} motion-${preferences.motion}`} data-approach={preferences.approach}>
    <UnifiedApproachShell approach={preferences.approach} {...shellProps} />
    {settingsOpen && <SettingsOverlay preferences={preferences} workspace={workspacePreferences} models={models} state={state} update={updatePreferences} updateWorkspace={updateWorkspacePreferences} chooseProject={chooseProject} removeProject={removeProject} openGroupDialog={openGroupDialog} close={() => setSettingsOpen(false)} />}
    {newSessionOpen && <NewSessionDialog models={models} workspace={workspacePreferences} selectedSession={selectedSession} selectedGroupId={state.groups.find((group) => group.id === selectedSession?.groupId)?.kind === "custom" ? selectedSession?.groupId : undefined} chooseProject={chooseProject} close={() => setNewSessionOpen(false)} created={() => { setNewSessionOpen(false); setSurface("runner"); }} fail={(reason) => setError(String(reason))} />}
    {groupDialog.open && <GroupDialog {...(groupDialog.group ? { group: groupDialog.group } : {})} close={() => setGroupDialog({ open: false })} />}
    {settingsReady && !workspacePreferences.onboardingComplete && <OnboardingOverlay workspace={workspacePreferences} models={models} chooseProject={chooseProject} update={updateWorkspacePreferences} done={() => updateWorkspacePreferences({ onboardingComplete: true })} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
