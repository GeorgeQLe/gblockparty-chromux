import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AttentionResultV1Schema,
  AttentionSnapshotV1Schema,
  type AttentionResultV1,
  type AttentionSnapshotV1,
  type RunnerSessionV1
} from "./contracts";
import { IncrementalJsonlDecoder, terminateChild } from "./protocol";

const MAX_SNAPSHOT_BYTES = 128 * 1024;
const SessionTitleItemV1Schema = z.object({
  sessionId: z.string().min(1).max(256), title: z.string().min(1).max(48)
});
const SessionTitlesOutputV1Schema = z.object({ titles: z.array(SessionTitleItemV1Schema).max(10) });
const SessionTitlesV1Schema = z.object({ titles: z.array(z.unknown()).max(10) });
const TITLE_MODEL = "gpt-5.6-luna";
export const TITLE_PROMPT_VERSION = "session-title-v2";
export type LunaTokenUsage = {
  inputTokens: number; cachedInputTokens: number; outputTokens: number;
  reasoningTokens: number; totalTokens: number;
};
export type AutomaticTitleInput = { sessionId: string; text: string; inputCharacters: number; fingerprint: string };
export type AutomaticTitleRun = { titles: Map<string, string>; usage?: LunaTokenUsage };
export interface LunaAnalyzerOptions {
  command?: string;
  prefixArgs?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxLineBytes?: number;
  shutdownGraceMs?: number;
}

export function redact(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|password|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 64 * 1024);
}

export function automaticTitleInput(session: RunnerSessionV1): AutomaticTitleInput | undefined {
  const meaningfulUser = session.events.find((event) =>
    event.kind === "user" && Boolean(event.text.trim()) && !isControlPhrase(event.text));
  const fallbackAgent = meaningfulUser ? undefined : session.events.find((event) => event.kind === "agent" && event.text.trim());
  const text = redact((meaningfulUser ?? fallbackAgent)?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 512);
  if (!text) return undefined;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ input: text, model: TITLE_MODEL, promptVersion: TITLE_PROMPT_VERSION }))
    .digest("hex");
  return { sessionId: session.id, text, inputCharacters: text.length, fingerprint };
}

function isControlPhrase(value: string): boolean {
  const normalized = value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return /^(continue|okay|ok|proceed|go ahead|yes|yep|sure|do it|carry on|resume|sounds good|thanks|thank you)$/.test(normalized);
}

export function buildAttentionSnapshot(
  sessions: RunnerSessionV1[],
  git: AttentionSnapshotV1["git"] = [],
  now = new Date()
): AttentionSnapshotV1 {
  const candidate = AttentionSnapshotV1Schema.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    sessions: sessions.map((session) => ({
      id: session.id,
      groupId: session.groupId,
      title: redact(session.title).slice(0, 256),
      projectPath: session.canonicalProjectPath,
      status: session.status,
      updatedAt: session.updatedAt,
      latestMessages: session.events
        .filter((event) => event.kind === "user" || event.kind === "agent" || event.kind === "error")
        .slice(-8)
        .map((event) => ({
          eventId: event.id,
          kind: event.kind,
          text: redact(event.text).slice(0, 4096),
          at: event.at
        })),
      interactions: session.interactions.slice(-10).map((interaction) => ({
        id: interaction.id,
        kind: interaction.kind,
        title: redact(interaction.title).slice(0, 512),
        detail: redact(interaction.detail).slice(0, 4096)
      }))
    })),
    git: git.map((item) => ({
      ...item,
      branch: redact(item.branch).slice(0, 512),
      status: redact(item.status).slice(0, 8192)
    })),
    alignment: []
  });
  let snapshot = candidate;
  while (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES && snapshot.sessions.length) {
    snapshot = { ...snapshot, sessions: snapshot.sessions.slice(1) };
  }
  if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES) {
    throw new Error("Attention snapshot exceeds 128 KiB");
  }
  return snapshot;
}

