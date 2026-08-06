import { EventEmitter, once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { z } from "zod";

const EnvelopeSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number().optional(), message: z.string() }).optional()
}).refine((value) => value.id !== undefined || value.method !== undefined, "Protocol envelope has no id or method");

export interface AppServerTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request(method: string, params: unknown): Promise<unknown>;
  respond(id: string | number, result: unknown): void;
  getCompatibilityStatus?(): {
    minimumVersion: string;
    detectedVersion?: string;
    userAgent?: string;
    ready: boolean;
    failure?: string;
  };
  on(event: "notification" | "request" | "crash", listener: (value: any) => void): this;
}

export interface CodexAppServerOptions {
  command?: string;
  prefixArgs?: string[];
  env?: NodeJS.ProcessEnv;
  minimumVersion?: string;
  clientVersion?: string;
  requestTimeoutMs?: number;
  maxLineBytes?: number;
  restartDelaysMs?: number[];
  shutdownGraceMs?: number;
}

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

export class IncrementalJsonlDecoder {
  private buffered = Buffer.alloc(0);

  constructor(
    private readonly maxLineBytes: number,
    private readonly receive: (value: unknown) => void
  ) {}

  push(chunk: Buffer | string): void {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffered = Buffer.concat([this.buffered, incoming]);
    while (true) {
      const newline = this.buffered.indexOf(0x0a);
      if (newline < 0) {
        if (this.buffered.byteLength > this.maxLineBytes) throw new Error("JSONL partial line exceeded limit");
        return;
      }
      if (newline > this.maxLineBytes) throw new Error("JSONL line exceeded limit");
      let line = this.buffered.subarray(0, newline);
      this.buffered = this.buffered.subarray(newline + 1);
      if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
      if (!line.byteLength) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line.toString("utf8"));
      } catch {
        throw new Error("Malformed JSONL");
      }
      this.receive(parsed);
    }
  }

  finish(): void {
    if (this.buffered.byteLength) throw new Error("Truncated JSONL");
  }
}

export class CodexAppServer extends EventEmitter implements AppServerTransport {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private stopping = false;
  private ready = false;
  private restartAttempts = 0;
  private restartTimer: NodeJS.Timeout | undefined;
  private restartResolve: (() => void) | undefined;
  private restartPromise: Promise<void> | undefined;
  private detectedVersion: string | undefined;
  private userAgent: string | undefined;
  private compatibilityFailure: string | undefined;
  private readonly processFailures = new WeakMap<ChildProcessWithoutNullStreams, Error>();
  private readonly options: Required<CodexAppServerOptions>;

  constructor(options: CodexAppServerOptions | string = {}) {
    super();
    const normalized = typeof options === "string" ? { command: options } : options;
    this.options = {
      command: normalized.command ?? "codex",
      prefixArgs: normalized.prefixArgs ?? [],
      env: normalized.env ?? process.env,
      minimumVersion: normalized.minimumVersion ?? "0.146.0",
      clientVersion: normalized.clientVersion ?? "0.6.0",
      requestTimeoutMs: normalized.requestTimeoutMs ?? 90_000,
      maxLineBytes: normalized.maxLineBytes ?? 1024 * 1024,
      restartDelaysMs: normalized.restartDelaysMs ?? [1000, 2000, 5000],
      shutdownGraceMs: normalized.shutdownGraceMs ?? 2_000
    };
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.compatibilityFailure = undefined;
    try {
      await this.checkVersion();
    } catch (error) {
      this.compatibilityFailure = error instanceof Error ? error.message : String(error);
      throw error;
    }
    try {
      await this.spawnAndInitialize();
    } catch (error) {
      this.compatibilityFailure = error instanceof Error ? error.message : String(error);
      await this.stop();
      throw error;
    }
  }

  getCompatibilityStatus() {
    return {
      minimumVersion: this.options.minimumVersion,
      ...(this.detectedVersion ? { detectedVersion: this.detectedVersion } : {}),
      ...(this.userAgent ? { userAgent: this.userAgent } : {}),
      ready: this.ready,
      ...(this.compatibilityFailure ? { failure: this.compatibilityFailure } : {})
    };
  }

  private spawnOptions(): SpawnOptionsWithoutStdio {
    return { env: this.options.env };
  }

  private async checkVersion(): Promise<void> {
    const value = await new Promise<string>((resolve, reject) => {
      let child;
      try {
        child = spawn(this.options.command, [...this.options.prefixArgs, "--version"], {
          ...this.spawnOptions(), stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (error) {
        reject(new Error(`Codex CLI is unavailable: ${String(error)}`));
        return;
      }
      let output = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(output);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("Codex CLI version check timed out"));
      }, this.options.requestTimeoutMs);
      child.stdout.on("data", (chunk) => { output += String(chunk); });
      child.once("error", () => finish(new Error("Codex CLI is unavailable")));
      child.once("close", (code) => finish(code === 0 ? undefined : new Error("Codex CLI is unavailable")));
    });
    const match = value.match(/(\d+\.\d+\.\d+)/);
    this.detectedVersion = match?.[1];
    if (!match || compareVersions(match[1]!, this.options.minimumVersion) < 0) {
      throw new Error(`Chromux Next requires Codex CLI ${this.options.minimumVersion}+ (found ${match?.[1] ?? "unknown"})`);
    }
  }

