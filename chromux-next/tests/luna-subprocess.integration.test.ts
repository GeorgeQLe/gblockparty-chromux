import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAttentionSnapshot, LunaAnalyzer } from "../src/runner/attention";
import type { RunnerSessionV1 } from "../src/runner/contracts";

const fixture = path.resolve("fixtures/subprocess-fixture.cjs");
const session: RunnerSessionV1 = {
  schemaVersion: 1, id: "session", title: "Session", projectPath: "/tmp",
  canonicalProjectPath: "/tmp", groupId: "group", status: "idle",
  permissionPreset: "read-only", draft: "", createdAt: "2026-08-05T12:00:00.000Z",
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
    timeoutMs: 250,
    maxLineBytes: 4096,
    shutdownGraceMs: 30
  });
}

describe("Luna subprocess", () => {
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

  it.each([
    ["authentication", { lunaExitCode: 1 }, /authentication failed \[REDACTED\]/],
    ["malformed JSONL", { lunaMalformed: true }, /invalid JSONL/],
    ["oversized output", { lunaOversize: true, oversizeBytes: 8192 }, /invalid JSONL/],
    ["timeout", { lunaDelayMs: 500, ignoreTerm: true }, /timed out/],
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
