import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import {
  AgentContributionSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  type AgentRunRequest
} from "../domain/schema";
import { event, type AgentProvider } from "./provider";

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export class CodexProvider implements AgentProvider {
  readonly id = "codex" as const;
  private child: ChildProcessWithoutNullStreams | undefined;

  async run(input: AgentRunRequest, emit: Parameters<AgentProvider["run"]>[1], signal: AbortSignal) {
    const request = AgentRunRequestSchema.parse(input);
    emit(event("started", request.id));
    const prompt = [
      "You are contributing to a structured alignment document.",
      "Do not edit files or execute commands. Return only a JSON object matching the supplied schema.",
      `User request:\n${request.prompt}`,
      `Selected item context IDs:\n${request.contextItemIds.join(", ") || "(whole document)"}`,
      `Immutable document snapshot:\n${JSON.stringify(request.document)}`
    ].join("\n\n");
    const finalSchema = z.toJSONSchema(AgentContributionSchema);
    const schemaPath = path.join(os.tmpdir(), `chromux-next-codex-schema-${request.id}.json`);
    await writeFile(schemaPath, JSON.stringify(finalSchema), { encoding: "utf8", mode: 0o600 });
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "-"
    ];

    let output = "";
    let stderr = "";
    try {
      this.child = spawn("codex", args, {
        cwd: request.projectPath,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      await unlink(schemaPath).catch(() => undefined);
      return this.failure(request, emit, "missing-cli", String(error));
    }

    const child = this.child;
    const abort = () => child.kill("SIGTERM");
    signal.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, request.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) child.kill("SIGTERM");
      for (const line of chunk.split("\n").filter(Boolean)) {
        try {
          const parsed = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string }; message?: string };
          const text = parsed.item?.text ?? parsed.message;
          if (text) emit(event("progress", request.id, { message: text.slice(0, 20_000) }));
        } catch {
          // A partial JSONL line is retained for final parsing.
        }
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-20_000);
    });
    child.stdin.end(prompt);
    let exitCode: number | null;
    try {
      [exitCode] = (await once(child, "exit")) as [number | null];
    } catch (error) {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      this.child = undefined;
      await unlink(schemaPath).catch(() => undefined);
      return this.failure(request, emit, "missing-cli", String(error));
    }
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    this.child = undefined;
    await unlink(schemaPath).catch(() => undefined);

    if (signal.aborted) {
      emit(event("cancelled", request.id));
      return AgentRunResultSchema.parse({ runId: request.id, provider: this.id, status: "cancelled" });
    }
    if (timedOut) return this.failure(request, emit, "timeout", "Codex run timed out");
    if (exitCode !== 0) {
      const code = stderr.toLowerCase().includes("auth") ? "authentication-failure" : "process-failed";
      return this.failure(request, emit, code, redact(stderr || `Codex exited with status ${exitCode}`));
    }
    try {
      const lines = output.trim().split("\n").reverse();
      const completed = lines
        .map((line) => {
          try { return JSON.parse(line) as { type?: string; result?: unknown; item?: { type?: string; text?: string } }; }
          catch { return undefined; }
        })
        .find((entry) => entry?.type === "turn.completed" || entry?.type === "item.completed");
      const candidate = completed?.result ?? completed?.item?.text;
      const contribution = AgentContributionSchema.parse(
        typeof candidate === "string" ? JSON.parse(candidate) : candidate
      );
      emit(event("output", request.id, { text: contribution.response }));
      emit(event("completed", request.id));
      return AgentRunResultSchema.parse({
        runId: request.id,
        provider: this.id,
        status: "completed",
        contribution
      });
    } catch (error) {
      return this.failure(request, emit, "invalid-output", `Codex output failed validation: ${String(error)}`);
    }
  }

  cancel(): void {
    this.child?.kill("SIGTERM");
  }

  private failure(
    request: AgentRunRequest,
    emit: Parameters<AgentProvider["run"]>[1],
    code: string,
    message: string
  ) {
    emit(event("failed", request.id, { code, message }));
    return AgentRunResultSchema.parse({
      runId: request.id,
      provider: this.id,
      status: "failed",
      error: { code, message }
    });
  }
}

function redact(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]");
}