  private async spawnAndInitialize(): Promise<void> {
    if (this.stopping) throw new Error("Codex app-server is stopping");
    const child = spawn(this.options.command, [...this.options.prefixArgs, "app-server"], {
      ...this.spawnOptions(), stdio: ["pipe", "pipe", "pipe"]
    });
    this.process = child;
    this.ready = false;
    let compromised = false;
    const decoder = new IncrementalJsonlDecoder(this.options.maxLineBytes, (value) => {
      try {
        this.receive(value);
      } catch (error) {
        compromised = true;
        void this.compromise(child, error);
      }
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (compromised) return;
      try { decoder.push(chunk); }
      catch (error) {
        compromised = true;
        void this.compromise(child, error);
      }
    });
    child.stderr.on("data", () => undefined);
    child.once("error", (error) => {
      const failure = new Error(`Codex app-server failed: ${error.message}`);
      this.processFailures.set(child, failure);
      if (this.process === child) this.handleExit(child, failure);
    });
    child.once("close", (code) => {
      if (!compromised) {
        try { decoder.finish(); }
        catch (error) {
          compromised = true;
          this.processFailures.set(
            child,
            new Error(`Codex app-server protocol violation: ${error instanceof Error ? error.message : String(error)}`)
          );
        }
      }
      if (this.process === child) {
        this.handleExit(
          child,
          this.processFailures.get(child) ?? new Error(`Codex app-server exited (${code ?? "unknown"})`)
        );
      }
    });

    const result = await this.request("initialize", {
      clientInfo: {
        name: "chromux_next",
        title: "GBlockParty Chromux Next",
        version: this.options.clientVersion
      },
      capabilities: { experimentalApi: true }
    }) as Record<string, unknown>;
    if (!result || typeof result !== "object" || typeof result.userAgent !== "string") {
      throw new Error("Incompatible Codex app-server initialize response");
    }
    this.userAgent = result.userAgent;
    this.notify("initialized", {});
    await this.request("model/list", {});
    this.restartAttempts = 0;
    this.ready = true;
    this.compatibilityFailure = undefined;
  }

  private handleExit(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== child) return;
    this.process = undefined;
    this.ready = false;
    this.compatibilityFailure = error.message;
    this.rejectPending(error);
    if (!this.stopping) {
      this.emit("crash", error);
      this.scheduleRestart();
    }
  }

  private async compromise(child: ChildProcessWithoutNullStreams, cause: unknown): Promise<void> {
    if (this.process !== child) return;
    const error = new Error(`Codex app-server protocol violation: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.processFailures.set(child, error);
    this.rejectPending(error);
    await terminateChild(child, this.options.shutdownGraceMs);
  }

  private scheduleRestart(): void {
    if (this.stopping || this.restartTimer || this.restartPromise) return;
    if (this.restartAttempts >= this.options.restartDelaysMs.length) {
      this.emit("crash", new Error("Codex app-server restart limit reached"));
      return;
    }
    const delay = this.options.restartDelaysMs[this.restartAttempts++]!;
    this.restartPromise = new Promise<void>((resolve) => {
      this.restartResolve = resolve;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = undefined;
        this.restartResolve = undefined;
        resolve();
      }, delay);
    }).then(async () => {
      if (this.stopping) return;
      try {
        await this.spawnAndInitialize();
        this.emit("notification", { method: "chromux/server-restored", params: {} });
      } catch (error) {
        await this.terminateCurrent(error);
        if (!this.stopping) {
          this.emit("crash", error);
          this.scheduleRestart();
        }
      }
    }).finally(() => {
      this.restartPromise = undefined;
      this.restartResolve = undefined;
      if (!this.stopping && !this.process) this.scheduleRestart();
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.reject(new Error(`${method} timed out`));
        if (this.process) void this.compromise(this.process, new Error(`${method} timed out`));
      }, this.options.requestTimeoutMs);
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
    if (Buffer.byteLength(line) > this.options.maxLineBytes) throw new Error("Protocol request exceeds line limit");
    this.process.stdin.write(`${line}\n`);
  }

  private receive(value: unknown): void {
    const envelope = EnvelopeSchema.parse(value);
    if (envelope.id !== undefined && !envelope.method) {
      const pending = typeof envelope.id === "number" ? this.pending.get(envelope.id) : undefined;
      if (!pending) return;
      this.pending.delete(envelope.id as number);
      clearTimeout(pending.timer);
      envelope.error ? pending.reject(new Error(redact(envelope.error.message))) : pending.resolve(envelope.result);
      return;
    }
    if (envelope.id !== undefined && envelope.method) this.emit("request", envelope);
    else if (envelope.method) this.emit("notification", envelope);
  }

  private rejectPending(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const item of pending) {
      clearTimeout(item.timer);
      item.reject(error);
    }
  }

  private async terminateCurrent(cause: unknown): Promise<void> {
    const child = this.process;
    this.process = undefined;
    this.ready = false;
    this.rejectPending(cause instanceof Error ? cause : new Error(String(cause)));
    if (child) await terminateChild(child, this.options.shutdownGraceMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
      this.restartResolve?.();
      this.restartResolve = undefined;
    }
    const restart = this.restartPromise;
    this.restartPromise = undefined;
    this.rejectPending(new Error("Codex app-server stopped"));
    const child = this.process;
    this.process = undefined;
    this.ready = false;
    if (child) await terminateChild(child, this.options.shutdownGraceMs);
    await restart?.catch(() => undefined);
  }
}

export async function terminateChild(child: ChildProcessWithoutNullStreams, graceMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.stdin.end();
  child.kill("SIGTERM");
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    once(child, "exit").then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        resolve();
      }, graceMs);
    })
  ]);
  if (timer) clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) {
    await once(child, "exit").catch(() => undefined);
  }
}

function redact(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]");
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
