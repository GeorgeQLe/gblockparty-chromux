import { describe, expect, it } from "vitest";
import {
  ExternalTerminalDetector,
  classifyAgent,
  descendantPids,
  parseCwd,
  parseProcessRows,
  parseTitleRecords,
  sanitizeDetectionText
} from "../src/detection/external";

describe("external terminal detection", () => {
  it("parses bounded process data, classifies agents, sanitizes text, and excludes descendants", () => {
    const rows = parseProcessRows([
      " 10 1 ttys001 /bin/zsh -l",
      " 20 10 ttys001 /usr/local/bin/codex codex",
      " 30 20 ttys001 node worker",
      " bad row"
    ].join("\n"));
    expect(rows).toHaveLength(3);
    expect(classifyAgent(rows[1]!.command, rows[1]!.args)).toBe("codex");
    expect(classifyAgent("claude", "--continue")).toBe("claude");
    expect(classifyAgent("grok", "")).toBe("grok");
    expect(descendantPids(rows, 10)).toEqual(new Set([10, 20, 30]));
    expect(sanitizeDetectionText("hello\u0000\nworld")).toBe("hello world");
    expect(parseCwd("p20\nfcwd\nn/tmp/project\n")).toBe("/tmp/project");
    expect(parseCwd("p20\nfcwd\nn/tmp/two  spaces\n")).toBe("/tmp/two  spaces");
    expect(parseTitleRecords("Terminal\t/dev/ttys001\tBuild\u0000 tab\n")).toEqual([
      { terminal: "Terminal", tty: "ttys001", title: "Build tab" }
    ]);
  });

  it("continues without titles after Automation denial, deduplicates, enriches, and expires its cache", async () => {
    let now = Date.parse("2026-08-06T12:00:00.000Z");
    const calls: string[] = [];
    const detector = new ExternalTerminalDetector(async (rows) => rows.map((row) => ({
      ...row,
      threadId: "thread-exact",
      resumePreview: "Latest agent reply"
    })), {
      platform: "darwin",
      ownPid: 999,
      now: () => now,
      canonicalize: async (value) => value,
      run: async (command, args) => {
        calls.push(`${command} ${args[0] ?? ""}`);
        if (command.endsWith("ps")) return {
          stdout: [
            " 10 1 ttys001 /bin/zsh -l",
            " 20 10 ttys001 /usr/bin/env node /usr/local/bin/codex",
            " 999 1 ttys002 Chromux Chromux",
            " 1000 999 ttys002 codex codex"
          ].join("\n")
        };
        if (command.endsWith("osascript")) throw new Error("Not authorized to send Apple events. (-1743)");
        if (command.endsWith("lsof")) return { stdout: "p20\nfcwd\nn/tmp/project\n" };
        throw new Error("unexpected command");
      }
    });
    const result = await detector.scan();
    expect(result.titlePermission).toBe("denied");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      agent: "codex",
      directory: "/tmp/project",
      projectName: "project",
      resumeAvailable: true,
      resumePreview: "Latest agent reply"
    });
    expect(calls.filter((call) => call.includes("lsof"))).toHaveLength(1);
    expect(detector.resolve(result.scanId, result.rows[0]!.targetId).threadId).toBe("thread-exact");
    now += 120_001;
    expect(() => detector.resolve(result.scanId, result.rows[0]!.targetId)).toThrow("expired");
  });

  it("returns an adapter-friendly empty result off macOS", async () => {
    const detector = new ExternalTerminalDetector(async (rows) => rows, {
      platform: "linux",
      now: () => Date.parse("2026-08-06T12:00:00.000Z")
    });
    await expect(detector.scan()).resolves.toMatchObject({
      titlePermission: "unavailable",
      rows: []
    });
  });
});
