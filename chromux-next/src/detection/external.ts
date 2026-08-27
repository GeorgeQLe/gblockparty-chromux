import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  DetectionResultV1Schema,
  type DetectionCandidate,
  type DetectionResultV1,
  type EnrichedDetectionCandidate
} from "./contracts";

const runFile = promisify(execFile);
const MAX_ROWS = 100;
const MAX_OUTPUT = 1024 * 1024;
const CACHE_TTL_MS = 2 * 60_000;

type ProcessRow = { pid: number; ppid: number; tty: string; command: string; args: string };
type TitleRecord = { terminal: "Terminal" | "iTerm"; tty: string; title?: string };
type Dependencies = {
  platform: NodeJS.Platform;
  ownPid: number;
  now(): number;
  run(command: string, args: string[], options: { timeout: number; maxBuffer: number }): Promise<{ stdout: string; stderr?: string }>;
  canonicalize(value: string): Promise<string>;
  enrich(rows: DetectionCandidate[]): Promise<EnrichedDetectionCandidate[]>;
};

const DEFAULT_DEPENDENCIES: Omit<Dependencies, "enrich"> = {
  platform: process.platform,
  ownPid: process.pid,
  now: Date.now,
  run: (command, args, options) => runFile(command, args, options),
  canonicalize: realpath
};

export function sanitizeDetectionText(value: unknown, max = 512): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeTty(value: unknown): string {
  return sanitizeDetectionText(value, 128).replace(/^\/dev\//, "");
}

function sanitizeDirectoryDisplay(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 4096);
}

export function classifyAgent(command: string, args: string): DetectionCandidate["agent"] {
  const value = `${command} ${args}`.toLowerCase();
  if (/(^|[/\s])claude(?:\s|$)/.test(value)) return "claude";
  if (/(^|[/\s])codex(?:\s|$)/.test(value)) return "codex";
  if (/(^|[/\s])grok(?:\s|$)/.test(value)) return "grok";
  return "shell";
}

export function parseProcessRows(output: string): ProcessRow[] {
  return output.slice(0, MAX_OUTPUT).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
    if (!match) return [];
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid) || match[3] === "??") return [];
    return [{
      pid,
      ppid,
      tty: normalizeTty(match[3]),
      command: sanitizeDetectionText(match[4]),
      args: sanitizeDetectionText(match[5] ?? "")
    }];
  }).slice(0, 10_000);
}

export function descendantPids(rows: ProcessRow[], rootPid: number): Set<number> {
  const excluded = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (excluded.has(row.ppid) && !excluded.has(row.pid)) {
        excluded.add(row.pid);
        changed = true;
      }
    }
  }
  return excluded;
}

export function parseCwd(output: string): string | undefined {
  const line = output.slice(0, 8192).split(/\r?\n/).find((item) => item.startsWith("n/"));
  return line ? line.slice(1).replace(/\u0000/g, "").slice(0, 4096) : undefined;
}

export function parseTitleRecords(output: string): TitleRecord[] {
  return output.slice(0, 64 * 1024).split(/\r?\n/).flatMap((line) => {
    const [application, tty, ...title] = line.split("\t");
    if ((application !== "Terminal" && application !== "iTerm") || !tty) return [];
    const cleanTitle = sanitizeDetectionText(title.join("\t"));
    return [{
      terminal: application as TitleRecord["terminal"],
      tty: normalizeTty(tty),
      ...(cleanTitle ? { title: cleanTitle } : {})
    }];
  }).slice(0, MAX_ROWS);
}

function terminalFor(process: ProcessRow, title?: TitleRecord): DetectionCandidate["terminal"] {
  if (title) return title.terminal;
  return /iterm/i.test(`${process.command} ${process.args}`) ? "iTerm" : "terminal";
}

async function readTitles(run: Dependencies["run"]): Promise<{ permission: DetectionResultV1["titlePermission"]; records: TitleRecord[] }> {
  const script = `
set output to ""
try
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        set output to output & "Terminal" & tab & (tty of t) & tab & (custom title of t) & linefeed
      end repeat
    end repeat
  end tell
on error errorMessage number errorNumber
  if errorNumber is -1743 then return "__DENIED__"
end try
try
  tell application "iTerm"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          set output to output & "iTerm" & tab & (tty of s) & tab & (name of s) & linefeed
        end repeat
      end repeat
    end repeat
  end tell
on error errorMessage number errorNumber
  if errorNumber is -1743 then return "__DENIED__"
end try
return output`;
  try {
    const { stdout } = await run("/usr/bin/osascript", ["-e", script], { timeout: 4_000, maxBuffer: 64 * 1024 });
    if (stdout.includes("__DENIED__")) return { permission: "denied", records: [] };
    return { permission: "granted", records: parseTitleRecords(stdout) };
  } catch (error) {
    const detail = String(error);
    return { permission: /not authorized|-1743|automation/i.test(detail) ? "denied" : "unavailable", records: [] };
  }
}

export class ExternalTerminalDetector {
  private cached: {
    scanId: string;
    expiresAt: number;
    targets: Map<string, EnrichedDetectionCandidate>;
  } | undefined;
  private cacheTimer: NodeJS.Timeout | undefined;
  private readonly dependencies: Dependencies;

