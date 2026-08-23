import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Search } from "lucide-react";
import type { RunnerEventV1, RunnerSessionV1 } from "../runner/contracts";
import { Badge, Button, IconButton } from "../ui/components";

const MAX_TRANSCRIPT_TEXT = 64 * 1024;
const ANSI_PATTERN = /\x1b\[([0-?]*)([ -\/]*)([@-~])/g;
const OSC_PATTERN = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)\s*$/i;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const FENCE = /^\s*(```+|~~~+)\s*([^\s`]*)?.*$/;

export type TranscriptBlock =
  | { type: "prose"; text: string }
  | { type: "code"; text: string; language?: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "terminal"; text: string }
  | { type: "graphic"; alt: string; url: string };

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function terminalSensitive(lines: string[]): boolean {
  const text = lines.join("\n");
  if (/\x1b\[[0-?]*[ -\/]*[@-~]/.test(text) || /[┌┐└┘├┤┬┴┼─│╭╮╰╯╔╗╚╝║═]/u.test(text)) return true;
  if (lines.length < 2) return false;
  const aligned = lines.filter((line) => /\S {2,}\S/.test(line)).length;
  const art = lines.filter((line) => /^\s*[+|/\\_<>=*#-]{3,}/.test(line) || /[+|/\\_<>=*#-]{4,}\s*$/.test(line)).length;
  return aligned >= 2 || art >= 2;
}

function pushTextBlock(blocks: TranscriptBlock[], lines: string[]): void {
  while (lines.length && !lines[0]!.trim()) lines.shift();
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  if (!lines.length) return;
  blocks.push(terminalSensitive(lines)
    ? { type: "terminal", text: lines.join("\n") }
    : { type: "prose", text: lines.join("\n") });
}

export function classifyTranscript(text: string): TranscriptBlock[] {
  const lines = text.slice(0, MAX_TRANSCRIPT_TEXT).replace(/\r\n?/g, "\n").split("\n");
  const blocks: TranscriptBlock[] = [];
  let prose: string[] = [];
  const flush = () => { pushTextBlock(blocks, prose); prose = []; };

  for (let index = 0; index < lines.length;) {
    const line = lines[index]!;
    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const marker = fence[1]!;
      const language = fence[2] || undefined;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[index]!)) body.push(lines[index++]!);
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", text: body.join("\n"), ...(language ? { language } : {}) });
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      flush();
      const body: string[] = [];
      while (index < lines.length && (/^(?: {4}|\t)/.test(lines[index]!) || !lines[index]!.trim())) {
        body.push(lines[index]!.replace(/^(?: {4}|\t)/, "")); index += 1;
      }
      while (body.length && !body.at(-1)!.trim()) body.pop();
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const image = line.match(IMAGE_LINE);
    if (image) {
      flush();
      blocks.push({ type: "graphic", alt: image[1] || "Remote graphic", url: image[2]! });
      index += 1;
      continue;
    }
    if (index + 1 < lines.length && line.includes("|") && TABLE_DIVIDER.test(lines[index + 1]!)) {
      flush();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) rows.push(splitTableRow(lines[index++]!));
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    prose.push(line);
    index += 1;
  }
  flush();
  return blocks;
}

type AnsiRun = { text: string; className?: string };

export function tokenizeAnsi(text: string): AnsiRun[] {
  text = text.replace(OSC_PATTERN, "");
  const runs: AnsiRun[] = [];
  let cursor = 0;
  let className: string | undefined;
  for (const match of text.matchAll(ANSI_PATTERN)) {
    if ((match.index ?? 0) > cursor) runs.push({ text: text.slice(cursor, match.index), ...(className ? { className } : {}) });
    if (match[3] === "m") {
      const codes = (match[1] || "0").split(";").map(Number);
      if (codes.includes(0)) className = undefined;
      const foreground = codes.find((code) => (code >= 30 && code <= 37) || (code >= 90 && code <= 97));
      if (foreground !== undefined) className = `ansi-${foreground}`;
    }
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), ...(className ? { className } : {}) });
  return runs;
}

const transcriptScrollPositions = new Map<string, number>();

