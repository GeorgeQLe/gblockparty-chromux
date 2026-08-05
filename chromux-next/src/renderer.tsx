import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { extractSafeLinks } from "./domain/links";
import { applyMutationBatch } from "./domain/mutations";
import type {
  AgentRunEvent,
  AlignmentDocumentV1,
  AlignmentItem,
  AlignmentMutationBatchV1,
  AlignmentMutationOperation
} from "./domain/schema";
import { sampleDocument } from "./fixtures/sample-document";
import "./styles.css";

type ViewMode = "document" | "deck" | "canvas";

function itemSummary(item: AlignmentItem): string {
  if (item.kind === "heading" || item.kind === "text") return item.text;
  if (item.kind === "decision") return item.question;
  if (item.kind === "question") return item.question;
  if (item.kind === "metric") return item.label;
  if (item.kind === "code") return item.code;
  if (item.kind === "list") return item.items.join(", ");
  if (item.kind === "table") return item.columns.join(", ");
  return item.alt;
}

function RichLinks({ text }: { text: string }) {
  const links = extractSafeLinks(text);
  if (!links.length) return null;
  return (
    <div className="links">
      {links.map((link) => (
        <button key={link} className="link" onClick={() => void window.chromuxNext.browser.open(link)}>
          {link}
        </button>
      ))}
    </div>
  );
}

