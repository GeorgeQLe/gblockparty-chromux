import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Camera,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Check,
  CirclePlus,
  Copy,
  FileText,
  FolderPlus,
  Globe2,
  ExternalLink,
  MessagesSquare,
  PanelTop,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  TerminalSquare,
  X
} from "lucide-react";
import type {
  ModelOptionV1,
  CompatibilityDiagnosticsV1,
  PendingInteractionV1,
  RunnerSessionV1,
  RunnerStateV1
} from "./runner/contracts";
import {
  collectRoomRequests,
  decisionCopy,
  eligibleRoomRequests,
  reconcileDeferrals,
  roomRequestKey,
  roomCounts,
  type RoomRequest
} from "./runner/situation-room";
import type {
  CreateFromDetectionInput,
  DetectionResultV1,
  DetectedTerminalV1
} from "./detection/contracts";
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
import { DEFAULT_UPDATE_STATE, type UpdateStateV1, type UpdateTargetState } from "./updates/contracts";
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
import { PersistentSurfaces, type CenterSurface } from "./renderer/persistent-surfaces";
import { RendererErrorBoundary } from "./renderer/recovery";
import { FleetFeature } from "./control-plane/ui";
import { RunnerTranscript } from "./renderer/transcript";
import type { FleetState } from "./control-plane/contracts";
import {
  DEFAULT_BROWSER_WORKSPACE,
  type BrowserEvidenceV1,
  type BrowserWorkspaceV1
} from "./browser/contracts";
import "./styles.css";

const EMPTY_STATE: RunnerStateV1 = {
  schemaVersion: 1,
  groups: [],
  sessions: [],
  triage: []
};

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