export function RunnerTranscript({ session, openBrowser }: { session?: RunnerSessionV1; openBrowser(url: string): void }) {
  const scrollHost = useRef<HTMLDivElement>(null);
  const previousSession = useRef<string | undefined>(undefined);
  const follow = useRef(true);
  const [needle, setNeedle] = useState("");
  const [cursor, setCursor] = useState(0);
  const [activityState, setActivityState] = useState<Map<string, boolean>>(() => new Map());
  const normalizedNeedle = needle.trim().toLocaleLowerCase();
  let matchIndex = 0;

  const eventBlocks = useMemo(() => new Map((session?.events ?? []).map((event) => [event.id, classifyTranscript(event.text)])), [session?.events]);

  const highlight = (text: string, key: string): React.ReactNode => {
    if (!normalizedNeedle) return text;
    const lowered = text.toLocaleLowerCase();
    const nodes: React.ReactNode[] = [];
    let offset = 0;
    let found = lowered.indexOf(normalizedNeedle);
    while (found >= 0) {
      nodes.push(text.slice(offset, found));
      const index = matchIndex++;
      nodes.push(<mark key={`${key}-${found}`} data-transcript-match={index} data-current={index === cursor ? "true" : undefined}>{text.slice(found, found + normalizedNeedle.length)}</mark>);
      offset = found + normalizedNeedle.length;
      found = lowered.indexOf(normalizedNeedle, offset);
    }
    nodes.push(text.slice(offset));
    return nodes;
  };

  const inline = (text: string, key: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const pattern = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/gi;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      parts.push(highlight(text.slice(offset, start), `${key}-text-${start}`));
      const label = match[1] ?? match[3]!;
      const url = match[2] ?? match[3]!;
      parts.push(<button className="transcript-link" key={`${key}-link-${start}`} onClick={() => openBrowser(url)}>{highlight(label, `${key}-label-${start}`)}</button>);
      offset = start + match[0].length;
    }
    parts.push(highlight(text.slice(offset), `${key}-tail`));
    return parts;
  };

  const prose = (text: string, key: string) => {
    const lines = text.split("\n");
    const output: React.ReactNode[] = [];
    for (let index = 0; index < lines.length;) {
      const list = lines[index]!.match(/^\s*(?:[-*+] |\d+[.)] )(.*)$/);
      if (list) {
        const ordered = /^\s*\d/.test(lines[index]!);
        const items: React.ReactNode[] = [];
        while (index < lines.length) {
          const item = lines[index]!.match(/^\s*(?:[-*+] |\d+[.)] )(.*)$/);
          if (!item || /^\s*\d/.test(lines[index]!) !== ordered) break;
          items.push(<li key={`${key}-li-${index}`}>{inline(item[1]!, `${key}-li-${index}`)}</li>); index += 1;
        }
        output.push(ordered ? <ol key={`${key}-list-${index}`}>{items}</ol> : <ul key={`${key}-list-${index}`}>{items}</ul>);
      } else if (!lines[index]!.trim()) index += 1;
      else {
        const paragraph: string[] = [];
        while (index < lines.length && lines[index]!.trim() && !/^\s*(?:[-*+] |\d+[.)] )/.test(lines[index]!)) paragraph.push(lines[index++]!);
        output.push(<p key={`${key}-p-${index}`}>{paragraph.map((line, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inline(line, `${key}-p-${index}-${lineIndex}`)}</React.Fragment>)}</p>);
      }
    }
    return output;
  };

  const renderBlock = (block: TranscriptBlock, event: RunnerEventV1, index: number) => {
    const key = `${event.id}-${index}`;
    if (block.type === "prose") return <div className="transcript-markdown" key={key}>{prose(block.text, key)}</div>;
    if (block.type === "code") return <figure className="transcript-rich transcript-code" key={key}>{block.language && <figcaption>{block.language}</figcaption>}<pre><code>{highlight(block.text, key)}</code></pre></figure>;
    if (block.type === "terminal") return <pre className="transcript-rich transcript-terminal" key={key}>{tokenizeAnsi(block.text).map((run, runIndex) => <span className={run.className} key={runIndex}>{highlight(run.text, `${key}-${runIndex}`)}</span>)}</pre>;
    if (block.type === "graphic") return <button className="transcript-rich transcript-graphic" key={key} onClick={() => openBrowser(block.url)}><span>Graphic link</span><strong>{highlight(block.alt, `${key}-alt`)}</strong><small>{highlight(block.url, `${key}-url`)}</small></button>;
    return <div className="transcript-rich transcript-table-wrap" key={key}><table><thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{inline(cell, `${key}-h-${cellIndex}`)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] ?? "", `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>;
  };

  const renderEvent = (event: RunnerEventV1) => {
    const blocks = eventBlocks.get(event.id) ?? [];
    if (event.kind === "user" || event.kind === "agent") {
      return <article className={`transcript-message ${event.kind}`} key={event.id} data-event-id={event.id}>
        <span className="transcript-role">{event.kind === "user" ? "You" : "Agent"}</span>
        {blocks.map((block, index) => block.type === "prose"
          ? <div className="transcript-bubble" key={`${event.id}-${index}`}>{renderBlock(block, event, index)}</div>
          : renderBlock(block, event, index))}
      </article>;
    }
    const isOpen = activityState.get(event.id) ?? event.kind === "error";
    const summary = event.text.split("\n", 1)[0] || event.kind;
    const detailText = event.text.includes("\n") ? event.text.slice(event.text.indexOf("\n") + 1).trimStart() : "";
    const detailBlocks = detailText ? classifyTranscript(detailText) : [];
    return <details className={`transcript-activity ${event.kind}`} key={event.id} data-event-id={event.id} open={isOpen} onToggle={(toggle) => {
      const open = toggle.currentTarget.open;
      setActivityState((current) => new Map(current).set(event.id, open));
    }}><summary><span>{event.kind.replace("-", " ")}</span>{highlight(summary, `${event.id}-summary`)}</summary>{detailBlocks.length > 0 && <div className="transcript-activity-detail">{detailBlocks.map((block, index) => renderBlock(block, event, index))}</div>}</details>;
  };

  const events = session?.events ?? [];
  const renderedEvents = events.map(renderEvent);
  const matchCount = matchIndex;

  useLayoutEffect(() => {
    const host = scrollHost.current;
    if (!host) return;
    const id = session?.id;
    const switching = previousSession.current !== id;
    if (previousSession.current && switching) transcriptScrollPositions.set(previousSession.current, host.scrollTop);
    if (switching) {
      const saved = id ? transcriptScrollPositions.get(id) : undefined;
      host.scrollTop = saved ?? host.scrollHeight;
      previousSession.current = id;
    } else if (follow.current) host.scrollTop = host.scrollHeight;
    return () => { follow.current = host.scrollHeight - host.scrollTop - host.clientHeight < 72; };
  }, [session?.id, session?.events]);

  useLayoutEffect(() => {
    if (matchCount > 0 && cursor >= matchCount) setCursor(0);
  }, [cursor, matchCount]);

  useLayoutEffect(() => {
    if (!normalizedNeedle || !matchCount) return;
    const selected = scrollHost.current?.querySelector<HTMLElement>(`mark[data-transcript-match="${Math.min(cursor, matchCount - 1)}"]`);
    const details = selected?.closest("details");
    if (details && !details.open) details.open = true;
    selected?.scrollIntoView({ block: "center" });
  }, [cursor, normalizedNeedle, matchCount]);

  const move = (direction: 1 | -1) => {
    if (!matchCount) return;
    setCursor((current) => (current + direction + matchCount) % matchCount);
  };

  return <section className="terminal-shell transcript-shell" aria-label="Read-only Codex transcript">
    <div className="terminal-tools">
      <Badge tone="sage">Read only</Badge>
      <label className="transcript-search"><Search aria-hidden="true" size={15} /><input aria-label="Search transcript" placeholder="Search transcript" value={needle} onChange={(event) => { setNeedle(event.target.value); setCursor(0); }} onKeyDown={(event) => { if (event.key === "Enter") move(event.shiftKey ? -1 : 1); }} /></label>
      <span className="transcript-match-count" aria-live="polite">{normalizedNeedle ? (matchCount ? `${Math.min(cursor + 1, matchCount)} of ${matchCount}` : "No matches") : ""}</span>
      <IconButton label="Previous transcript match" icon={ArrowUp} disabled={!matchCount} onClick={() => move(-1)} />
      <IconButton label="Next transcript match" icon={ArrowDown} disabled={!matchCount} onClick={() => move(1)} />
      <Button icon={Copy} tone="quiet" onClick={() => navigator.clipboard.writeText(window.getSelection()?.toString() ?? "")}>Copy</Button>
    </div>
    <div className="transcript-scroll" ref={scrollHost} tabIndex={0} aria-label={session ? `${session.title} transcript` : "Transcript"}>
      {!session ? <p className="transcript-empty">Create or select a session to begin.</p> : <><header className="transcript-heading"><strong>{session.title}</strong><span>{session.projectPath}</span></header>{renderedEvents}</>}
    </div>
  </section>;
}
