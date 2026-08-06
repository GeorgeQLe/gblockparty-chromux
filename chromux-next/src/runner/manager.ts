import { EventEmitter } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { extractSafeLinks } from "../domain/links";
import type { LocalStore } from "../persistence/local-store";
import {
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  GroupMutationInputSchema,
  ModelOptionV1Schema,
  RunnerEventV1Schema,
  RunnerGroupV1Schema,
  RunnerSessionV1Schema,
  RunnerStateV1Schema,
  TriageInputSchema,
  TurnInputSchema,
  type AttentionAnalysisV1,
  type ModelOptionV1,
  type PendingInteractionV1,
  type RunnerEventV1,
  type RunnerGroupV1,
  type RunnerSessionV1,
  type RunnerStateV1
} from "./contracts";
import { AttentionCadence, buildAttentionSnapshot, LunaAnalyzer, redact, snapshotHash } from "./attention";
import type { AppServerTransport } from "./protocol";

type Envelope = { id?: string | number; method: string; params?: any };
const execFileAsync = promisify(execFile);

export class RunnerManager extends EventEmitter {
  private state: RunnerStateV1 = { schemaVersion: 1, groups: [], sessions: [], triage: [] };
  private models: ModelOptionV1[] = [];
  private readonly cadence = new AttentionCadence();
  private lastSnapshotHash = "";
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly server: AppServerTransport,
    private readonly store: LocalStore,
    private readonly analyzer: LunaAnalyzer
  ) {
    super();
    server.on("notification", (value) => void this.onNotification(value));
    server.on("request", (value) => void this.onServerRequest(value));
    server.on("crash", (error) => this.serverFailure(error));
  }

  async initialize(): Promise<void> {
    const local = await this.store.read();
    this.state = RunnerStateV1Schema.parse(local.runner ?? this.state);
    try {
      await this.server.start();
      this.models = await this.discoverModels();
      await this.restoreSessions("Could not resume thread");
      await this.persist();
      this.timer = setInterval(() => void this.tick(), 10_000);
    } catch (error) {
      await this.server.stop().catch(() => undefined);
      throw error;
    }
  }

  getState(): RunnerStateV1 { return structuredClone(this.state); }
  getModels(): ModelOptionV1[] { return structuredClone(this.models); }

  async createSession(input: unknown): Promise<RunnerSessionV1> {
    const value = CreateSessionInputSchema.parse(input);
    const canonicalProjectPath = await canonicalize(value.projectPath);
    let group = value.groupId ? this.group(value.groupId) : this.state.groups.find(
      (item) => item.kind === "project" && item.projectPath === canonicalProjectPath
    );
    const now = new Date().toISOString();
    if (!group) {
      group = RunnerGroupV1Schema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        title: path.basename(canonicalProjectPath) || canonicalProjectPath,
        kind: "project",
        projectPath: canonicalProjectPath,
        sessionIds: [],
        createdAt: now,
        updatedAt: now
      });
      this.state.groups.push(group);
    }
    const model = value.model ?? this.models.find((item) => item.recommended)?.id ?? this.models[0]?.id;
    const selectedModel = this.models.find((item) => item.id === model);
    const session = RunnerSessionV1Schema.parse({
      schemaVersion: 1,
      id: randomUUID(),
      title: value.title ?? "New session",
      projectPath: value.projectPath,
      canonicalProjectPath,
      groupId: group.id,
      status: "starting",
      model,
      reasoningEffort: value.reasoningEffort ?? selectedModel?.defaultReasoningEffort,
      permissionPreset: value.permissionPreset,
      draft: "",
      createdAt: now,
      updatedAt: now,
      events: [],
      interactions: []
    });
    this.state.sessions.push(session);
    group.sessionIds.push(session.id);
    this.state.selectedGroupId = group.id;
    this.state.selectedSessionId = session.id;
    try {
      const response = await this.server.request("thread/start", {
        cwd: session.projectPath,
        model: session.model,
        ...permissionParams(session.permissionPreset)
      }) as any;
      session.threadId = response?.thread?.id;
      if (!session.threadId) throw new Error("thread/start returned no thread id");
      session.status = "idle";
      this.appendEvent(session, "system", `Session ready · ${session.permissionPreset} · ${session.model ?? "default model"}`);
    } catch (error) {
      session.status = "failed";
      this.appendEvent(session, "error", String(error));
    }
    await this.changed();
    return structuredClone(session);
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.session(sessionId);
    session.interactions.forEach((interaction) => this.server.respond(
      interaction.requestId,
      interaction.kind === "question" ? { answers: {} } : { decision: "cancel" }
    ));
    session.interactions = [];
    if (session.activeTurnId && session.threadId) {
      await this.server.request("turn/interrupt", { threadId: session.threadId, turnId: session.activeTurnId }).catch(() => undefined);
    }
    if (session.threadId) await this.server.request("thread/unsubscribe", { threadId: session.threadId }).catch(() => undefined);
    session.status = "closed";
    session.activeTurnId = undefined;
    const group = this.group(session.groupId);
    group.sessionIds = group.sessionIds.filter((id) => id !== session.id);
    await this.changed();
  }

  async startOrSteer(input: unknown): Promise<void> {
    const value = TurnInputSchema.parse(input);
    const session = this.session(value.sessionId);
    if (!session.threadId) throw new Error("Session has no Codex thread");
    this.appendEvent(session, "user", value.text);
    session.draft = "";
    if (session.activeTurnId) {
      await this.server.request("turn/steer", {
        threadId: session.threadId,
        expectedTurnId: session.activeTurnId,
        input: [{ type: "text", text: value.text }]
      });
    } else {
      const response = await this.server.request("turn/start", {
        threadId: session.threadId,
        input: [{ type: "text", text: value.text }],
        cwd: session.projectPath,
        model: session.model,
        effort: session.reasoningEffort,
        ...turnPermissionParams(session.permissionPreset, session.canonicalProjectPath)
      }) as any;
      session.activeTurnId = response?.turn?.id;
      session.status = "active";
    }
    await this.changed();
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this.session(sessionId);
    if (!session.threadId || !session.activeTurnId) return;
    await this.server.request("turn/interrupt", { threadId: session.threadId, turnId: session.activeTurnId });
  }

  async saveDraft(input: unknown): Promise<void> {
    const value = DraftInputSchema.parse(input);
    this.session(value.sessionId).draft = value.draft;
    await this.changed(false);
  }

  async respond(input: unknown): Promise<void> {
    const value = ApprovalResponseInputSchema.parse(input);
    const session = this.session(value.sessionId);
    const interaction = session.interactions.find((item) => item.id === value.interactionId);
    if (!interaction || interaction.threadId !== session.threadId) throw new Error("Interaction does not belong to this session");
    if (!interaction.offeredDecisions.includes(value.decision)) throw new Error("Decision was not offered");
    if (interaction.kind === "question") {
      const answers: Record<string, { answers: string[] }> = {};
      for (const [id, answer] of Object.entries(value.answers ?? {})) answers[id] = { answers: answer };
      this.server.respond(interaction.requestId, { answers });
    } else {
      const decision = value.decision === "accept-session" ? "acceptForSession"
        : value.decision === "accept-amendment"
          ? { acceptWithExecpolicyAmendment: { execpolicy_amendment: interaction.policyAmendment ?? [] } }
          : value.decision;
      this.server.respond(interaction.requestId, { decision });
    }
    session.interactions = session.interactions.filter((item) => item.id !== interaction.id);
    await this.changed();
  }

  async mutateGroup(input: unknown): Promise<void> {
    const value = GroupMutationInputSchema.parse(input);
    const now = new Date().toISOString();
    if (value.type === "create") {
      this.state.groups.push(RunnerGroupV1Schema.parse({
        schemaVersion: 1, id: randomUUID(), title: value.title, kind: "custom",
        sessionIds: [], createdAt: now, updatedAt: now
      }));
    } else if (value.type === "rename") {
      const group = this.group(value.groupId);
      group.title = value.title;
      group.updatedAt = now;
    } else if (value.type === "move-session") {
      const session = this.session(value.sessionId);
      const target = this.group(value.groupId);
      this.group(session.groupId).sessionIds = this.group(session.groupId).sessionIds.filter((id) => id !== session.id);
      target.sessionIds.push(session.id);
      session.groupId = target.id;
    } else {
      const group = this.group(value.groupId);
      if (group.sessionIds.length) throw new Error("Move or close sessions before deleting this group");
      this.state.groups = this.state.groups.filter((item) => item.id !== group.id);
    }
    await this.changed();
  }

  select(groupId: string, sessionId: string): void {
    const session = this.session(sessionId);
    if (session.groupId !== groupId) throw new Error("Session is not in the selected group");
    this.state.selectedGroupId = groupId;
    this.state.selectedSessionId = sessionId;
    void this.persist();
  }

  async refreshAttention(): Promise<AttentionAnalysisV1 | undefined> {
    const openSessions = this.state.sessions.filter((item) => item.status !== "closed");
    const snapshot = buildAttentionSnapshot(openSessions, await collectGit(openSessions));
    try {
      const analysis = await this.analyzer.analyze(snapshot);
      this.state.attention = analysis;
      this.state.attentionFailure = undefined;
      this.lastSnapshotHash = snapshotHash(snapshot);
      this.cadence.ran();
    } catch (error) {
      this.state.attentionFailure = redact(String(error)).slice(0, 2048);
    }
    await this.persist();
    this.emitState();
    return this.state.attention;
  }

  async triage(input: unknown): Promise<void> {
    const value = TriageInputSchema.parse(input);
    const now = new Date();
    const until = value.action === "snooze" ? snoozeUntil(value.duration!, now) : undefined;
    this.state.triage = this.state.triage.filter((item) => item.fingerprint !== value.fingerprint);
    this.state.triage.push({
      schemaVersion: 1,
      fingerprint: value.fingerprint,
      action: value.action,
      until: until?.toISOString(),
      at: now.toISOString()
    });
    await this.changed(false);
  }

  private async discoverModels(): Promise<ModelOptionV1[]> {
    const result = await this.server.request("model/list", {}) as any;
    return (result?.data ?? []).map((model: any, index: number) => ModelOptionV1Schema.parse({
      id: model.id ?? model.model,
      displayName: model.displayName ?? model.id ?? model.model,
      description: model.description ?? "",
      recommended: Boolean(model.isDefault ?? model.default) || index === 0,
      defaultReasoningEffort: model.defaultReasoningEffort,
      reasoningEfforts: (model.supportedReasoningEfforts ?? model.reasoningEfforts ?? [])
        .map((item: any) => typeof item === "string" ? item : item.reasoningEffort ?? item.effort)
        .filter(Boolean)
    }));
  }

  private async onNotification(envelope: Envelope): Promise<void> {
    if (envelope.method === "chromux/server-restored") {
      await this.restoreSessions("Could not restore session", true);
      await this.changed();
      return;
    }
    const params = envelope.params ?? {};
    const session = this.state.sessions.find((item) => item.threadId && item.threadId === params.threadId);
    if (!session) return;
    if (envelope.method === "turn/started") {
      session.activeTurnId = params.turn?.id;
      session.status = "active";
      this.appendEvent(session, "status", "Turn started", envelope);
    } else if (envelope.method === "turn/completed") {
      session.activeTurnId = undefined;
      session.status = params.turn?.status === "failed" ? "failed" : "idle";
      this.appendEvent(session, params.turn?.status === "failed" ? "error" : "status", `Turn ${params.turn?.status ?? "completed"}`, envelope);
    } else {
      const normalized = normalizeNotification(session.id, envelope);
      if (normalized) {
        const existing = normalized.itemId && normalized.phase === "delta"
          ? [...session.events].reverse().find((event) => event.itemId === normalized.itemId && event.kind === normalized.kind)
          : undefined;
        if (existing) {
          existing.text = `${existing.text}${normalized.text}`.slice(-64 * 1024);
          existing.at = normalized.at;
        } else session.events.push(normalized);
        session.events = session.events.slice(-1000);
      }
    }
    await this.changed();
  }

  private async onServerRequest(envelope: Envelope): Promise<void> {
    const params = envelope.params ?? {};
    const session = this.state.sessions.find((item) => item.threadId === params.threadId);
    if (!session || envelope.id === undefined) {
      if (envelope.id !== undefined) this.server.respond(envelope.id, { decision: "cancel" });
      return;
    }
    const interaction = normalizeInteraction(session.id, envelope);
    if (!interaction) {
      this.server.respond(envelope.id, { decision: "cancel" });
      this.appendEvent(session, "error", `Unsupported server request: ${envelope.method}`);
    } else session.interactions.push(interaction);
    await this.changed();
  }

  private serverFailure(error: unknown): void {
    for (const session of this.state.sessions.filter((item) => item.status !== "closed")) {
      session.status = "failed";
      this.appendEvent(session, "error", `Codex app-server: ${String(error)}`);
    }
    void this.changed();
  }

  private appendEvent(session: RunnerSessionV1, kind: RunnerEventV1["kind"], text: string, source?: Envelope): void {
    session.events.push(RunnerEventV1Schema.parse({
      schemaVersion: 1, id: randomUUID(), sessionId: session.id,
      threadId: session.threadId, turnId: source?.params?.turnId, itemId: source?.params?.itemId,
      at: new Date().toISOString(), kind, text: String(text).slice(0, 64 * 1024),
      sourceMethod: source?.method, links: extractSafeLinks(String(text))
    }));
    session.events = session.events.slice(-1000);
    session.updatedAt = new Date().toISOString();
  }

  private session(id: string): RunnerSessionV1 {
    const value = this.state.sessions.find((item) => item.id === id);
    if (!value) throw new Error(`Unknown session: ${id}`);
    return value;
  }
  private group(id: string): RunnerGroupV1 {
    const value = this.state.groups.find((item) => item.id === id);
    if (!value) throw new Error(`Unknown group: ${id}`);
    return value;
  }
  private async changed(attention = true): Promise<void> {
    if (attention) this.cadence.changed();
    await this.persist();
    this.emitState();
  }
  private async persist(): Promise<void> {
    await this.store.updateRunner(RunnerStateV1Schema.parse(this.state));
  }
  private emitState(): void { this.emit("state", this.getState()); }
  private async tick(): Promise<void> {
    const openSessions = this.state.sessions.filter((item) => item.status !== "closed");
    const snapshot = buildAttentionSnapshot(openSessions, await collectGit(openSessions));
    const hash = snapshotHash(snapshot);
    if (this.cadence.automaticDue() || this.cadence.heartbeatDue(hash !== this.lastSnapshotHash)) {
      await this.refreshAttention();
    }
  }
  private async restoreSessions(failurePrefix: string, recovered = false): Promise<void> {
    await Promise.all(this.state.sessions
      .filter((item) => item.threadId && item.status !== "closed")
      .map(async (restored) => {
        try {
          await this.server.request("thread/resume", {
            threadId: restored.threadId,
            cwd: restored.projectPath,
            model: restored.model,
            ...permissionParams(restored.permissionPreset)
          });
          restored.status = "idle";
          restored.activeTurnId = undefined;
          if (recovered) this.appendEvent(restored, "system", "Codex app-server connection restored");
        } catch (error) {
          restored.status = "failed";
          this.appendEvent(restored, "error", `${failurePrefix}: ${String(error)}`);
        }
      }));
  }
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.persist();
    await this.server.stop();
  }
}