function ItemCard({
  item,
  selected,
  onSelect,
  onEdit,
  onReview
}: {
  item: AlignmentItem;
  selected: boolean;
  onSelect(): void;
  onEdit(text: string): void;
  onReview(status: AlignmentItem["review"]["status"]): void;
}) {
  const summary = itemSummary(item);
  const editable = item.kind === "heading" || item.kind === "text";
  return (
    <article className={`item-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <header>
        <span className="kind">{item.kind}</span>
        <span className={`review ${item.review.status}`}>{item.review.status}</span>
      </header>
      {editable ? (
        <textarea
          aria-label={`Edit ${item.kind}`}
          defaultValue={summary}
          rows={item.kind === "heading" ? 1 : 4}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (event.target.value !== summary) onEdit(event.target.value);
          }}
        />
      ) : item.kind === "decision" || item.kind === "question" ? (
        <div>
          <strong>{item.question}</strong>
          <p>{item.answer || "Unanswered"}</p>
          {item.gate && <span className="gate">Gate</span>}
        </div>
      ) : item.kind === "metric" ? (
        <div className="metric"><strong>{item.value}</strong> {item.unit}<span>{item.label}</span></div>
      ) : (
        <pre>{summary}</pre>
      )}
      <RichLinks text={summary} />
      <footer>
        <span>{item.provenance.actor}</span>
        <select
          aria-label="Review status"
          value={item.review.status}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onReview(event.target.value as AlignmentItem["review"]["status"])}
        >
          <option value="unreviewed">Unreviewed</option>
          <option value="changes-requested">Changes requested</option>
          <option value="approved">Approved</option>
        </select>
      </footer>
    </article>
  );
}

function App() {
  const [document, setDocument] = useState<AlignmentDocumentV1>(() => structuredClone(sampleDocument));
  const [filePath, setFilePath] = useState("");
  const [selectedId, setSelectedId] = useState(document.items[0]?.id ?? "");
  const [mode, setMode] = useState<ViewMode>("document");
  const [projectPath, setProjectPath] = useState("");
  const [provider, setProvider] = useState<"fake" | "codex">("fake");
  const [prompt, setPrompt] = useState("Identify one missing assumption and propose a concise note.");
  const [runId, setRunId] = useState("");
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [response, setResponse] = useState("");
  const [proposals, setProposals] = useState<AlignmentMutationBatchV1[]>([]);
  const [undoStack, setUndoStack] = useState<AlignmentMutationBatchV1[]>([]);
  const [message, setMessage] = useState("Unsaved demo fixture");

  useEffect(() => window.chromuxNext.agents.onEvent((event) => setEvents((current) => [...current.slice(-99), event])), []);

  async function persistMutation(batch: AlignmentMutationBatchV1) {
    try {
      const preview = applyMutationBatch(document, batch);
      if (!filePath) {
        const saved = await window.chromuxNext.documents.saveAs(preview.document);
        if (!saved) return;
        setFilePath(saved.filePath);
        setDocument(saved.document);
      } else {
        const saved = await window.chromuxNext.documents.apply(filePath, document, batch);
        setDocument(saved.document);
      }
      setUndoStack((current) => [...current.slice(-99), preview.inverseBatch]);
      setMessage(`Applied revision ${preview.document.revision}: ${batch.summary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function batch(summary: string, operations: AlignmentMutationOperation[]): AlignmentMutationBatchV1 {
    return {
      schemaVersion: 1,
      documentId: document.id,
      baseRevision: document.revision,
      summary,
      actor: "Human editor",
      operations
    };
  }

  async function editItem(item: AlignmentItem, text: string) {
    const updated = structuredClone(item);
    if (updated.kind !== "heading" && updated.kind !== "text") return;
    updated.text = text;
    await persistMutation(batch(`Edit ${item.kind}`, [{
      type: "item.update",
      itemId: item.id,
      item: updated
    }]));
  }

  async function save() {
    const saved = filePath
      ? await window.chromuxNext.documents.save(filePath, document)
      : await window.chromuxNext.documents.saveAs(document);
    if (!saved) return;
    setFilePath(saved.filePath);
    setDocument(saved.document);
    setMessage(`Saved ${saved.filePath}`);
  }

  async function runAgent() {
    const id = crypto.randomUUID();
    setRunId(id);
    setEvents([]);
    setResponse("");
    setProposals([]);
    const result = await window.chromuxNext.agents.run({
      id,
      provider,
      prompt,
      projectPath: projectPath || "/tmp",
      contextItemIds: selectedId ? [selectedId] : [],
      document,
      timeoutMs: 120_000
    });
    setRunId("");
    if (result.contribution) {
      setResponse(result.contribution.response);
      setProposals(result.contribution.proposedBatches);
    } else {
      setResponse(result.error?.message ?? result.status);
    }
  }

  async function undo() {
    const inverse = undoStack.at(-1);
    if (!inverse || !filePath) return;
    const currentInverse = { ...inverse, baseRevision: document.revision };
    const saved = await window.chromuxNext.documents.apply(filePath, document, currentInverse);
    setDocument(saved.document);
    setUndoStack((current) => current.slice(0, -1));
    setMessage(`Undid change at revision ${saved.document.revision}`);
  }

  const selected = document.items.find((item) => item.id === selectedId);
  const deck = document.views.find((view) => view.kind === "deck");
  const canvas = document.views.find((view) => view.kind === "canvas");
  const itemMap = useMemo(() => new Map(document.items.map((item) => [item.id, item])), [document.items]);

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand">
          <img src="/mark.svg" alt="" />
          <div><span>Experimental</span><h1>Chromux Next</h1><p>Alignment workspace</p></div>
        </div>
        <div className="file-actions">
          <button onClick={async () => {
            const opened = await window.chromuxNext.documents.open();
            if (opened) {
              setFilePath(opened.filePath);
              setDocument(opened.document);
              setSelectedId(opened.document.items[0]?.id ?? "");
              setMessage(`Opened ${opened.filePath}`);
            }
          }}>Open</button>
          <button onClick={() => void save()}>Save</button>
          <button disabled={!undoStack.length || !filePath} onClick={() => void undo()}>Undo</button>
        </div>
        <nav className="view-tabs" aria-label="Views">
          {(["document", "deck", "canvas"] as const).map((kind) => (
            <button key={kind} className={mode === kind ? "active" : ""} onClick={() => setMode(kind)}>{kind}</button>
          ))}
        </nav>
        <section className="outline">
          <h2>Outline</h2>
          {document.items.map((item, index) => (
            <button key={item.id} className={selectedId === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
              <span>{index + 1}</span>{itemSummary(item).slice(0, 46) || item.kind}
            </button>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><h2>{document.title}</h2><p>Revision {document.revision} · {document.status}</p></div>
          <div className="browser-tools">
            <button onClick={() => void window.chromuxNext.browser.action("back")}>←</button>
            <button onClick={() => void window.chromuxNext.browser.action("forward")}>→</button>
            <button onClick={() => void window.chromuxNext.browser.action("reload")}>Reload</button>
            <button onClick={() => void window.chromuxNext.browser.action("copy-link")}>Copy link</button>
            <button onClick={() => void window.chromuxNext.browser.action("open-external")}>External</button>
            <button onClick={() => void window.chromuxNext.browser.action("close")}>Close tab</button>
          </div>
        </header>

        <div className="content">
          {mode === "document" && (
            <section className="document-view">
              {document.items.map((item) => (
                <ItemCard
                  key={`${item.id}-${document.revision}`}
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                  onEdit={(text) => void editItem(item, text)}
                  onReview={(status) => void persistMutation(batch(`Review ${item.id}`, [{
                    type: "review.update",
                    itemId: item.id,
                    review: { ...item.review, status }
                  }]))}
                />
              ))}
              <button className="add-item" onClick={() => void persistMutation(batch("Insert text item", [{
                type: "item.insert",
                index: document.items.length,
                item: {
                  id: crypto.randomUUID(),
                  kind: "text",
                  text: "New alignment note",
                  provenance: { kind: "human", actor: "Human editor", createdAt: new Date().toISOString() },
                  review: { status: "unreviewed", feedback: "" }
                }
              }]))}>+ Add text item</button>
            </section>
          )}
          {mode === "deck" && (
            <section className="deck-view">
              {deck?.slides.map((slide, index) => (
                <article className={`slide ${slide.layout}`} key={slide.id}>
                  <span>Slide {index + 1}</span><h3>{slide.title}</h3>
                  {slide.itemIds.map((id) => <p key={id}>{itemMap.get(id) ? itemSummary(itemMap.get(id)!) : `Missing item: ${id}`}</p>)}
                </article>
              ))}
            </section>
          )}
          {mode === "canvas" && (
            <section className="canvas-view">
              {canvas?.nodes.map((node) => (
                <article key={node.id} style={{ left: node.x, top: node.y, width: node.width, minHeight: node.height }}>
                  {node.itemId && itemMap.get(node.itemId) ? itemSummary(itemMap.get(node.itemId)!) : node.text}
                </article>
              ))}
            </section>
          )}
        </div>
        <div className="status">{message}</div>
      </section>

      <aside className="composer">
        <header><span>Agent composer</span><small>Review before apply</small></header>
        <label>Provider<select value={provider} onChange={(event) => setProvider(event.target.value as "fake" | "codex")}><option value="fake">Deterministic fake</option><option value="codex">Codex</option></select></label>
        <label>Project path<input value={projectPath} placeholder="/path/to/workspace" onChange={(event) => setProjectPath(event.target.value)} /></label>
        <label>Context<input value={selected ? `${selected.kind}: ${itemSummary(selected).slice(0, 80)}` : "Whole document"} readOnly /></label>
        <label>Prompt<textarea rows={7} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
        <div className="run-actions">
          <button className="primary" disabled={Boolean(runId) || !prompt.trim()} onClick={() => void runAgent()}>Run</button>
          <button disabled={!runId} onClick={() => void window.chromuxNext.agents.cancel(runId)}>Cancel</button>
        </div>
        <section className="run-log">
          {events.map((event, index) => <p key={`${event.at}-${index}`}><span>{event.type}</span>{"message" in event ? event.message : ""}</p>)}
        </section>
        {response && <section className="result"><h3>Response</h3><p>{response}</p><RichLinks text={response} /></section>}
        {proposals.map((proposal) => (
          <section className="proposal" key={`${proposal.baseRevision}-${proposal.summary}`}>
            <h3>Proposed change</h3><p>{proposal.summary}</p><code>{proposal.operations.length} operation(s) · base r{proposal.baseRevision}</code>
            <div><button className="primary" onClick={() => void persistMutation(proposal)}>Apply</button><button onClick={() => setProposals((current) => current.filter((item) => item !== proposal))}>Reject</button></div>
          </section>
        ))}
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
