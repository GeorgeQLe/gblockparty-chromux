import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CodexAppServer, IncrementalJsonlDecoder } from "../src/runner/protocol";

const fixture = path.resolve("fixtures/subprocess-fixture.cjs");
const servers: CodexAppServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function scenario(value: Record<string, unknown>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-protocol-"));
  const scenarioPath = path.join(directory, "scenario.json");
  const logPath = path.join(directory, "log.jsonl");
  await writeFile(scenarioPath, JSON.stringify({ ...value, logPath }));
  const server = new CodexAppServer({
    command: process.execPath,
    prefixArgs: [fixture],
    env: { ...process.env, CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath },
    requestTimeoutMs: 300,
    maxLineBytes: 4096,
    restartDelaysMs: [10, 20, 50],
    shutdownGraceMs: 40
  });
  servers.push(server);
  return { server, logPath };
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeout = 1_000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for fixture event");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("incremental JSONL decoder", () => {
  it("decodes arbitrary UTF-8 chunks and rejects malformed, schema-independent framing", () => {
    const values: unknown[] = [];
    const decoder = new IncrementalJsonlDecoder(64, (value) => values.push(value));
    for (const chunk of [Buffer.from('{"a"'), Buffer.from(":1}\n{\""), Buffer.from('b":"✓"}\n')]) decoder.push(chunk);
    decoder.finish();
    expect(values).toEqual([{ a: 1 }, { b: "✓" }]);
    expect(() => new IncrementalJsonlDecoder(4, () => undefined).push("12345")).toThrow("partial line");
    expect(() => new IncrementalJsonlDecoder(64, () => undefined).push("{bad}\n")).toThrow("Malformed");
  });
});

describe("Codex app-server subprocess", () => {
  it("initializes with 0.6.0 and handles fragmented responses, notifications, and server requests", async () => {
    const { server, logPath } = await scenario({
      fragments: [1, 2, 3, 5, 8],
      notificationAfter: "thread/start",
      notificationThreadId: "fixture-thread-1",
      requestAfter: "thread/start",
      requestThreadId: "fixture-thread-1"
    });
    const notifications: any[] = [];
    const requests: any[] = [];
    server.on("notification", (value) => notifications.push(value));
    server.on("request", (value) => requests.push(value));
    await server.start();
    expect(await server.request("thread/start", {})).toEqual({ thread: { id: "fixture-thread-1" } });
    await waitFor(() => notifications.some((item) => item.method === "item/agentMessage/delta") && requests.length === 1);
    const log = await readFile(logPath, "utf8");
    expect(log).toContain('"version":"0.6.0"');
    server.respond("server-request", { decision: "decline" });
  });

  it("rejects unavailable and incompatible CLI versions without leaving an app-server", async () => {
    const unavailable = new CodexAppServer({ command: path.join(os.tmpdir(), "missing-chromux-cli") });
    await expect(unavailable.start()).rejects.toThrow("unavailable");
    const { server, logPath } = await scenario({ version: "0.145.9" });
    await expect(server.start()).rejects.toThrow("0.146.0+");
    const log = await readFile(logPath, "utf8");
    expect(log).not.toContain('"mode":"app-server"');
  });

  it("bounds and cleans up a hung version check", async () => {
    const { server } = await scenario({ hangVersion: true });
    await expect(server.start()).rejects.toThrow("version check timed out");
  });

  it.each([
    ["incompatible initialization", { initializeResult: {} }, "Incompatible"],
    ["authentication response", { errorOn: "initialize" }, "authentication failed [REDACTED]"],
    ["model discovery failure", { errorOn: "model/list" }, "authentication failed [REDACTED]"],
    ["malformed output", { malformedOn: "initialize" }, "protocol violation"],
    ["schema-invalid output", { schemaInvalidOn: "initialize" }, "protocol violation"],
    ["oversized complete output", { oversizeOn: "initialize", oversizeBytes: 8192 }, "protocol violation"],
    ["oversized partial output", { partialOversizeOn: "initialize", oversizeBytes: 8192 }, "protocol violation"],
    ["wrong response ID", { wrongIdOn: "initialize" }, "timed out"],
    ["request timeout", { noResponseOn: "initialize" }, "timed out"]
  ])("cleans up after %s", async (_name, config, message) => {
    const { server, logPath } = await scenario(config);
    await expect(server.start()).rejects.toThrow(message);
    await server.stop();
    await waitFor(async () => (await readFile(logPath, "utf8")).includes('"event":"exit"'));
    const log = await readFile(logPath, "utf8");
    expect(log).toContain('"event":"exit"');
  });

  it("recovers successfully and cancels outstanding restart work on stop", async () => {
    const { server, logPath } = await scenario({ crashOnByStart: { "1": "thread/start" } });
    const crashes: Error[] = [];
    const restored: any[] = [];
    server.on("crash", (error) => crashes.push(error));
    server.on("notification", (event) => {
      if (event.method === "chromux/server-restored") restored.push(event);
    });
    await server.start();
    await expect(server.request("thread/start", {})).rejects.toThrow("exited");
    await waitFor(() => crashes.length >= 1 && restored.length === 1);
    expect(await server.request("thread/start", {})).toEqual({ thread: { id: "fixture-thread-1" } });
    await server.stop();
    const countAtStop = (await readFile(logPath, "utf8")).split('"mode":"app-server"').length - 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const countAfter = (await readFile(logPath, "utf8")).split('"mode":"app-server"').length - 1;
    expect(countAfter).toBe(countAtStop);
  });

  it("applies ordered backoff and stops after the configured restart limit", async () => {
    const { server, logPath } = await scenario({
      crashOnByStart: {
        "1": "thread/start",
        "2": "initialize",
        "3": "initialize",
        "4": "initialize"
      }
    });
    const crashes: Error[] = [];
    server.on("crash", (error) => crashes.push(error));
    await server.start();
    await expect(server.request("thread/start", {})).rejects.toThrow("exited");
    await waitFor(() => crashes.some((error) => error.message.includes("restart limit reached")), 2_000);
    const entries = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const starts = entries.filter((entry) => entry.event === "start" && entry.mode === "app-server");
    expect(starts).toHaveLength(4);
    expect(starts[1].at - starts[0].at).toBeGreaterThanOrEqual(5);
    expect(starts[2].at - starts[1].at).toBeGreaterThanOrEqual(15);
    expect(starts[3].at - starts[2].at).toBeGreaterThanOrEqual(45);
    await server.stop();
  });
});