  constructor(enrich: Dependencies["enrich"], dependencies: Partial<Omit<Dependencies, "enrich">> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies, enrich };
  }

  async scan(): Promise<DetectionResultV1> {
    const scanId = randomUUID();
    const scannedAt = new Date(this.dependencies.now()).toISOString();
    if (this.dependencies.platform !== "darwin") {
      this.setCache(scanId, new Map());
      return DetectionResultV1Schema.parse({
        schemaVersion: 1, scanId, scannedAt, titlePermission: "unavailable", rows: []
      });
    }
    const [processResult, titles] = await Promise.all([
      this.dependencies.run("/bin/ps", ["-axo", "pid=,ppid=,tty=,comm=,args="], {
        timeout: 4_000, maxBuffer: MAX_OUTPUT
      }),
      readTitles(this.dependencies.run)
    ]);
    const processes = parseProcessRows(processResult.stdout);
    const excluded = descendantPids(processes, this.dependencies.ownPid);
    const eligible = processes.filter((row) => !excluded.has(row.pid));
    const interestingByTty = new Map<string, ProcessRow[]>();
    for (const row of eligible) {
      const values = interestingByTty.get(row.tty) ?? [];
      values.push(row);
      interestingByTty.set(row.tty, values);
    }
    const boundedProcesses = [...interestingByTty.values()].flatMap((values) => {
      const agents = values.filter((row) => classifyAgent(row.command, row.args) !== "shell");
      return agents.length ? agents : values.sort((a, b) => b.pid - a.pid).slice(0, 1);
    }).sort((a, b) => {
      const agentDifference = Number(classifyAgent(b.command, b.args) !== "shell")
        - Number(classifyAgent(a.command, a.args) !== "shell");
      return agentDifference || b.pid - a.pid;
    }).slice(0, 100);
    const detected = await Promise.all(boundedProcesses.map(async (processRow): Promise<DetectionCandidate | undefined> => {
      let cwd: string | undefined;
      try {
        const result = await this.dependencies.run("/usr/sbin/lsof", [
          "-a", "-p", String(processRow.pid), "-d", "cwd", "-Fn"
        ], { timeout: 1_500, maxBuffer: 8192 });
        cwd = parseCwd(result.stdout);
        if (cwd) cwd = await this.dependencies.canonicalize(cwd);
      } catch {
        return undefined;
      }
      if (!cwd?.startsWith("/")) return undefined;
      const title = titles.records.find((item) => item.tty === processRow.tty);
      return {
        ...processRow,
        cwd,
        terminal: terminalFor(processRow, title),
        ...(title?.title ? { title: title.title } : {}),
        agent: classifyAgent(processRow.command, processRow.args)
      };
    }));
    const candidates = detected.filter((item): item is DetectionCandidate => Boolean(item));
    const unique = [...new Map(candidates.map((item) => [
      `${item.tty}\0${item.cwd}\0${item.agent}`, item
    ])).values()].slice(0, MAX_ROWS);
    const enriched = (await this.dependencies.enrich(unique)).slice(0, MAX_ROWS);
    const targets = new Map<string, EnrichedDetectionCandidate>();
    const rows = enriched.map((item) => {
      const targetId = randomUUID();
      targets.set(targetId, item);
      return {
        schemaVersion: 1 as const,
        targetId,
        terminal: item.terminal,
        agent: item.agent,
        pid: item.pid,
        directory: sanitizeDirectoryDisplay(item.cwd),
        projectName: sanitizeDetectionText(path.basename(item.cwd) || item.cwd),
        ...(item.title ? { title: sanitizeDetectionText(item.title) } : {}),
        command: sanitizeDetectionText(item.command),
        externalActive: item.agent !== "shell",
        resumeAvailable: Boolean(item.threadId),
        ...(item.resumePreview ? { resumePreview: sanitizeDetectionText(item.resumePreview, 2048) } : {}),
        ...(item.threadUpdatedAt ? { threadUpdatedAt: item.threadUpdatedAt } : {}),
        ...(item.alreadyOpenSessionId ? { alreadyOpenSessionId: item.alreadyOpenSessionId } : {})
      };
    });
    this.setCache(scanId, targets);
    return DetectionResultV1Schema.parse({
      schemaVersion: 1, scanId, scannedAt, titlePermission: titles.permission, rows
    });
  }

  resolve(scanId: string, targetId: string): EnrichedDetectionCandidate {
    if (!this.cached || this.cached.scanId !== scanId || this.cached.expiresAt <= this.dependencies.now()) {
      throw new Error("Detection scan expired or was replaced. Rescan to continue.");
    }
    const target = this.cached.targets.get(targetId);
    if (!target) throw new Error("Detected terminal target is no longer available. Rescan to continue.");
    return structuredClone(target);
  }

  private setCache(scanId: string, targets: Map<string, EnrichedDetectionCandidate>): void {
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cached = { scanId, expiresAt: this.dependencies.now() + CACHE_TTL_MS, targets };
    this.cacheTimer = setTimeout(() => {
      if (this.cached?.scanId === scanId) this.cached = undefined;
      this.cacheTimer = undefined;
    }, CACHE_TTL_MS);
    this.cacheTimer.unref();
  }
}