export function snapshotHash(snapshot: AttentionSnapshotV1): string {
  const stable = { ...snapshot, generatedAt: undefined };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function evidenceFingerprint(sourceIds: string[], evidence: string): string {
  return createHash("sha256")
    .update(JSON.stringify([sourceIds.slice().sort(), redact(evidence)]))
    .digest("hex")
    .slice(0, 32);
}

export class AttentionCadence {
  private lastMeaningfulChange = 0;
  private lastAutomaticRun = 0;
  private lastHeartbeat = 0;

  changed(now = Date.now()): void { this.lastMeaningfulChange = now; }
  automaticDue(now = Date.now()): boolean {
    return this.lastMeaningfulChange > this.lastAutomaticRun
      && now - this.lastMeaningfulChange >= 30_000
      && now - this.lastAutomaticRun >= 120_000;
  }
  heartbeatDue(hashChanged: boolean, now = Date.now()): boolean {
    return hashChanged && now - this.lastHeartbeat >= 600_000;
  }
  ran(now = Date.now()): void {
    this.lastAutomaticRun = now;
    this.lastHeartbeat = now;
  }
}

export class LunaAnalyzer {
  private active = false;
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly options: Required<LunaAnalyzerOptions>;

  constructor(
    private readonly workingDirectory: string,
    options: LunaAnalyzerOptions | string = {}
  ) {
    const normalized = typeof options === "string" ? { command: options } : options;
    this.options = {
      command: normalized.command ?? "codex",
      prefixArgs: normalized.prefixArgs ?? [],
      env: normalized.env ?? process.env,
      timeoutMs: normalized.timeoutMs ?? 90_000,
      maxLineBytes: normalized.maxLineBytes ?? 1024 * 1024,
      shutdownGraceMs: normalized.shutdownGraceMs ?? 2_000
    };
  }

  async analyze(snapshot: AttentionSnapshotV1): Promise<AttentionResultV1> {
    const result = await this.runStructured(
      AttentionResultV1Schema,
      "attention",
      [
        "Analyze the bounded Chromux attention snapshot.",
        "Return at most five ranked recommendations. Use only source IDs present in the snapshot.",
        "Return only the JSON object required by the output schema.",
        JSON.stringify(snapshot)
      ].join("\n\n")
    );
    const sourceIds = new Set<string>();
    for (const session of snapshot.sessions) {
      sourceIds.add(session.id);
      session.latestMessages.forEach((item) => sourceIds.add(item.eventId));
      session.interactions.forEach((item) => sourceIds.add(item.id));
    }
    snapshot.git.forEach((item) => sourceIds.add(item.sourceId));
    snapshot.alignment.forEach((item) => sourceIds.add(item.sourceId));
    for (const recommendation of result.value.recommendations) {
      if (recommendation.sourceIds.some((id) => !sourceIds.has(id))) {
        throw new Error("Luna returned a stale or unknown source reference");
      }
      recommendation.fingerprint = evidenceFingerprint(recommendation.sourceIds, recommendation.evidence);
    }
    return result.value;
  }

  async summarizeTitles(inputs: AutomaticTitleInput[]): Promise<AutomaticTitleRun> {
    const bounded = inputs.slice(0, 10);
    if (!bounded.length) throw new Error("No session work to summarize");
    const allowed = new Set(bounded.map((item) => item.sessionId));
    const result = await this.runStructured(
      SessionTitlesV1Schema,
      "session-title",
      [
        `Prompt ${TITLE_PROMPT_VERSION}. Write one compact work title for each supplied session.`,
        "Use 2-6 words, no quotes or trailing punctuation, at most 48 characters. Return only schema JSON.",
        JSON.stringify(bounded.map(({ sessionId, text }) => ({ sessionId, request: text })))
      ].join("\n\n"),
      "none",
      SessionTitlesOutputV1Schema
    );
    const titles = new Map<string, string>();
    for (const value of result.value.titles) {
      const parsed = SessionTitleItemV1Schema.safeParse(value);
      if (!parsed.success) continue;
      const item = parsed.data;
      if (!allowed.has(item.sessionId) || titles.has(item.sessionId)) continue;
      const title = item.title.replace(/\s+/g, " ").replace(/^[\"'`]+|[\"'`.]+$/g, "").trim().slice(0, 48);
      if (title) titles.set(item.sessionId, title);
    }
    return { titles, ...(result.usage ? { usage: result.usage } : {}) };
  }

  async summarizeTitle(session: RunnerSessionV1): Promise<string> {
    const input = automaticTitleInput(session);
    if (!input) throw new Error("Session has no work to summarize");
    const result = await this.summarizeTitles([input]);
    const title = result.titles.get(session.id);
    if (!title) throw new Error("Luna did not return a session title");
    return title;
  }

  private async runStructured<T>(
    schema: z.ZodType<T>,
    label: string,
    prompt: string,
    effort = "low",
    outputSchema: z.ZodType = schema
  ): Promise<{ value: T; usage?: LunaTokenUsage }> {
    if (this.active) throw new Error("Attention analysis is already running");
    this.active = true;
    await mkdir(this.workingDirectory, { recursive: true });
    const schemaPath = path.join(this.workingDirectory, `${label}-schema-${process.pid}.json`);
    await writeFile(schemaPath, JSON.stringify(z.toJSONSchema(outputSchema)), { mode: 0o600 });
    const args = [
      "exec", "-m", TITLE_MODEL, "--json", "--ephemeral",
      "--sandbox", "read-only", "--ignore-user-config", "--ignore-rules",
      "--skip-git-repo-check", "-c", 'approval_policy="never"',
      "-c", `model_reasoning_effort="${effort}"`, "--output-schema", schemaPath, "-"
    ];
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        const child = spawn(this.options.command, [...this.options.prefixArgs, ...args], {
          cwd: this.workingDirectory,
          env: this.options.env,
          stdio: ["pipe", "pipe", "pipe"]
        });
        this.child = child;
        let stderr = "";
        let timedOut = false;
        let completed = false;
        let candidate: unknown;
        let usage: LunaTokenUsage | undefined;
        const decoder = new IncrementalJsonlDecoder(this.options.maxLineBytes, (value) => {
          const envelope = value as {
            type?: string;
            item?: { type?: string; text?: string };
            result?: unknown;
          };
          const next = envelope.result ?? envelope.item?.text;
          if (next !== undefined) candidate = typeof next === "string" ? JSON.parse(next) : next;
          usage = parseTokenUsage(value) ?? usage;
        });
        const fail = async (error: Error) => {
          if (completed) return;
          completed = true;
          clearTimeout(timer);
          await terminateChild(child, this.options.shutdownGraceMs);
          reject(error);
        };
        const timer = setTimeout(() => {
          timedOut = true;
          void fail(new Error("Luna analysis timed out"));
        }, this.options.timeoutMs);
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: Buffer) => {
          try { decoder.push(chunk); }
          catch (error) {
            void fail(new Error(`Luna emitted invalid JSONL: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
        child.stderr.on("data", (chunk: string) => stderr = `${stderr}${chunk}`.slice(-20_000));
        child.once("error", (error) => void fail(new Error(`Luna process failed: ${error.message}`)));
        child.once("close", (code) => {
          if (completed) return;
          clearTimeout(timer);
          completed = true;
          try { decoder.finish(); }
          catch (error) {
            reject(new Error(`Luna emitted invalid JSONL: ${error instanceof Error ? error.message : String(error)}`));
            return;
          }
          if (timedOut) reject(new Error("Luna analysis timed out"));
          else if (code !== 0) reject(new Error(redact(stderr || `Luna exited with status ${code}`)));
          else if (candidate === undefined) reject(new Error("Luna did not return a valid final JSON object"));
          else resolve({ candidate, ...(usage ? { usage } : {}) });
        });
        child.stdin.end(prompt);
      });
      const parsed = result as { candidate: unknown; usage?: LunaTokenUsage };
      return { value: schema.parse(parsed.candidate), ...(parsed.usage ? { usage: parsed.usage } : {}) };
    } finally {
      this.active = false;
      this.child = undefined;
      await unlink(schemaPath).catch(() => undefined);
    }
  }
}

function parseTokenUsage(value: unknown): LunaTokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, any>;
  const usage = root.usage ?? root.tokenUsage ?? root.token_usage ?? root.result?.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const knownKeys = ["input_tokens", "inputTokens", "cached_input_tokens", "cachedInputTokens", "output_tokens", "outputTokens", "reasoning_tokens", "reasoningTokens", "total_tokens", "totalTokens"];
  const hasReportedUsage = knownKeys.some((key) => Number.isFinite(usage[key]));
  if (!hasReportedUsage) return undefined;
  const read = (...keys: string[]) => {
    for (const key of keys) if (Number.isFinite(usage[key]) && usage[key] >= 0) return Math.floor(usage[key]);
    return 0;
  };
  const inputTokens = read("input_tokens", "inputTokens");
  const cachedInputTokens = read("cached_input_tokens", "cachedInputTokens")
    || (Number.isFinite(usage.input_tokens_details?.cached_tokens) ? Math.floor(usage.input_tokens_details.cached_tokens) : 0);
  const outputTokens = read("output_tokens", "outputTokens");
  const reasoningTokens = read("reasoning_tokens", "reasoningTokens")
    || (Number.isFinite(usage.output_tokens_details?.reasoning_tokens) ? Math.floor(usage.output_tokens_details.reasoning_tokens) : 0);
  const totalTokens = read("total_tokens", "totalTokens") || inputTokens + outputTokens;
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens };
}
