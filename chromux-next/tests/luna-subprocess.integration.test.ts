import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { automaticTitleInput, buildAttentionSnapshot, LunaAnalyzer } from "../src/runner/attention";
import type { RunnerSessionV1 } from "../src/runner/contracts";

const fixture = path.resolve("fixtures/subprocess-fixture.cjs");
const session: RunnerSessionV1 = {
  schemaVersion: 1, id: "session", title: "Session", projectPath: "/tmp",
  canonicalProjectPath: "/tmp", groupId: "group", status: "idle",
  permissionPreset: "read-only", historyHydration: "complete", draft: "", createdAt: "2026-08-05T12:00:00.000Z",
  updatedAt: "2026-08-05T12:00:00.000Z", events: [], interactions: []
};

async function analyzer(config: Record<string, unknown>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-luna-"));
  const scenarioPath = path.join(directory, "scenario.json");
  await writeFile(scenarioPath, JSON.stringify(config));
  return new LunaAnalyzer(directory, {
    command: process.execPath,
    prefixArgs: [fixture],
    env: { ...process.env, CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath },
    timeoutMs: 1_000,
    maxLineBytes: 4096,
    shutdownGraceMs: 30
  });
}

describe("Luna subprocess", () => {
  it("selects and fingerprints one bounded redacted request", () => {
    const selected = automaticTitleInput({
      ...session,
      events: [
        { schemaVersion: 1, id: "empty", sessionId: session.id, at: session.createdAt, kind: "user", text: "   ", links: [] },
        { schemaVersion: 1, id: "ack", sessionId: session.id, at: session.createdAt, kind: "user", text: "Okay", links: [] },
        { schemaVersion: 1, id: "request", sessionId: session.id, at: session.createdAt, kind: "user", text: `token=supersecret ${"x".repeat(700)}`, links: [] }
      ]
    });
    expect(selected?.text).not.toContain("supersecret");
    expect(selected?.text.length).toBe(512);
    expect(selected?.inputCharacters).toBe(512);
    expect(automaticTitleInput({ ...session, events: [] })).toBeUndefined();
    expect(automaticTitleInput({ ...session, events: [{ schemaVersion: 1, id: "agent", sessionId: session.id, at: session.createdAt, kind: "agent", text: "Fallback excerpt", links: [] }] })?.text)
      .toBe("Fallback excerpt");
    expect(automaticTitleInput({ ...session, events: [{ schemaVersion: 1, id: "request", sessionId: session.id, at: session.createdAt, kind: "user", text: `Different request ${"x".repeat(700)}`, links: [] }] })?.fingerprint)
      .not.toBe(selected?.fingerprint);
  });

  it("accepts fragmented JSONL and fingerprints valid evidence", async () => {
    const luna = await analyzer({
      fragments: [1, 3, 2, 5],
      lunaResult: {
        schemaVersion: 1,
        generatedAt: "2026-08-05T12:00:00.000Z",
        recommendations: [{
          id: "recommendation", priority: "high", title: "Review", reason: "Reason",
          suggestedAction: "Act", evidence: "Evidence", sourceIds: ["session"],
          fingerprint: "fixture"
        }]
      }
    });
    const result = await luna.analyze(buildAttentionSnapshot([session]));
    expect(result.recommendations[0]?.fingerprint).toMatch(/^[a-f0-9]{32}$/);
    expect(result.recommendations[0]?.fingerprint).not.toBe("fixture");
  });

  it("returns a bounded compact session title", async () => {
    const luna = await analyzer({
      lunaResult: { titles: [{ sessionId: "session", title: "Repair startup tab names." }] }
    });
    const title = await luna.summarizeTitle({
      ...session,
      events: [{
        schemaVersion: 1, id: "event", sessionId: session.id,
        at: "2026-08-05T12:01:00.000Z", kind: "user",
        text: "Fix session names after a restart", links: []
      }]
    });
    expect(title).toBe("Repair startup tab names");
  });

  it("uses no reasoning and reports subprocess token usage when present", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-luna-usage-"));
    const scenarioPath = path.join(directory, "scenario.json");
    const logPath = path.join(directory, "fixture.jsonl");
    await writeFile(scenarioPath, JSON.stringify({
      logPath,
      lunaResult: { titles: [{ sessionId: "session", title: "Token telemetry" }] },
      lunaUsage: { input_tokens: 12, cached_input_tokens: 4, output_tokens: 3, reasoning_tokens: 0, total_tokens: 15 }
    }));
    const luna = new LunaAnalyzer(directory, {
      command: process.execPath, prefixArgs: [fixture],
      env: { ...process.env, CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath }, timeoutMs: 1_000
    });
    const input = automaticTitleInput({
      ...session,
      events: [{ schemaVersion: 1, id: "event", sessionId: session.id, at: session.createdAt, kind: "user", text: "Measure title tokens", links: [] }]
    })!;
    const result = await luna.summarizeTitles([input]);
    expect(result.usage).toEqual({ inputTokens: 12, cachedInputTokens: 4, outputTokens: 3, reasoningTokens: 0, totalTokens: 15 });
    const rows = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const prompt = rows.find((row) => row.event === "prompt");
    expect(prompt.args).toContain('model_reasoning_effort="none"');
    expect(prompt.args).toContain("--ephemeral");
    expect(prompt.args).toContain("read-only");
    expect(prompt.prompt).toContain("session-title-v2");
  });

  it("keeps valid batch items when other IDs or titles are invalid", async () => {
    const luna = await analyzer({
      lunaResult: { titles: [
        { sessionId: "session", title: "Valid item" },
        { sessionId: "unknown", title: "Unknown item" },
        { sessionId: "session-2", title: "x".repeat(60) },
        { title: "Missing id" }
      ] }
    });
    const result = await luna.summarizeTitles([
      { sessionId: "session", text: "First", inputCharacters: 5, fingerprint: "a".repeat(64) },
      { sessionId: "session-2", text: "Second", inputCharacters: 6, fingerprint: "b".repeat(64) }
    ]);
    expect([...result.titles]).toEqual([["session", "Valid item"]]);
  });

  it.each([
    ["authentication", { lunaExitCode: 1 }, /authentication failed \[REDACTED\]/],
    ["malformed JSONL", { lunaMalformed: true }, /invalid JSONL/],
    ["oversized output", { lunaOversize: true, oversizeBytes: 8192 }, /invalid JSONL/],
    ["timeout", { lunaDelayMs: 2_000, ignoreTerm: true }, /timed out/],
    ["stale evidence", {
      lunaResult: {
        schemaVersion: 1, generatedAt: "2026-08-05T12:00:00.000Z",
        recommendations: [{
          id: "recommendation", priority: "high", title: "Review", reason: "Reason", suggestedAction: "Act",
          evidence: "Evidence", sourceIds: ["unknown"], fingerprint: "fixture"
        }]
      }
    }, /stale or unknown/]
  ])("rejects %s safely", async (_name, config, expected) => {
    const luna = await analyzer(config);
    await expect(luna.analyze(buildAttentionSnapshot([session]))).rejects.toThrow(expected);
  });
});