export function permissionParams(preset: RunnerSessionV1["permissionPreset"]): Record<string, unknown> {
  return preset === "read-only"
    ? { sandbox: "read-only", approvalPolicy: "never" }
    : { sandbox: "workspace-write", approvalPolicy: "on-request" };
}

function turnPermissionParams(
  preset: RunnerSessionV1["permissionPreset"],
  projectPath: string
): Record<string, unknown> {
  return preset === "read-only"
    ? { sandboxPolicy: { type: "readOnly" }, approvalPolicy: "never" }
    : {
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [projectPath],
          networkAccess: false
        },
        approvalPolicy: "on-request"
      };
}

async function canonicalize(value: string): Promise<string> {
  if (!path.isAbsolute(value)) throw new Error("Project path must be absolute");
  return realpath(value);
}

function normalizeNotification(sessionId: string, envelope: Envelope): RunnerEventV1 | undefined {
  const params = envelope.params ?? {};
  const item = params.item ?? {};
  let kind: RunnerEventV1["kind"] = "tool";
  let text = "";
  if (envelope.method === "item/agentMessage/delta") { kind = "agent"; text = params.delta ?? ""; }
  else if (envelope.method.includes("reasoning")) { kind = "reasoning"; text = params.delta ?? params.text ?? ""; }
  else if (envelope.method.includes("commandExecution")) { kind = "command"; text = params.delta ?? summarize(item); }
  else if (envelope.method.includes("fileChange")) { kind = "file-change"; text = params.delta ?? summarize(item); }
  else if (envelope.method === "error") { kind = "error"; text = params.error?.message ?? params.message ?? "Unknown Codex error"; }
  else if (envelope.method === "item/started" || envelope.method === "item/completed") {
    kind = item.type === "agentMessage" ? "agent"
      : item.type === "commandExecution" ? "command"
      : item.type === "fileChange" ? "file-change"
      : "tool";
    text = summarize(item);
  } else return undefined;
  if (!text) return undefined;
  return RunnerEventV1Schema.parse({
    schemaVersion: 1, id: randomUUID(), sessionId, threadId: params.threadId,
    turnId: params.turnId, itemId: params.itemId ?? item.id,
    at: new Date().toISOString(), kind,
    phase: envelope.method.endsWith("/delta") ? "delta"
      : envelope.method.endsWith("/started") ? "started"
      : envelope.method.endsWith("/completed") ? "completed" : undefined,
    text: String(text).slice(0, 64 * 1024), sourceMethod: envelope.method,
    links: extractSafeLinks(String(text))
  });
}

