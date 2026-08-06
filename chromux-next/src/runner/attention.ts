import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AttentionAnalysisV1Schema,
  AttentionSnapshotV1Schema,
  type AttentionAnalysisV1,
  type AttentionSnapshotV1,
  type RunnerSessionV1
} from "./contracts";

const MAX_SNAPSHOT_BYTES = 128 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export function redact(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|password|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 64 * 1024);
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

  constructor(
    private readonly workingDirectory: string,
    private readonly command = "codex"
  ) {}

  async analyze(snapshot: AttentionSnapshotV1): Promise<AttentionAnalysisV1> {
    if (this.active) throw new Error("Attention analysis is already running");
    this.active = true;
    await mkdir(this.workingDirectory, { recursive: true });
    const schemaPath = path.join(this.workingDirectory, `attention-schema-${process.pid}.json`);
    await writeFile(schemaPath, JSON.stringify(z.toJSONSchema(AttentionAnalysisV1Schema)), { mode: 0o600 });
    const args = [
      "exec", "-m", "gpt-5.6-luna", "--json", "--ephemeral",
      "--sandbox", "read-only", "--ignore-user-config", "--ignore-rules",
      "--skip-git-repo-check", "-c", 'approval_policy="never"',
      "-c", 'model_reasoning_effort="low"', "--output-schema", schemaPath, "-"
    ];
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn(this.command, args, {
          cwd: this.workingDirectory,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, 90_000);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
          if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) child.kill("SIGTERM");
        });
        child.stderr.on("data", (chunk: string) => stderr = `${stderr}${chunk}`.slice(-20_000));
        child.on("error", reject);
        child.on("close", (code) => {
          clearTimeout(timer);
          if (timedOut) reject(new Error("Luna analysis timed out"));
          else if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) reject(new Error("Luna output exceeded 1 MiB"));
          else if (code !== 0) reject(new Error(redact(stderr || `Luna exited with status ${code}`)));
          else resolve(stdout);
        });
        child.stdin.end([
          "Analyze the bounded Chromux attention snapshot.",
          "Return at most five ranked recommendations. Use only source IDs present in the snapshot.",
          "Return only the JSON object required by the output schema.",
          JSON.stringify(snapshot)
        ].join("\n\n"));
      });
      const sourceIds = new Set<string>();
      for (const session of snapshot.sessions) {
        sourceIds.add(session.id);
        session.latestMessages.forEach((item) => sourceIds.add(item.eventId));
        session.interactions.forEach((item) => sourceIds.add(item.id));
      }
      snapshot.git.forEach((item) => sourceIds.add(item.sourceId));
      snapshot.alignment.forEach((item) => sourceIds.add(item.sourceId));
      const parsed = parseFinalJson(result);
      const validated = AttentionAnalysisV1Schema.parse(parsed);
      for (const recommendation of validated.recommendations) {
        if (recommendation.sourceIds.some((id) => !sourceIds.has(id))) {
          throw new Error("Luna returned a stale or unknown source reference");
        }
        recommendation.fingerprint = evidenceFingerprint(recommendation.sourceIds, recommendation.evidence);
      }
      return validated;
    } finally {
      this.active = false;
      await unlink(schemaPath).catch(() => undefined);
    }
  }
}

function parseFinalJson(output: string): unknown {
  const lines = output.trim().split("\n").reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string };
        result?: unknown;
      };
      const candidate = value.result ?? value.item?.text;
      if (candidate) return typeof candidate === "string" ? JSON.parse(candidate) : candidate;
    } catch { /* continue */ }
  }
  throw new Error("Luna did not return a valid final JSON object");
}