function Composer({ session, hideInteractions = false }: { session?: RunnerSessionV1; hideInteractions?: boolean }) {
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
      {!hideInteractions && session?.interactions.map((interaction) => (
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

function LinkedText({ text, openBrowser }: { text: string; openBrowser?: (url: string) => void }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return <p className="agent-response">{parts.map((part, index) => /^https?:\/\//.test(part)
    ? <button className="text-link" key={`${part}-${index}`} onClick={() => openBrowser?.(part)}>{part}</button>
    : <React.Fragment key={index}>{part}</React.Fragment>)}</p>;
}

function ContributorPanel({ alignment, openBrowser }: { alignment: AlignmentWorkspaceProps; openBrowser(url: string): void }) {
  const [provider, setProvider] = useState<"fake" | "codex">("fake");
  const [prompt, setPrompt] = useState("Review the selected item and suggest a concrete improvement.");
  return <aside className="contributor-panel">
    <header><div><span>Read-only contributor</span><h3>Agent contribution</h3></div><strong className={`run-${alignment.runStatus}`}>{alignment.runStatus}</strong></header>
    <Field label="Adapter"><select value={provider} disabled={alignment.runStatus === "running"} onChange={(event) => setProvider(event.target.value as "fake" | "codex")}><option value="fake">Fake</option><option value="codex">Codex</option></select></Field>
    <Field label="Request"><textarea rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Field>
    <div className="button-row"><button className="primary" disabled={!prompt.trim() || alignment.runStatus === "running"} onClick={() => alignment.run(provider, prompt)}>Contribute</button><button disabled={alignment.runStatus !== "running"} onClick={alignment.cancel}>Cancel</button></div>
    <div className="agent-events" role="log" aria-live="polite">{alignment.events.map((event, index) => <small key={`${event.runId}-${index}`}>{event.type}{event.type === "progress" ? ` · ${event.message}` : event.type === "failed" ? ` · ${event.message}` : ""}</small>)}</div>
    {alignment.response && <LinkedText text={alignment.response} openBrowser={openBrowser} />}
    <section className="proposal-list"><h4>Unapplied proposals</h4>{alignment.proposals.map((proposal, index) => {
      const stale = isProposalStale(proposal, alignment.document);
      return <article className={stale ? "stale" : ""} key={`${proposal.baseRevision}-${index}`}><strong>{proposal.summary}</strong><small>{proposal.operations.length} operation{proposal.operations.length === 1 ? "" : "s"} · revision {proposal.baseRevision}{stale ? " · stale, rerun required" : ""}</small><div><button className="primary" disabled={stale || alignment.runStatus === "running"} onClick={() => alignment.applyProposal(index)}>Apply</button><button onClick={() => alignment.rejectProposal(index)}>Reject</button></div></article>;
    })}{!alignment.proposals.length && <p className="empty">No proposals awaiting review.</p>}</section>
  </aside>;
}

function AlignmentSurface({ alignment, openBrowser }: { alignment: AlignmentWorkspaceProps; openBrowser(url: string): void }) {
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
    <ContributorPanel alignment={alignment} openBrowser={openBrowser} />
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
  browserWorkspace: BrowserWorkspaceV1;
  browserEnabled: boolean;
  updateBrowserWorkspace(value: BrowserWorkspaceV1): void;
  reportError(reason: unknown): void;
  setSurface(surface: CenterSurface): void;
  openSettings(): void;
  openUpdates(): void;
  updates: UpdateStateV1;
  openNewSession(): void;
  openDetect(): void;
  fleetEnabled: boolean;
  openFleet(): void;
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

function Brand({ approach, surface, setSurface, openSettings, openUpdates, updates, openNewSession, openDetect, fleetEnabled, openFleet }: {
  approach: UiApproachV1;
  surface: CenterSurface;
  setSurface(value: CenterSurface): void;
  openSettings(): void;
  openUpdates(): void;
  updates: UpdateStateV1;
  openNewSession(): void;
  openDetect(): void;
  fleetEnabled: boolean;
  openFleet(): void;
}) {
  return <header className="shell-brand">
    <div className="brand"><img src="./mark.svg" alt="" /><div><span>{approach.replaceAll("-", " ")}</span><h1>Chromux Next</h1></div></div>
    <SurfaceTabs surface={surface} setSurface={setSurface} />
    <div className="brand-actions">
      {([updates.app.phase, updates.codex.phase] as string[]).some((phase) => ["available", "staged", "blocked", "failed"].includes(phase)) && <button className="update-badge" aria-label="Open Updates settings" onClick={openUpdates}>Update</button>}
      <Button className="settings-button" icon={Settings} tone="quiet" aria-label="Open Settings" onClick={openSettings}>Settings</Button>
      <Button className="detect-button" icon={Search} tone="quiet" onClick={openDetect}>Detect</Button>
      {fleetEnabled && <Button className="fleet-button" icon={Cloud} tone="quiet" onClick={openFleet}>Fleet</Button>}
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

function BrowserSurface({
  active,
  session,
  workspace,
  update,
  fail
}: {
  active: boolean;
  session?: RunnerSessionV1;
  workspace: BrowserWorkspaceV1;
  update(value: BrowserWorkspaceV1): void;
  fail(reason: unknown): void;
}) {
  const guest = useRef<HTMLDivElement>(null);
  const restored = useRef(new Set<string>());
  const [url, setUrl] = useState("https://");
  const [note, setNote] = useState("");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const sessionState = workspace.sessions.find((entry) => entry.sessionId === session?.id);
  const evidence = workspace.evidence.filter((entry) => entry.sessionId === session?.id).reverse();

  useEffect(() => {
    if (sessionState?.url) setUrl(sessionState.url);
  }, [session?.id, sessionState?.url]);

  useEffect(() => {
    if (!active || !session || !guest.current) {
      void window.chromuxNext.browser.present().catch(fail);
      return;
    }
    if (sessionState?.url && !restored.current.has(session.id)) {
      restored.current.add(session.id);
      void window.chromuxNext.browser.open(session.id, sessionState.url).catch(fail);
    }
    const present = () => {
      const rect = guest.current?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) return;
      void window.chromuxNext.browser.present(session.id, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }).catch(fail);
    };
    present();
    const observer = new ResizeObserver(present);
    observer.observe(guest.current);
    window.addEventListener("resize", present);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", present);
      void window.chromuxNext.browser.present().catch(() => undefined);
    };
  }, [active, session?.id]);

  const navigate = () => {
    if (!session) return;
    let target = url.trim();
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) target = `https://${target}`;
    restored.current.add(session.id);
    void window.chromuxNext.browser.open(session.id, target)
      .then((opened) => { if (!opened) throw new Error("Only HTTP(S) pages can open in the session browser"); })
      .catch(fail);
  };
  const action = (type: "back" | "forward" | "reload" | "copy-link" | "open-external") => {
    if (session) void window.chromuxNext.browser.action(session.id, type).catch(fail);
  };
  const capture = () => {
    if (!session) return;
    void window.chromuxNext.browser.capture(session.id, note).then((next) => {
      update(next);
      setNote("");
      setSelectedEvidenceId(next.evidence.at(-1)?.id);
    }).catch(fail);
  };
  const review = (item: BrowserEvidenceV1, decision: "approve" | "reject") => {
    void window.chromuxNext.browser.review(item.id, decision, item.note).then(update).catch(fail);
  };
  const inspect = (item: BrowserEvidenceV1) => {
    setSelectedEvidenceId(item.id);
    setPreview(undefined);
    void window.chromuxNext.browser.preview(item.id).then((value) => setPreview(value.dataUrl)).catch(fail);
  };

  return <section className="browser-workspace">
    <form className="browser-toolbar" onSubmit={(event) => { event.preventDefault(); navigate(); }}>
      <IconButton type="button" label="Back" icon={ChevronLeft} disabled={!sessionState} onClick={() => action("back")} />
      <IconButton type="button" label="Forward" icon={ChevronRight} disabled={!sessionState} onClick={() => action("forward")} />
      <IconButton type="button" label="Reload" icon={RefreshCw} disabled={!sessionState} onClick={() => action("reload")} />
      <input aria-label="Session browser URL" value={url} disabled={!session} onChange={(event) => setUrl(event.target.value)} />
      <Button type="submit" tone="primary" disabled={!session || !url.trim()}>Open</Button>
      <IconButton type="button" label="Copy page link" icon={Copy} disabled={!sessionState} onClick={() => action("copy-link")} />
      <IconButton type="button" label="Open in default browser" icon={ExternalLink} disabled={!sessionState} onClick={() => action("open-external")} />
    </form>
    <div className="browser-body">
      <div className="browser-guest">{!sessionState && <EmptyState icon={Globe2} title="Session browser" description="Enter an HTTP(S) address or click a link in this session’s transcript. Pages never open automatically." />}</div>
      <aside className="evidence-panel">
        <header><div><span>Review gate</span><h3>Browser evidence</h3></div><Badge tone={evidence.some((item) => item.status === "awaiting-review") ? "warning" : "neutral"}>{evidence.filter((item) => item.status === "awaiting-review").length} pending</Badge></header>
        <Field label="Capture note"><textarea rows={3} value={note} disabled={!sessionState} placeholder="What should the agent inspect?" onChange={(event) => setNote(event.target.value)} /></Field>
        <Button icon={Camera} disabled={!sessionState} onClick={capture}>Capture for review</Button>
        <div className="evidence-list">{evidence.map((item) => <article className={selectedEvidenceId === item.id ? "selected" : ""} key={item.id}>
          <button className="evidence-summary" onClick={() => inspect(item)}><strong>{item.title || new URL(item.url).hostname}</strong><small>{item.status.replace("-", " ")} · {new Date(item.capturedAt).toLocaleTimeString()}</small></button>
          {selectedEvidenceId === item.id && <>
            {preview && <img src={preview} alt={`Captured page: ${item.title || item.url}`} />}
            <p>{item.note || "No reviewer note."}</p>
            <div className="button-row">
              {item.status !== "delivered" && <Button tone="quiet" onClick={() => review(item, "reject")}>Reject</Button>}
              {item.status !== "delivered" && <Button tone="primary" onClick={() => review(item, "approve")}>{item.status === "approved" ? "Approved" : "Approve"}</Button>}
              {item.status === "approved" && <Button icon={Send} onClick={() => void window.chromuxNext.browser.deliver(item.id).then(update).catch(fail)}>Send to session</Button>}
            </div>
          </>}
        </article>)}{!evidence.length && <p className="empty">Captures stay local and cannot reach Codex until you approve and send them.</p>}</div>
      </aside>
    </div>
  </section>;
}

function Workspace({ state, models, selectedSession, surface, setSurface, error, clearError, alignment, browserWorkspace, browserEnabled, updateBrowserWorkspace, reportError, hideHeader = false, hideInteractions = false }: Omit<ShellProps, "openSettings" | "openNewSession"> & { hideHeader?: boolean; hideInteractions?: boolean }) {
  const openBrowser = (url: string) => {
    if (!selectedSession) return;
    setSurface("browser");
    void window.chromuxNext.browser.open(selectedSession.id, url).catch(reportError);
  };
  return <section className="center workflow-workspace">
    {!hideHeader && <div className="center-header"><div><h2>{selectedSession?.title ?? "Codex sessions"}</h2><p>{selectedSession?.projectPath ?? "Create a session for a project or worktree"}</p></div>{selectedSession && <>
      <select value={selectedSession.model ?? ""} disabled aria-label="Session model"><option>{models.find((item) => item.id === selectedSession.model)?.displayName ?? selectedSession.model ?? "Recommended"}</option></select>
      <span className={`permission ${selectedSession.permissionPreset}`}>{selectedSession.permissionPreset === "workspace" ? "Workspace" : "Read only"}</span>
      <select aria-label="Move session to group" value={selectedSession.groupId} onChange={(event) => void window.chromuxNext.runner.mutateGroup({ type: "move-session", groupId: event.target.value, sessionId: selectedSession.id })}>{state.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>
      <button aria-label="Close selected session" onClick={() => closeSession(selectedSession)}>Close</button>
    </>}</div>}
    <PersistentSurfaces
      active={surface}
      runner={<><RunnerTranscript {...(selectedSession ? { session: selectedSession } : {})} openBrowser={openBrowser} /><Composer {...(selectedSession ? { session: selectedSession } : {})} hideInteractions={hideInteractions} /></>}
      alignment={<AlignmentSurface alignment={alignment} openBrowser={openBrowser} />}
      deck={<DeckSurface document={alignment.document} />}
      canvas={<CanvasSurface document={alignment.document} />}
      browser={<BrowserSurface active={surface === "browser" && browserEnabled} {...(selectedSession ? { session: selectedSession } : {})} workspace={browserWorkspace} update={updateBrowserWorkspace} fail={reportError} />}
    />
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

type Decision = PendingInteractionV1["offeredDecisions"][number];

export function SituationEvent({ request, sending, error, later, respond }: {
  request: RoomRequest;
  sending: boolean;
  error: string;
  later(): void;
  respond(decision: Decision, answers?: Record<string, string[]>): void;
}) {
  const { interaction, session, project } = request;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const recent = session.events.filter((event) => event.kind === "user" || event.kind === "agent" || event.kind === "error").slice(-4);
  const complete = interaction.questions.every((question) => Boolean(answers[question.id]?.trim()));
  const choose = (questionId: string, value: string) => setAnswers((current) => ({ ...current, [questionId]: value }));
  return <Dialog
    title={interaction.title}
    eyebrow={`${interaction.kind.replaceAll("-", " ")} · decision required`}
    description={`${project} / ${session.title}`}
    close={later}
    backdropDismissible={false}
    className="situation-event"
    footer={<><Button disabled={sending} onClick={later}>Later</Button><span className="event-footer-note">Escape defers this event without responding.</span></>}
  >
    <section className="event-intelligence" aria-label="Request intelligence">
      <dl><div><dt>Project</dt><dd>{project}</dd></div><div><dt>Session</dt><dd>{session.title}</dd></div><div><dt>Agent</dt><dd>{session.model ?? "Codex"}</dd></div><div><dt>Arrived</dt><dd>{new Date(interaction.at).toLocaleString()}</dd></div></dl>
      {recent.length > 0 && <div className="event-context"><span>Recent field context</span>{recent.map((event) => <p key={event.id}><strong>{event.kind}</strong>{event.text}</p>)}</div>}
      <details className="event-dossier"><summary>Open exact request dossier</summary><dl><dt>Runner method</dt><dd>{interaction.rawMethod}</dd><dt>Request ID</dt><dd>{String(interaction.requestId)}</dd></dl><pre>{interaction.detail}</pre></details>
    </section>
    {interaction.questions.length > 0 && <section className="event-questions" aria-label="Questions">{interaction.questions.map((question) => {
      const offered = question.options.some((option) => option.label === answers[question.id]);
      return <fieldset key={question.id} className={attempted && !answers[question.id]?.trim() ? "invalid" : ""}>
        <legend><span>{question.header}</span>{question.question}</legend>
        <div className="question-options">{question.options.map((option) => <label key={option.label} className={answers[question.id] === option.label ? "selected" : ""}>
          <input type="radio" name={question.id} checked={answers[question.id] === option.label} onChange={() => choose(question.id, option.label)} />
          <span><strong>{option.label}</strong><small>{option.description}</small></span>
        </label>)}</div>
        <label className={`freeform-decision ${answers[question.id] && !offered ? "selected" : ""}`}><input type="radio" name={question.id} checked={Boolean(answers[question.id] && !offered)} onChange={() => choose(question.id, "")} /><span>Write a different answer</span><textarea aria-label={`${question.header} free-form answer`} rows={2} value={offered ? "" : answers[question.id] ?? ""} onFocus={() => offered && choose(question.id, "")} onChange={(event) => choose(question.id, event.target.value)} /></label>
        {attempted && !answers[question.id]?.trim() && <small role="alert">Choose an option or provide an answer.</small>}
      </fieldset>;
    })}</section>}
    {interaction.policyAmendment?.length ? <section className="policy-amendment"><span>Offered policy amendment</span><ul>{interaction.policyAmendment.map((line) => <li key={line}>{line}</li>)}</ul></section> : null}
    <section className="event-decisions" aria-label="Available decisions">{interaction.offeredDecisions.map((decision) => {
      const copy = interaction.kind === "question" && decision === "accept"
        ? { title: "Submit answers", description: "Send these answers to the agent and resume the blocked request." }
        : decisionCopy(decision);
      const needsAnswers = interaction.kind === "question" && decision === "accept";
      return <button key={decision} disabled={sending} className={`decision-card decision-${decision}`} onClick={() => {
        if (needsAnswers && !complete) { setAttempted(true); return; }
        respond(decision, needsAnswers ? Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, [answer.trim()]])) : undefined);
      }}><span>{copy.title}</span><p>{copy.description}</p>{decision === "accept-amendment" && <small>Review the exact amendment above before applying.</small>}</button>;
    })}</section>
    {sending && <p className="event-status" role="status">Sending decision to the secure runner…</p>}
    {error && <p className="event-error" role="alert"><AlertTriangle aria-hidden="true" size={17} />{error} Your choices are preserved; retry when ready.</p>}
  </Dialog>;
}

function SituationRoomShell(props: ShellProps) {
  const requests = useMemo(() => collectRoomRequests(props.state), [props.state]);
  const counts = useMemo(() => roomCounts(props.state), [props.state]);
  const [deferred, setDeferred] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string>();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const active = requests.find((request) => roomRequestKey(request) === activeId);

  useEffect(() => {
    setDeferred((current) => {
      const next = reconcileDeferrals(current, requests);
      return next.size === current.size && [...next].every((id) => current.has(id)) ? current : next;
    });
    if (activeId && !requests.some((request) => roomRequestKey(request) === activeId)) {
      setActiveId(undefined);
      setSending(false);
      setSendError("");
      return;
    }
    if (!activeId) {
      const next = eligibleRoomRequests(requests, deferred)[0];
      setActiveId(next ? roomRequestKey(next) : undefined);
    }
  }, [requests, activeId, deferred]);

  const open = (request: RoomRequest) => {
    setDeferred((current) => { const next = new Set(current); next.delete(roomRequestKey(request)); return next; });
    setActiveId(roomRequestKey(request));
    setSendError("");
    void window.chromuxNext.runner.select(request.session.groupId, request.session.id);
  };
  const later = () => {
    if (!active || sending) return;
    setDeferred((current) => new Set(current).add(roomRequestKey(active)));
    setActiveId(undefined);
    setSendError("");
  };
  const respond = (decision: Decision, answers?: Record<string, string[]>) => {
    if (!active || sending) return;
    setSending(true);
    setSendError("");
    void window.chromuxNext.runner.respond({ sessionId: active.session.id, interactionId: active.interaction.id, decision, ...(answers ? { answers } : {}) })
      .catch((reason) => { setSending(false); setSendError(String(reason)); });
  };
  const visibleRecommendations = props.state.attention?.recommendations ?? [];
  return <main className="situation-room-shell">
    <header className="situation-command-bar">
      <div className="situation-title"><img src="./mark.svg" alt="" /><div><span>Experimental command interface</span><h1>Situation Room</h1></div></div>
      <dl aria-label="Room status"><div><dt>Active</dt><dd>{counts.active}</dd></div><div><dt>Blocked</dt><dd>{counts.blocked}</dd></div><div><dt>Failed</dt><dd>{counts.failed}</dd></div><div className="pending"><dt>Decisions</dt><dd>{counts.pendingRequests}</dd></div></dl>
      <div className="brand-actions">{([props.updates.app.phase, props.updates.codex.phase] as string[]).some((phase) => ["available", "staged", "blocked", "failed"].includes(phase)) && <button className="update-badge" onClick={props.openUpdates}>Update</button>}<Button icon={Settings} tone="quiet" onClick={props.openSettings}>Settings</Button><Button icon={Search} tone="quiet" onClick={props.openDetect}>Detect</Button><Button icon={Plus} tone="primary" onClick={props.openNewSession}>New Session</Button></div>
    </header>
    <aside className="situation-operations"><header><span>Operations</span><h2>Session theater</h2></header><SessionTree state={props.state} selectedSession={props.selectedSession} openGroupDialog={props.openGroupDialog} compact /></aside>
    <nav className="situation-surfaces"><SurfaceTabs surface={props.surface} setSurface={props.setSurface} /></nav>
    <section className="situation-theater"><Workspace {...props} browserEnabled={props.browserEnabled && !active} hideInteractions /></section>
    <aside className="situation-queue">
      <header><span>Global queue</span><h2>Strategic decisions</h2><Badge tone={requests.length ? "warning" : "success"}>{requests.length} pending</Badge></header>
      <div className="decision-queue-list">{requests.map((request, index) => <button key={roomRequestKey(request)} className={`${deferred.has(roomRequestKey(request)) ? "deferred" : ""} ${roomRequestKey(request) === activeId ? "active" : ""}`} onClick={() => open(request)}><span>{String(index + 1).padStart(2, "0")} · {request.interaction.kind.replaceAll("-", " ")}</span><strong>{request.interaction.title}</strong><small>{request.project} / {request.session.title}</small>{deferred.has(roomRequestKey(request)) && <Badge>Later</Badge>}</button>)}</div>
      {!requests.length && <EmptyState icon={Check} title="Queue clear" description="No agent questions or approvals are waiting." />}
      <section className="room-intelligence"><header><span>Passive intelligence</span><button onClick={() => void window.chromuxNext.attention.refresh()}>Refresh Luna</button></header>{visibleRecommendations.map((item) => <article key={item.id}><Badge tone={item.priority === "critical" ? "danger" : item.priority === "high" ? "warning" : "sage"}>{item.priority}</Badge><strong>{item.title}</strong><p>{item.reason}</p><small>{item.suggestedAction}</small></article>)}{props.state.attentionFailure && <p className="luna-failure" role="status">Luna refresh failed: {props.state.attentionFailure}</p>}{!visibleRecommendations.length && !props.state.attentionFailure && <p className="empty">No recommendations in the room.</p>}</section>
    </aside>
    {active && <SituationEvent key={active.interaction.id} request={active} sending={sending} error={sendError} later={later} respond={respond} />}
  </main>;
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

type SettingsSection = "appearance" | "projects" | "defaults" | "groups" | "updates" | "diagnostics";

function UpdateCard({ title, target, state }: { title: string; target: "app" | "codex"; state: UpdateTargetState }) {
  const busy = state.phase === "checking" || state.phase === "downloading" || state.phase === "installing";
  return <article className="update-card" aria-busy={busy}>
    <header><div><h4>{title}</h4><p>{state.currentVersion ? `Installed ${state.currentVersion}` : "Installed version unavailable"}{state.latestVersion ? ` · Latest ${state.latestVersion}` : ""}</p></div><Badge tone={state.phase === "failed" ? "danger" : state.phase === "available" || state.phase === "blocked" ? "warning" : state.phase === "current" ? "success" : "neutral"}>{state.phase}</Badge></header>
    {state.progressLabel && <p role="status">{state.progressLabel}</p>}
    {state.progressPercent !== undefined && <progress value={state.progressPercent} max={100} aria-label={`${title} update progress`} />}
    {state.failureMessage && <p className="diagnostic-error">{state.failureMessage}</p>}
    {state.blockers.length > 0 && <div className="update-blockers"><strong>Maintenance is blocked by:</strong><ul>{state.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul><p>Closing, idle, and failed sessions are safe because their threads and drafts are already persisted.</p></div>}
    {state.installKind && <p>Install kind: {state.installKind}. {state.managedInstallSupported ? "This Codex build exposes a supported update capability." : "Use the release page and your install manager to update manually."}</p>}
    {state.checkedAt && <small>Last checked {new Date(state.checkedAt).toLocaleString()}</small>}
    <div className="button-row">
      <Button icon={RefreshCw} tone="quiet" disabled={busy} onClick={() => void window.chromuxNext.updates.check(target)}>Check again</Button>
      {state.releaseUrl && <Button icon={ExternalLink} tone="quiet" onClick={() => void window.chromuxNext.updates.openReleaseNotes(target)}>Release notes</Button>}
      {target === "app" && state.phase === "available" && <Button tone="primary" onClick={() => void window.chromuxNext.updates.prepareApp()}>Prepare update</Button>}
      {target === "app" && state.phase === "downloading" && <Button tone="quiet" onClick={() => void window.chromuxNext.updates.cancelApp()}>Cancel</Button>}
      {target === "app" && state.staged && <Button tone="primary" disabled={state.blockers.length > 0} onClick={() => void window.chromuxNext.updates.installApp()}>Install and restart</Button>}
      {target === "codex" && state.phase === "available" && state.managedInstallSupported && <Button tone="primary" disabled={state.blockers.length > 0} onClick={() => void window.chromuxNext.updates.installCodex()}>Update Codex</Button>}
    </div>
  </article>;
}

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
  updates,
  initialSection,
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
  updates: UpdateStateV1;
  initialSection?: SettingsSection;
  close(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SettingsSection>(initialSection ?? "projects");
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
    <nav className="settings-tabs" aria-label="Settings sections">{(["projects", "defaults", "groups", "appearance", "updates", "diagnostics"] as SettingsSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{item}</button>)}</nav>
    <div className="settings-content">
      {section === "appearance" && <><div className="approach-grid" role="radiogroup" aria-label="Interface approach">{APPROACHES.map((approach) => <button role="radio" aria-checked={preferences.approach === approach.id} className={preferences.approach === approach.id ? "active" : ""} key={approach.id} onClick={() => update({ approach: approach.id })}><span className={`approach-preview preview-${approach.id}`}><i /><i /><i /></span><strong>{approach.title}</strong><small>{approach.description}</small></button>)}</div><section className="preference-controls"><fieldset><legend>Density</legend>{(["comfortable", "compact"] as const).map((density) => <label key={density}><input type="radio" name="density" checked={preferences.density === density} onChange={() => update({ density })} />{density}</label>)}</fieldset><fieldset><legend>Motion</legend>{(["system", "full", "reduced"] as const).map((motion) => <label key={motion}><input type="radio" name="motion" checked={preferences.motion === motion} onChange={() => update({ motion })} />{motion}</label>)}</fieldset></section></>}
      {section === "projects" && <section className="settings-section"><header><div><h3>Projects and worktrees</h3><p>Folders registered only in Chromux Next. A Git worktree is identified when its <code>.git</code> entry is a file.</p></div><button className="primary" onClick={chooseProject}>Add folder…</button></header><div className="managed-list">{workspace.projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><small>{project.kind} · {project.path}</small></div><label><input type="radio" name="default-project" checked={workspace.defaultProjectId === project.id} onChange={() => updateWorkspace({ defaultProjectId: project.id })} /> Default</label><button disabled={state.sessions.some((session) => session.status !== "closed" && session.canonicalProjectPath === project.path)} onClick={() => removeProject(project.id)}>Remove</button></article>)}{!workspace.projects.length && <p className="empty">No projects yet. Add a project or Git worktree to use it from the session picker.</p>}</div></section>}
      {section === "defaults" && <section className="settings-section defaults-grid"><h3>New session defaults</h3><label>Permissions<select value={workspace.defaultPermissionPreset} onChange={(event) => updateWorkspace({ defaultPermissionPreset: event.target.value as "workspace" | "read-only" })}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label><label>Model<select value={workspace.defaultModel ?? selectedModel?.id ?? ""} onChange={(event) => { const next = models.find((item) => item.id === event.target.value); updateWorkspace({ defaultModel: event.target.value || null, defaultReasoningEffort: next?.defaultReasoningEffort ?? null }); }}><option value="">Recommended</option>{models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select></label><label>Reasoning<select value={workspace.defaultReasoningEffort ?? selectedModel?.defaultReasoningEffort ?? ""} onChange={(event) => updateWorkspace({ defaultReasoningEffort: event.target.value || null })}><option value="">Model default</option>{selectedModel?.reasoningEfforts.map((effort) => <option key={effort}>{effort}</option>)}</select></label><p>These values seed new sessions and remain editable before creation.</p></section>}
      {section === "groups" && <section className="settings-section"><header><div><h3>Session groups</h3><p>Project groups are created automatically. Custom groups can organize sessions across projects.</p></div><Button icon={FolderPlus} tone="primary" onClick={() => openGroupDialog()}>New custom group</Button></header><div className="managed-list">{state.groups.map((group) => <article key={group.id}><div><strong>{group.title}</strong><small>{group.kind} · {group.sessionIds.length} session{group.sessionIds.length === 1 ? "" : "s"}</small></div><Button tone="quiet" disabled={group.kind !== "custom"} onClick={() => openGroupDialog(group)}>Rename</Button><Button tone="danger" disabled={group.kind !== "custom" || group.sessionIds.length > 0} onClick={() => void window.chromuxNext.runner.mutateGroup({ type: "delete", groupId: group.id })}>Delete</Button></article>)}{!state.groups.length && <EmptyState icon={FolderPlus} title="No groups yet" description="Groups appear when you create a session or add a custom group." />}</div></section>}
      {section === "updates" && <section className="settings-section updates-section"><header><div><h3>Updates</h3><p>Checks never delay startup. Downloads and installation happen only after explicit confirmation.</p></div><button onClick={() => void window.chromuxNext.updates.check("all")}>Check all</button></header><UpdateCard title="Chromux Next" target="app" state={updates.app} /><UpdateCard title="Codex CLI" target="codex" state={updates.codex} /></section>}
      {section === "diagnostics" && <section className="settings-section diagnostics"><header><div><h3>Compatibility diagnostics</h3><p>Live checks from this successor process. Credential values are never displayed.</p></div><button onClick={refreshDiagnostics}>Refresh</button></header>{diagnosticsError && <p className="diagnostic-error">{diagnosticsError}</p>}{diagnostics && <><div className="diagnostic-summary"><span>Chromux Next {diagnostics.appVersion}</span><span>{diagnostics.platform}</span><span>successor-only state</span></div><div className="managed-list">{diagnostics.checks.map((check) => <article key={check.id}><i className={`diagnostic-${check.status}`} aria-label={check.status} /><div><strong>{check.label}</strong><small>{check.detail}</small></div></article>)}</div></>}</section>}
    </div>
    <footer><button onClick={() => { update({ approach: "control-room", density: "comfortable", motion: "system" }); updateWorkspace({ defaultProjectId: null, defaultPermissionPreset: "workspace", defaultModel: null, defaultReasoningEffort: null }); }}>Reset defaults</button><button className="primary" onClick={close}>Done</button></footer>
  </div></div>;
}

export function DetectionDialog({
  onboarding,
  workspace,
  models,
  state,
  chooseProject,
  close,
  complete,
  fail
}: {
  onboarding: boolean;
  workspace: WorkspacePreferencesV1;
  models: ModelOptionV1[];
  state: RunnerStateV1;
  chooseProject(): void;
  close(): void;
  complete(): void;
  fail(reason: unknown): void;
}) {
  const [result, setResult] = useState<DetectionResultV1>();
  const [loading, setLoading] = useState(true);
  const [scanError, setScanError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DetectedTerminalV1>();
  const [mode, setMode] = useState<CreateFromDetectionInput["mode"]>("fresh");
  const recommended = models.find((model) => model.id === workspace.defaultModel)
    ?? models.find((model) => model.recommended) ?? models[0];
  const [title, setTitle] = useState("");
  const [permission, setPermission] = useState<"workspace" | "read-only">(workspace.defaultPermissionPreset);
  const [model, setModel] = useState(recommended?.id ?? "");
  const [effort, setEffort] = useState(workspace.defaultReasoningEffort ?? recommended?.defaultReasoningEffort ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [leaseValid, setLeaseValid] = useState(false);
  const [acquiringTargetId, setAcquiringTargetId] = useState("");
  const leaseIdRef = useRef("");
  const acquiringRef = useRef(false);
  const preserveFormRef = useRef(false);
  const mountedRef = useRef(true);

  const releaseLease = () => {
    const current = leaseIdRef.current;
    leaseIdRef.current = "";
    setLeaseId("");
    setLeaseValid(false);
    if (current) void window.chromuxNext.runner.releaseDetectionLease(current).catch(() => undefined);
  };

  const scan = () => {
    releaseLease();
    setLoading(true);
    setScanError("");
    setResult(undefined);
    setSelected(undefined);
    setCreateError("");
    void window.chromuxNext.runner.detectExternal()
      .then(setResult)
      .catch((reason) => setScanError(String(reason)))
      .finally(() => setLoading(false));
  };
  useEffect(scan, []);
  useEffect(() => () => {
    mountedRef.current = false;
    const current = leaseIdRef.current;
    leaseIdRef.current = "";
    if (current) void window.chromuxNext.runner.releaseDetectionLease(current).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!leaseId || !leaseValid) return;
    let renewing = false;
    const heartbeat = window.setInterval(() => {
      if (renewing) return;
      renewing = true;
      void window.chromuxNext.runner.renewDetectionLease(leaseId).catch((reason) => {
        preserveFormRef.current = true;
        setLeaseValid(false);
        setCreateError(`The detected-session reservation was lost. Your settings are preserved, but you must rescan before creating. ${String(reason)}`);
      }).finally(() => { renewing = false; });
    }, 30_000);
    return () => window.clearInterval(heartbeat);
  }, [leaseId, leaseValid]);
  const rows = (result?.rows ?? []).filter((row) =>
    `${row.projectName} ${row.title ?? ""} ${row.directory} ${row.agent} ${row.command}`.toLowerCase().includes(query.toLowerCase())
  );
  const pick = (row: DetectedTerminalV1, nextMode: CreateFromDetectionInput["mode"]) => {
    if (row.alreadyOpenSessionId) {
      const session = state.sessions.find((item) => item.id === row.alreadyOpenSessionId);
      if (session) {
        void window.chromuxNext.runner.select(session.groupId, session.id)
          .then(complete)
          .catch((reason) => {
            setScanError(String(reason));
            fail(reason);
          });
        return;
      }
    }
    if (!result || acquiringRef.current) return;
    acquiringRef.current = true;
    setAcquiringTargetId(row.targetId);
    setScanError("");
    void window.chromuxNext.runner.acquireDetectionLease({
      scanId: result.scanId,
      targetId: row.targetId
    }).then((lease) => {
      if (!mountedRef.current) {
        void window.chromuxNext.runner.releaseDetectionLease(lease.leaseId).catch(() => undefined);
        return;
      }
      leaseIdRef.current = lease.leaseId;
      setLeaseId(lease.leaseId);
      setLeaseValid(true);
      setSelected(row);
      setMode(nextMode);
      setCreateError("");
      if (!preserveFormRef.current) {
        setTitle("");
      }
      preserveFormRef.current = false;
    }).catch((reason) => {
      if (!mountedRef.current) return;
      setScanError(`Could not reserve that detected terminal. Rescan to continue. ${String(reason)}`);
    }).finally(() => {
      acquiringRef.current = false;
      if (mountedRef.current) setAcquiringTargetId("");
    });
  };
  const create = () => {
    if (!selected || !leaseId || !leaseValid) return;
    setCreating(true);
    setCreateError("");
    void window.chromuxNext.runner.createFromDetection({
      leaseId,
      mode,
      ...(title.trim() ? { title: title.trim() } : {}),
      permissionPreset: permission,
      ...(model ? { model } : {}),
      ...(effort ? { reasoningEffort: effort } : {})
    }).then(() => {
      leaseIdRef.current = "";
      setLeaseId("");
      setLeaseValid(false);
      complete();
    }).catch((reason) => {
      fail(reason);
      setCreateError(String(reason));
      setCreating(false);
    });
  };

  return <Dialog
    title={selected ? "Configure detected session" : onboarding ? "Find your work" : "Detect terminal sessions"}
    eyebrow={onboarding ? "Welcome · DETECT first" : "DETECT"}
    description={selected
      ? mode === "continue"
        ? `Create a separate continuation in ${selected.directory}. The original ${selected.terminal} process remains untouched.`
        : `Start Codex in ${selected.directory}. The original ${selected.terminal} process remains untouched.`
      : "Scan open macOS terminal tabs for agents and working folders. Detection never attaches to, types into, or stops those processes."}
    close={() => { releaseLease(); close(); }}
    dismissible={!onboarding}
    className="detection-modal onboarding-modal"
    footer={selected
      ? <><Button tone="quiet" disabled={creating} onClick={() => { releaseLease(); setSelected(undefined); }}>Back</Button><Button icon={CirclePlus} tone="primary" disabled={creating || !leaseValid || !models.length} onClick={create}>{creating ? "Creating…" : mode === "continue" ? "Create continuation" : "Start fresh"}</Button></>
      : <><div className="detection-fallbacks"><Button icon={FolderPlus} tone="quiet" onClick={chooseProject}>Choose Folder</Button>{onboarding && <Button tone="quiet" onClick={complete}>Continue Without Session</Button>}</div><Button icon={RefreshCw} onClick={scan} disabled={loading || Boolean(acquiringTargetId)}>Rescan</Button></>}
  >
    {selected ? <form className="session-form detection-config" onSubmit={(event) => { event.preventDefault(); create(); }}>
      <div className="detected-summary"><Badge tone="sage">{selected.agent}</Badge><strong>{selected.projectName}</strong><small>{selected.directory}</small></div>
      {mode === "continue" && selected.externalActive && <p className="detection-warning"><AlertTriangle size={16} aria-hidden="true" /> Chromux copies safely stored history into a separate thread. It does not share an in-progress partial turn. The external Codex process stays active, and the two threads may diverge.</p>}
      {createError && <div className="detection-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /> <span>{createError}</span>{!leaseValid && <Button icon={RefreshCw} onClick={scan}>Rescan</Button>}</div>}
      <label>Session title<input autoFocus maxLength={256} placeholder={`${selected.projectName} · automatic if blank`} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="modal-grid">
        <label>Permissions<select value={permission} onChange={(event) => setPermission(event.target.value as "workspace" | "read-only")}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label>
        <label>Model<select value={model} onChange={(event) => { setModel(event.target.value); setEffort(models.find((item) => item.id === event.target.value)?.defaultReasoningEffort ?? ""); }}><option value="">Recommended</option>{models.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label>
        <label>Reasoning<select value={effort} onChange={(event) => setEffort(event.target.value)}><option value="">Model default</option>{(models.find((item) => item.id === model)?.reasoningEfforts ?? recommended?.reasoningEfforts ?? []).map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
    </form> : <div className="detection-results">
      {loading && <EmptyState icon={Search} title="Scanning open terminal tabs…" description="macOS may ask for Terminal or iTerm Automation access so Chromux can show tab names." />}
      {!loading && scanError && <EmptyState icon={AlertTriangle} title="Detection failed" description={scanError} action={<Button icon={RefreshCw} onClick={scan}>Try again</Button>} />}
      {!loading && !scanError && result?.titlePermission === "denied" && <p className="permission-notice"><AlertTriangle size={16} aria-hidden="true" /> Tab-name access was denied. Process, agent, and folder detection still works; only tab names are unavailable.</p>}
      {!loading && !scanError && result && <label className="detection-search"><Search size={16} aria-hidden="true" /><input aria-label="Search detected terminals" placeholder="Search folders, agents, or tab names" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
      {!loading && !scanError && result && !rows.length && <EmptyState icon={TerminalSquare} title={query ? "No matching terminals" : "No terminal work found"} description={query ? "Try a different search." : "Open a terminal in a project, rescan, choose a folder, or continue without a session."} />}
      {!loading && !!rows.length && <div className="detected-list" role="list">{rows.map((row) => <article key={row.targetId} role="listitem">
        <div className="detected-row-copy"><div><Badge {...(row.agent === "codex" ? { tone: "sage" as const } : {})}>{row.agent}</Badge><strong>{row.projectName}</strong>{row.alreadyOpenSessionId && <Badge tone="success">Open</Badge>}</div><small>{row.terminal} · {row.directory}</small>{row.resumePreview && <p>{row.resumePreview}</p>}</div>
        <div className="detected-actions">{row.alreadyOpenSessionId
          ? <Button tone="primary" onClick={() => pick(row, "continue")}>Focus Existing</Button>
          : <><Button disabled={!row.resumeAvailable || Boolean(acquiringTargetId)} onClick={() => pick(row, "continue")}>{acquiringTargetId === row.targetId ? "Reserving…" : "Continue"}</Button><Button tone="primary" disabled={Boolean(acquiringTargetId)} onClick={() => pick(row, "fresh")}>{acquiringTargetId === row.targetId ? "Reserving…" : "Start Fresh"}</Button></>}</div>
      </article>)}</div>}
    </div>}
  </Dialog>;
}

function NewSessionDialog({ models, workspace, selectedSession, selectedGroupId, chooseProject, close, created, fail }: { models: ModelOptionV1[]; workspace: WorkspacePreferencesV1; selectedSession: RunnerSessionV1 | undefined; selectedGroupId: string | undefined; chooseProject(): void; close(): void; created(): void; fail(reason: unknown): void }) {
  const recommended = models.find((model) => model.id === workspace.defaultModel) ?? models.find((model) => model.recommended) ?? models[0];
  const preferredProject = workspace.projects.find((project) => project.id === workspace.defaultProjectId) ?? workspace.projects[0];
  const [project, setProject] = useState(selectedSession?.projectPath ?? preferredProject?.path ?? "");
  const [title, setTitle] = useState("");
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
        ...(title.trim() ? { title: title.trim() } : {}),
        permissionPreset: permission,
        ...(selectedGroupId ? { groupId: selectedGroupId } : {}),
        ...(model ? { model } : {}),
        ...(effort ? { reasoningEffort: effort } : {})
      }).then(created).catch(fail);
    }}>
      <label>Project or worktree<div className="path-picker"><select autoFocus value={project} onChange={(event) => setProject(event.target.value)}><option value="">Choose a registered folder</option>{workspace.projects.map((item) => <option value={item.path} key={item.id}>{item.name} · {item.kind}</option>)}{project && !workspace.projects.some((item) => item.path === project) && <option value={project}>{project}</option>}</select><Button type="button" icon={FolderPlus} onClick={chooseProject}>Add folder</Button></div></label>
      <label>Session title<input placeholder={`${project.split("/").filter(Boolean).at(-1) ?? "Project"} · automatic if blank`} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="modal-grid"><label>Permissions<select value={permission} onChange={(event) => setPermission(event.target.value as "workspace" | "read-only")}><option value="workspace">Workspace</option><option value="read-only">Read only</option></select></label><label>Model<select value={model} onChange={(event) => { setModel(event.target.value); setEffort(models.find((item) => item.id === event.target.value)?.defaultReasoningEffort ?? ""); }}><option value="">Recommended</option>{models.map((item) => <option value={item.id} key={item.id}>{item.displayName}{item.recommended ? " · recommended" : ""}</option>)}</select></label><label>Reasoning<select value={effort} onChange={(event) => setEffort(event.target.value)}><option value="">Model default</option>{(models.find((item) => item.id === model)?.reasoningEfforts ?? recommended?.reasoningEfforts ?? []).map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <p className="permission-help">{permission === "workspace" ? "Writes are limited to this workspace. Network is off by default and escalations require approval." : "Files are read-only. Network is off and approval prompts are never accepted."}</p>
    </form>
  </Dialog>;
}

function App() {
  const situationRoom = new URLSearchParams(window.location.search).get("mode") === "situation-room";
  const [state, setState] = useState<RunnerStateV1>(EMPTY_STATE);
  const [models, setModels] = useState<ModelOptionV1[]>([]);
  const [preferences, setPreferences] = useState<UiPreferencesV1>({ ...DEFAULT_UI_PREFERENCES });
  const [workspacePreferences, setWorkspacePreferences] = useState<WorkspacePreferencesV1>(
    structuredClone(DEFAULT_WORKSPACE_PREFERENCES)
  );
  const [browserWorkspace, setBrowserWorkspace] = useState<BrowserWorkspaceV1>(
    structuredClone(DEFAULT_BROWSER_WORKSPACE)
  );
  const [updates, setUpdates] = useState<UpdateStateV1>(structuredClone(DEFAULT_UPDATE_STATE));
  const [fleet, setFleet] = useState<FleetState>({ enabled: false, connection: "disabled", refreshedAt: null, items: [], error: null });
  const [settingsReady, setSettingsReady] = useState(false);
  const [surface, setSurface] = useState<CenterSurface>("runner");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("projects");
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);
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
      window.chromuxNext.settings.getWorkspacePreferences(),
      window.chromuxNext.browser.state()
      ,window.chromuxNext.updates.state()
      ,window.chromuxNext.fleet.state()
    ]).then(([nextState, nextModels, nextPreferences, nextWorkspacePreferences, nextBrowserWorkspace, nextUpdates, nextFleet]) => {
      setState(nextState);
      setModels(nextModels);
      setPreferences(nextPreferences);
      setWorkspacePreferences(nextWorkspacePreferences);
      setBrowserWorkspace(nextBrowserWorkspace);
      setUpdates(nextUpdates);
      setFleet(nextFleet);
      if (nextFleet.enabled) void window.chromuxNext.fleet.refresh().catch((reason) => setError(String(reason)));
      setSettingsReady(true);
    }).catch((reason) => setError(String(reason)));
    const offState = window.chromuxNext.runner.onState(setState);
    const offPreferences = window.chromuxNext.settings.onUiPreferencesChanged(setPreferences);
    const offWorkspacePreferences = window.chromuxNext.settings.onWorkspacePreferencesChanged(setWorkspacePreferences);
    const offBrowser = window.chromuxNext.browser.onState(setBrowserWorkspace);
    const offUpdates = window.chromuxNext.updates.onState(setUpdates);
    const offFleet = window.chromuxNext.fleet.onState(setFleet);
    return () => { offState(); offPreferences(); offWorkspacePreferences(); offBrowser(); offUpdates(); offFleet(); };
  }, []);
  useEffect(() => window.chromuxNext.agents.onEvent((event) => {
    if (event.runId !== runIdRef.current) return;
    setAgentEvents((current) => [...current, event].slice(-100));
  }), []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setSettingsSection("projects"); setSettingsOpen(true); }
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
  const shellProps: ShellProps = { state, models, surface, selectedSession, error, alignment, browserWorkspace, updates, fleetEnabled: fleet.enabled, browserEnabled: !settingsOpen && !newSessionOpen && !detectOpen && !fleetOpen && !groupDialog.open && workspacePreferences.onboardingComplete, updateBrowserWorkspace: setBrowserWorkspace, reportError: (reason) => setError(String(reason)), setSurface, openSettings: () => { setSettingsSection("projects"); setSettingsOpen(true); }, openUpdates: () => { setSettingsSection("updates"); setSettingsOpen(true); }, openNewSession: () => setNewSessionOpen(true), openDetect: () => setDetectOpen(true), openFleet: () => setFleetOpen(true), openGroupDialog, clearError: () => setError("") };
  return <div className={`app-root density-${preferences.density} motion-${preferences.motion}`} data-approach={situationRoom ? "situation-room" : preferences.approach}>
    {situationRoom ? <SituationRoomShell {...shellProps} /> : <UnifiedApproachShell approach={preferences.approach} {...shellProps} />}
    {settingsOpen && <SettingsOverlay preferences={preferences} workspace={workspacePreferences} models={models} state={state} updates={updates} initialSection={settingsSection} update={updatePreferences} updateWorkspace={updateWorkspacePreferences} chooseProject={chooseProject} removeProject={removeProject} openGroupDialog={openGroupDialog} close={() => setSettingsOpen(false)} />}
    {newSessionOpen && <NewSessionDialog models={models} workspace={workspacePreferences} selectedSession={selectedSession} selectedGroupId={state.groups.find((group) => group.id === selectedSession?.groupId)?.kind === "custom" ? selectedSession?.groupId : undefined} chooseProject={chooseProject} close={() => setNewSessionOpen(false)} created={() => { setNewSessionOpen(false); setSurface("runner"); }} fail={(reason) => setError(String(reason))} />}
    {detectOpen && workspacePreferences.onboardingComplete && <DetectionDialog onboarding={false} workspace={workspacePreferences} models={models} state={state} chooseProject={chooseProject} close={() => setDetectOpen(false)} complete={() => { setDetectOpen(false); setSurface("runner"); }} fail={(reason) => setError(String(reason))} />}
    {groupDialog.open && <GroupDialog {...(groupDialog.group ? { group: groupDialog.group } : {})} close={() => setGroupDialog({ open: false })} />}
    <FleetFeature fleet={fleet} open={fleetOpen} close={() => setFleetOpen(false)} refresh={() => void window.chromuxNext.fleet.refresh().catch((reason) => setError(String(reason)))} fail={(reason) => setError(String(reason))} />
    {settingsReady && !workspacePreferences.onboardingComplete && <DetectionDialog onboarding workspace={workspacePreferences} models={models} state={state} chooseProject={chooseProject} close={() => undefined} complete={() => { updateWorkspacePreferences({ onboardingComplete: true }); setSurface("runner"); }} fail={(reason) => setError(String(reason))} />}
  </div>;
}

const applicationRoot = document.getElementById("root");
const rendererRecoveryVisual = new URLSearchParams(window.location.search).has("renderer-recovery-visual");
function RendererRecoveryVisualFixture(): never {
  throw new Error("Visual qualification renderer failure");
}
if (applicationRoot) createRoot(applicationRoot).render(
  <RendererErrorBoundary>{rendererRecoveryVisual ? <RendererRecoveryVisualFixture /> : <App />}</RendererErrorBoundary>
);