function normalizeInteraction(sessionId: string, envelope: Envelope): PendingInteractionV1 | undefined {
  const params = envelope.params ?? {};
  const common = {
    schemaVersion: 1 as const, id: randomUUID(), requestId: envelope.id!,
    sessionId, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId,
    at: new Date().toISOString(), rawMethod: envelope.method
  };
  if (envelope.method === "item/commandExecution/requestApproval") {
    const amendment = Array.isArray(params.proposedExecpolicyAmendment) && params.proposedExecpolicyAmendment.length;
    return {
      ...common, kind: params.networkApprovalContext ? "network-approval" : "command-approval",
      title: params.networkApprovalContext ? "Network access requested" : "Command approval",
      detail: [params.command, params.reason, params.cwd].filter(Boolean).join("\n").slice(0, 64 * 1024),
      questions: [], offeredDecisions: amendment
        ? ["accept", "accept-session", "decline", "cancel", "accept-amendment"]
        : ["accept", "accept-session", "decline", "cancel"],
      ...(amendment ? { policyAmendment: params.proposedExecpolicyAmendment } : {})
    };
  }
  if (envelope.method === "item/fileChange/requestApproval") {
    return {
      ...common, kind: "file-approval", title: "File changes requested",
      detail: String(params.reason ?? params.grantRoot ?? "Review proposed file changes"),
      questions: [], offeredDecisions: ["accept", "accept-session", "decline", "cancel"]
    };
  }
  if (envelope.method === "item/tool/requestUserInput") {
    return {
      ...common, kind: "question", title: "Agent needs input",
      detail: "Answer the structured question to continue.",
      questions: (params.questions ?? []).slice(0, 3).map((question: any) => ({
        id: String(question.id), header: String(question.header ?? "Question"),
        question: String(question.question ?? ""), options: (question.options ?? []).slice(0, 20)
      })),
      offeredDecisions: ["accept", "cancel"]
    };
  }
  return undefined;
}

