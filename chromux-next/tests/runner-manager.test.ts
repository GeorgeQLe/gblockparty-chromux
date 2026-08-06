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
  failResume = new Set<string>();
  failStart = false;
  listedThreads: any[] = [];
  threadReads = new Map<string, any>();
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
    if (method === "thread/start") {
      if (this.failStart) throw new Error("start failed");
      return { thread: { id: `thread-${++this.thread}` } };
    }
    if (method === "thread/list") return { data: this.listedThreads };
    if (method === "thread/read") return this.threadReads.get(params.threadId) ?? {};
    if (method === "turn/start") return { turn: { id: `turn-${++this.turn}` } };
    if (method === "thread/resume" && this.failResume.has(params.threadId)) throw new Error("resume failed");
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
    await manager.closeSession(second.id);
    await expect(manager.select(second.groupId, second.id)).rejects.toThrow("Closed sessions");
    await manager.shutdown();
  });

  it("enriches only exact-cwd Codex rows and marks already-open threads", async () => {
    const { manager, server } = await setup();
    const canonicalTmp = await (await import("node:fs/promises")).realpath("/tmp");
    const open = await manager.createSession({ projectPath: canonicalTmp, title: "Open" });
    server.listedThreads = [
      { id: open.threadId, cwd: canonicalTmp, updatedAt: "2026-08-06T12:00:00.000Z" },
      { id: "other", cwd: "/private", type: "agentMessage", text: "wrong folder" }
    ];
    server.threadReads.set(open.threadId!, {
      thread: {
        turns: [{ items: [{ type: "agentMessage", content: [{ type: "text", text: `${"x".repeat(3_000)}\u0000` }] }] }]
      }
    });
    const rows = await manager.enrichDetection([{
      pid: 10, ppid: 1, tty: "ttys001", command: "codex", args: "codex",
      cwd: canonicalTmp, terminal: "Terminal", agent: "codex"
    }, {
      pid: 11, ppid: 1, tty: "ttys002", command: "claude", args: "claude",
      cwd: canonicalTmp, terminal: "Terminal", agent: "claude"
    }]);
    expect(rows[0]).toMatchObject({
      threadId: open.threadId,
      alreadyOpenSessionId: open.id,
      resumePreview: "x".repeat(2048)
    });
    expect(rows[0]?.resumePreview).toHaveLength(2048);
    expect(rows[1]?.threadId).toBeUndefined();
    server.requests = [];
    await manager.enrichDetection(Array.from({ length: 25 }, (_, index) => ({
      pid: 100 + index,
      ppid: 1,
      tty: `ttys${index}`,
      command: "codex",
      args: "codex",
      cwd: canonicalTmp,
      terminal: "Terminal" as const,
      agent: "codex" as const
    })));
    expect(server.requests.filter((request) => request.method === "thread/read")).toHaveLength(20);
    await manager.shutdown();
  });

  it("creates detected sessions transactionally and leaves no partial state on failure", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-detected-"));
    const server = new FakeServer();
    const store = new LocalStore(directory);
    const manager = new RunnerManager(server, store, new LunaAnalyzer(directory, "missing-codex"));
    await manager.initialize();
    const canonicalTmp = await (await import("node:fs/promises")).realpath("/tmp");
    server.failStart = true;
    await expect(manager.createDetectedSession({
      cwd: canonicalTmp,
      mode: "fresh",
      title: "Failed",
      permissionPreset: "workspace"
    })).rejects.toThrow("start failed");
    expect(manager.getState().sessions).toHaveLength(0);
    expect(manager.getState().groups).toHaveLength(0);
    expect((await store.getWorkspacePreferences()).projects).toHaveLength(0);

    server.failStart = false;
    const created = await manager.createDetectedSession({
      cwd: canonicalTmp,
      mode: "resume",
      threadId: "saved-thread",
      title: "Resumed",
      permissionPreset: "read-only"
    });
    expect(created.session).toMatchObject({ threadId: "saved-thread", status: "idle" });
    expect((await store.getWorkspacePreferences()).projects[0]?.path).toBe(canonicalTmp);
    expect(server.requests).toContainEqual({
      method: "thread/resume",
      params: expect.objectContaining({ threadId: "saved-thread", cwd: canonicalTmp })
    });

    const fresh = await manager.createDetectedSession({
      cwd: canonicalTmp,
      mode: "fresh",
      threadId: "saved-thread",
      title: "Actually fresh",
      permissionPreset: "workspace"
    });
    expect(fresh.session.threadId).not.toBe("saved-thread");
    expect(server.requests.filter((request) => request.method === "thread/start")).toHaveLength(2);
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

  it("normalizes every approval family and sends exact wire responses", async () => {
    const { manager, server } = await setup();
    const session = await manager.createSession({ projectPath: "/tmp", title: "Approval" });
    const offer = async (id: number, method: string, params: Record<string, unknown>) => {
      server.emit("request", { id, method, params: { threadId: session.threadId, ...params } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      return manager.getState().sessions.find((item) => item.id === session.id)!.interactions.at(-1)!;
    };

    let interaction = await offer(10, "item/commandExecution/requestApproval", { command: "npm test" });
    expect(interaction.offeredDecisions).toEqual(["accept", "accept-session", "decline", "cancel"]);
    await manager.respond({ sessionId: session.id, interactionId: interaction.id, decision: "accept-session" });
    expect(server.responses.at(-1)).toEqual({ id: 10, result: { decision: "acceptForSession" } });

    interaction = await offer(11, "item/commandExecution/requestApproval", {
      command: "curl example.com", networkApprovalContext: { host: "example.com" },
      proposedExecpolicyAmendment: ["allow curl"]
    });
    expect(interaction.kind).toBe("network-approval");
    expect(interaction.offeredDecisions).toContain("accept-amendment");
    await manager.respond({ sessionId: session.id, interactionId: interaction.id, decision: "accept-amendment" });
    expect(server.responses.at(-1)).toEqual({
      id: 11,
      result: { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ["allow curl"] } } }
    });

    interaction = await offer(12, "item/fileChange/requestApproval", { reason: "write file" });
    expect(interaction.kind).toBe("file-approval");
    await manager.respond({ sessionId: session.id, interactionId: interaction.id, decision: "decline" });
    expect(server.responses.at(-1)).toEqual({ id: 12, result: { decision: "decline" } });

    interaction = await offer(13, "item/tool/requestUserInput", {
      questions: [{ id: "choice", header: "Choice", question: "Pick", options: [{ label: "A" }] }]
    });
    expect(interaction.kind).toBe("question");
    await manager.respond({
      sessionId: session.id, interactionId: interaction.id, decision: "accept", answers: { choice: ["A"] }
    });
    expect(server.responses.at(-1)).toEqual({ id: 13, result: { answers: { choice: { answers: ["A"] } } } });

    interaction = await offer(14, "item/commandExecution/requestApproval", { command: "false" });
    await manager.respond({ sessionId: session.id, interactionId: interaction.id, decision: "cancel" });
    expect(server.responses.at(-1)).toEqual({ id: 14, result: { decision: "cancel" } });
    await manager.shutdown();
  });

  it("marks crashes, restores eligible sessions independently, and never starts a turn", async () => {
    const { manager, server } = await setup();
    const first = await manager.createSession({ projectPath: "/tmp", title: "First" });
    const second = await manager.createSession({ projectPath: "/tmp", title: "Second" });
    const closed = await manager.createSession({ projectPath: "/tmp", title: "Closed" });
    await manager.closeSession(closed.id);
    server.emit("crash", new Error("fixture crash"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.getState().sessions.filter((item) => item.id !== closed.id).every((item) => item.status === "failed")).toBe(true);
    server.failResume.add(second.threadId!);
    server.emit("notification", { method: "chromux/server-restored", params: {} });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const restored = manager.getState();
    expect(restored.sessions.find((item) => item.id === first.id)?.status).toBe("idle");
    expect(restored.sessions.find((item) => item.id === second.id)?.status).toBe("failed");
    expect(restored.sessions.find((item) => item.id === closed.id)?.status).toBe("closed");
    expect(server.requests.filter((request) => request.method === "thread/resume").map((request) => request.params.threadId).sort())
      .toEqual([first.threadId, second.threadId].sort());
    expect(server.requests.some((request) => request.method === "turn/start" || request.method === "turn/steer")).toBe(false);
    await manager.shutdown();
  });

  it("preserves the last valid attention result and bounds/redacts later failure text", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-runner-attention-"));
    const server = new FakeServer();
    let fail = false;
    const analyzer = {
      async analyze() {
        if (fail) throw new Error(`token=supersecret ${"x".repeat(5_000)}`);
        return {
          schemaVersion: 1 as const,
          generatedAt: "2026-08-05T12:00:00.000Z",
          recommendations: []
        };
      }
    };
    const manager = new RunnerManager(server, new LocalStore(directory), analyzer as unknown as LunaAnalyzer);
    await manager.initialize();
    await manager.refreshAttention();
    fail = true;
    await manager.refreshAttention();
    const state = manager.getState();
    expect(state.attention?.generatedAt).toBe("2026-08-05T12:00:00.000Z");
    expect(state.attentionFailure).toContain("token=[REDACTED]");
    expect(state.attentionFailure).not.toContain("supersecret");
    expect(state.attentionFailure!.length).toBeLessThanOrEqual(2048);
    await manager.shutdown();
  });
});
