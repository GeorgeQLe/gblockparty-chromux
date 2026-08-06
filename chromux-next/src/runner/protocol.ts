import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { z } from "zod";

const EnvelopeSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional()
});

export interface AppServerTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request(method: string, params: unknown): Promise<unknown>;
  respond(id: string | number, result: unknown): void;
  on(event: "notification" | "request" | "crash", listener: (value: any) => void): this;
}

export class CodexAppServer extends EventEmitter implements AppServerTransport {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve(value: unknown): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  }>();
  private stopping = false;
  private restartAttempts = 0;

  constructor(
    private readonly command = "codex",
    private readonly minimumVersion = "0.146.0"
  ) { super(); }

  async start(): Promise<void> {
    await this.checkVersion();
    await this.spawnAndInitialize();
  }

  private async checkVersion(): Promise<void> {
    const value = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.command, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", (chunk) => output += String(chunk));
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error("Codex CLI is unavailable")));
    });
    const match = value.match(/(\d+\.\d+\.\d+)/);
    if (!match || compareVersions(match[1]!, this.minimumVersion) < 0) {
      throw new Error(`Chromux Next requires Codex CLI ${this.minimumVersion}+ (found ${match?.[1] ?? "unknown"})`);
    }
  }

  private async spawnAndInitialize(): Promise<void> {
    this.process = spawn(this.command, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    const processRef = this.process;
    const lines = readline.createInterface({ input: processRef.stdout });
    lines.on("line", (line) => this.receive(line));
    processRef.stderr.on("data", () => undefined);
    processRef.on("error", (error) => this.emit("crash", error));
    processRef.on("close", (code) => {
      if (this.process !== processRef) return;
      this.process = undefined;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Codex app-server exited (${code ?? "unknown"})`));
      }
      this.pending.clear();
      if (!this.stopping) void this.restart();
    });
    const result = await this.request("initialize", {
      clientInfo: { name: "chromux_next", title: "GBlockParty Chromux Next", version: "0.2.0" },
      capabilities: { experimentalApi: true }
    }) as Record<string, unknown>;
    if (!result || typeof result !== "object" || !("userAgent" in result)) {
      await this.stop();
      throw new Error("Incompatible Codex app-server initialize response");
    }
    this.notify("initialized", {});
    await this.request("model/list", {});
    this.restartAttempts = 0;
  }

  private async restart(): Promise<void> {
    const delays = [1000, 2000, 5000];
    if (this.restartAttempts >= delays.length) {
      this.emit("crash", new Error("Codex app-server restart limit reached"));
      return;
    }
    const delay = delays[this.restartAttempts++]!;
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await this.spawnAndInitialize();
      this.emit("notification", { method: "chromux/server-restored", params: {} });
    } catch (error) {
      this.emit("crash", error);
      void this.restart();
    }
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 90_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  respond(id: string | number, result: unknown): void {
    this.write({ id, result });
  }

  private notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  private write(value: unknown): void {
    if (!this.process?.stdin.writable) throw new Error("Codex app-server is not running");
    const line = JSON.stringify(value);
    if (Buffer.byteLength(line) > 1024 * 1024) throw new Error("Protocol request exceeds 1 MiB");
    this.process.stdin.write(`${line}\n`);
  }

  private receive(line: string): void {
    if (Buffer.byteLength(line) > 1024 * 1024) {
      this.emit("crash", new Error("Codex app-server message exceeded 1 MiB"));
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch {
      this.emit("crash", new Error("Codex app-server emitted malformed JSONL"));
      return;
    }
    const envelope = EnvelopeSchema.parse(parsed);
    if (envelope.id !== undefined && !envelope.method) {
      const pending = typeof envelope.id === "number" ? this.pending.get(envelope.id) : undefined;
      if (!pending) return;
      this.pending.delete(envelope.id as number);
      clearTimeout(pending.timer);
      envelope.error ? pending.reject(new Error(envelope.error.message)) : pending.resolve(envelope.result);
      return;
    }
    if (envelope.id !== undefined && envelope.method) this.emit("request", envelope);
    else if (envelope.method) this.emit("notification", envelope);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.process?.kill();
    this.process = undefined;
  }
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}
