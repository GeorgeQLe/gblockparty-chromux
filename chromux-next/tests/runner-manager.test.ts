import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStore } from "../src/persistence/local-store";
import { LunaAnalyzer } from "../src/runner/attention";
import { RunnerManager } from "../src/runner/manager";
import type { AppServerTransport } from "../src/runner/protocol";

class FakeServer extends EventEmitter implements AppServerTransport {
  requests: Array<{ method: string; params: any }> = [];
  responses: Array<{ id: string | number; result: any }> = [];
  thread = 0;
  turn = 0;
  async start() {}
  async stop() {}
  async request(method: string, params: any): Promise<any> {
    this.requests.push({ method, params });
    if (method === "model/list") return {
      data: [{
        id: "model",
        displayName: "Model",
        description: "",
        isDefault: true,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "medium" }]
      }]
    };
    if (method === "thread/start") return { thread: { id: `thread-${++this.thread}` } };
    if (method === "turn/start") return { turn: { id: `turn-${++this.turn}` } };
    return {};
  }
  respond(id: string | number, result: unknown) {
    this.responses.push({ id, result });
  }
}

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-runner-"));
  const server = new FakeServer();
  const manager = new RunnerManager(
    server,
    new LocalStore(directory),
    new LunaAnalyzer(directory, "missing-codex")
  );
  await manager.initialize();
  return { manager, server };
}

describe("runner manager", () => {
  it("auto-groups canonical projects and routes active text through steering", async () => {
    const { manager, server } = await setup();
    const first = await manager.createSession({ projectPath: "/tmp", title: "First" });
    const second = await manager.createSession({ projectPath: "/tmp", title: "Second" });
    expect(first.groupId).toBe(second.groupId);
    expect(manager.getState().groups).toHaveLength(1);

    await manager.startOrSteer({ sessionId: first.id, text: "Start" });
    await manager.startOrSteer({ sessionId: first.id, text: "Steer" });
    expect(server.requests.filter((request) => request.method === "turn/start")).toHaveLength(1);
    expect(server.requests.filter((request) => request.method === "turn/steer")).toHaveLength(1);
    expect(server.requests.find((request) => request.method === "turn/steer")?.params.expectedTurnId).toBe("turn-1");
    await manager.shutdown();
  });

  it("fails closed on unknown requests and prevents cross-session approval spoofing", async () => {
    const { manager, server } = await setup();
    const first = await manager.createSession({ projectPath: "/tmp", title: "First" });
    const second = await manager.createSession({ projectPath: "/tmp", title: "Second" });
    server.emit("request", {
      id: 7,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: first.threadId,
        turnId: "turn",
        itemId: "item",
        startedAtMs: Date.now(),
        command: "npm test"
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const interaction = manager.getState().sessions.find((session) => session.id === first.id)?.interactions[0];
    expect(interaction?.kind).toBe("command-approval");
    await expect(manager.respond({
      sessionId: second.id,
      interactionId: interaction!.id,
      decision: "accept"
    })).rejects.toThrow("does not belong");

    server.emit("request", {
      id: 8,
      method: "unsupported/request",
      params: { threadId: first.threadId }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(server.responses).toContainEqual({ id: 8, result: { decision: "cancel" } });
    expect(manager.getState().sessions.find((session) => session.id === first.id)?.events.at(-1)?.kind).toBe("error");
    await manager.shutdown();
  });
});