function summarize(item: any): string {
  if (typeof item === "string") return item;
  return String(item.text ?? item.message ?? item.command ?? item.name ?? item.type ?? "Tool activity");
}

function snoozeUntil(duration: "15m" | "1h" | "4h" | "tomorrow", now: Date): Date {
  if (duration === "tomorrow") {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }
  const milliseconds = duration === "15m" ? 15 * 60_000 : duration === "1h" ? 60 * 60_000 : 4 * 60 * 60_000;
  return new Date(now.getTime() + milliseconds);
}

async function collectGit(sessions: RunnerSessionV1[]) {
  const paths = [...new Set(sessions.map((session) => session.canonicalProjectPath))].slice(0, 50);
  return Promise.all(paths.map(async (projectPath) => {
    const sourceId = `git-${createHash("sha256").update(projectPath).digest("hex").slice(0, 24)}`;
    try {
      const [{ stdout: branch }, { stdout: status }] = await Promise.all([
        execFileAsync("git", ["branch", "--show-current"], {
          cwd: projectPath, timeout: 5_000, maxBuffer: 16 * 1024
        }),
        execFileAsync("git", ["status", "--short", "--branch"], {
          cwd: projectPath, timeout: 5_000, maxBuffer: 32 * 1024
        })
      ]);
      return {
        sourceId,
        projectPath,
        branch: String(branch).trim().slice(0, 512),
        status: String(status).trim().slice(0, 8192)
      };
    } catch {
      return { sourceId, projectPath, branch: "", status: "Git status unavailable" };
    }
  }));
}
