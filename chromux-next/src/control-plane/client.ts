import { EventEmitter } from "node:events";
import WebSocket, { type RawData } from "ws";
import {
  CONTROL_PLANE_LIMITS,
  HOST_PROTOCOL_VERSION,
  attachmentInputSchema,
  attachmentResizeSchema,
  controlPlaneSnapshotSchema,
  fleetStateSchema,
  remoteTabSchema,
  surfaceIdInputSchema,
  surfaceServerFrameSchema,
  type AttachmentEvent,
  type FleetItem,
  type FleetState,
  type RemoteTab
} from "./contracts";

interface Attachment { tab: RemoteTab; socket: WebSocket | null; reconnectTimer: ReturnType<typeof setTimeout> | null; heartbeatTimer: ReturnType<typeof setInterval> | null; backoffMs: number; detached: boolean; }
export interface ControlPlaneClientOptions { baseUrl: string; enabled: boolean; cookie?: string; bearerToken?: string; }

export class ControlPlaneClient extends EventEmitter {
  private fleet: FleetState;
  private readonly attachments = new Map<string, Attachment>();
  constructor(private readonly options: ControlPlaneClientOptions) {
    super();
    this.fleet = fleetStateSchema.parse({ enabled: options.enabled, connection: options.enabled ? "ready" : "disabled", refreshedAt: null, items: [], error: null });
  }

  state(): FleetState { return structuredClone(this.fleet); }
  tabs(): RemoteTab[] { return [...this.attachments.values()].map(({ tab }) => structuredClone(tab)); }

  async refresh(): Promise<FleetState> {
    if (!this.options.enabled) return this.state();
    this.setFleet({ ...this.fleet, connection: "loading", error: null });
    try {
      const response = await fetch(new URL("/api/v1/control-plane/snapshot", this.options.baseUrl), { headers: this.headers() });
      if (!response.ok) throw new Error(response.status === 401 ? "Control-plane authentication required" : `Control plane returned ${response.status}`);
      const snapshot = controlPlaneSnapshotSchema.parse(await response.json());
      const hosts = new Map(snapshot.hosts.map((host) => [host.id, host]));
      const workspaces = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace]));
      const sessions = new Map(snapshot.sessions.map((session) => [session.id, session]));
      const items: FleetItem[] = snapshot.surfaces.flatMap((surface) => {
        const session = sessions.get(surface.sessionId); const workspace = session && workspaces.get(session.workspaceId); const host = workspace && hosts.get(workspace.hostId);
        if (!session || !workspace || !host || surface.surfaceType !== "terminal") return [];
        return [{ hostId: host.id, hostName: host.displayName, hostStatus: host.status, workspaceId: workspace.id, workspaceName: workspace.displayName, workspaceStatus: workspace.status, sessionId: session.id, sessionName: session.displayName, toolId: session.toolId, status: session.status, attention: session.attention, surfaceId: surface.id, surfaceStatus: surface.status, attachable: host.status === "online" && surface.status === "available" && surface.attach?.href === "/api/v1/control-plane/surfaces/attach" }];
      });
      this.setFleet({ enabled: true, connection: "ready", refreshedAt: Date.now(), items, error: null });
    } catch (error) {
      this.setFleet({ ...this.fleet, connection: "error", error: safeMessage(error) });
    }
    return this.state();
  }

  attach(surfaceId: string, title: string): RemoteTab {
    surfaceIdInputSchema.parse({ surfaceId });
    const existing = this.attachments.get(surfaceId); if (existing) return structuredClone(existing.tab);
    const item = this.fleet.items.find((candidate) => candidate.surfaceId === surfaceId);
    if (!item?.attachable) throw new Error("This fleet terminal is unavailable");
    const attachment: Attachment = { tab: remoteTabSchema.parse({ surfaceId, sessionId: item.sessionId, title: title || item.sessionName, status: "connecting", authority: null, lastSeq: 0, resetCount: 0, error: null }), socket: null, reconnectTimer: null, heartbeatTimer: null, backoffMs: 500, detached: false };
    this.attachments.set(surfaceId, attachment); this.emitState(attachment); this.connect(attachment); return structuredClone(attachment.tab);
  }

  detach(surfaceId: string): void {
    const value = surfaceIdInputSchema.parse({ surfaceId }); const attachment = this.attachments.get(value.surfaceId); if (!attachment) return;
    attachment.detached = true; if (attachment.reconnectTimer) clearTimeout(attachment.reconnectTimer); if (attachment.heartbeatTimer) clearInterval(attachment.heartbeatTimer);
    if (attachment.socket?.readyState === WebSocket.OPEN) this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "detach", surfaceId });
    attachment.socket?.close(1000, "detached"); this.attachments.delete(surfaceId);
  }
  input(surfaceId: string, data: string): void { const value = attachmentInputSchema.parse({ surfaceId, data }); this.send(this.require(value.surfaceId), { v: HOST_PROTOCOL_VERSION, t: "input", ...value }); }
  resize(surfaceId: string, cols: number, rows: number): void { const value = attachmentResizeSchema.parse({ surfaceId, cols, rows }); this.send(this.require(value.surfaceId), { v: HOST_PROTOCOL_VERSION, t: "resize", ...value }); }
  close(): void { for (const surfaceId of [...this.attachments.keys()]) this.detach(surfaceId); }

  private connect(attachment: Attachment): void {
    if (attachment.detached) return;
    const target = new URL("/api/v1/control-plane/surfaces/attach", this.options.baseUrl); target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(target, { headers: this.headers(), maxPayload: CONTROL_PLANE_LIMITS.messageBytes }); attachment.socket = socket;
    socket.on("open", () => { attachment.backoffMs = 500; this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "attach", surfaceId: attachment.tab.surfaceId, sinceSeq: attachment.tab.lastSeq }); attachment.heartbeatTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "heartbeat", at: Date.now() })); }, 10_000); attachment.heartbeatTimer.unref(); });
    socket.on("message", (raw) => this.receive(attachment, raw));
    socket.on("close", () => { attachment.socket = null; if (attachment.heartbeatTimer) clearInterval(attachment.heartbeatTimer); attachment.heartbeatTimer = null; if (attachment.detached || !this.attachments.has(attachment.tab.surfaceId)) return; attachment.tab = { ...attachment.tab, status: "reconnecting", error: null }; this.emitState(attachment); const wait = attachment.backoffMs; attachment.backoffMs = Math.min(wait * 2, 30_000); attachment.reconnectTimer = setTimeout(() => this.connect(attachment), wait); });
    socket.on("error", () => undefined);
  }
  private receive(attachment: Attachment, raw: RawData): void {
    const bytes = Array.isArray(raw) ? raw.reduce((sum, part) => sum + part.byteLength, 0) : raw.byteLength;
    if (bytes > CONTROL_PLANE_LIMITS.messageBytes) return attachment.socket?.close(4400, "frame too large");
    let value: unknown; try { value = JSON.parse(raw.toString()); } catch { return attachment.socket?.close(4400, "invalid json"); }
    const parsed = surfaceServerFrameSchema.safeParse(value); if (!parsed.success) return attachment.socket?.close(4400, "invalid frame"); const frame = parsed.data;
    if (frame.t !== "heartbeat" && "surfaceId" in frame && frame.surfaceId && frame.surfaceId !== attachment.tab.surfaceId) return attachment.socket?.close(4403, "wrong surface");
    if (frame.t === "attached") { attachment.tab = { ...attachment.tab, status: "connected", authority: frame.authority, lastSeq: Math.max(attachment.tab.lastSeq, frame.nextSeq), error: null }; this.emitState(attachment); }
    else if (frame.t === "output") { if (frame.seq <= attachment.tab.lastSeq) return; attachment.tab = { ...attachment.tab, lastSeq: frame.seq }; this.emit("attachment", { type: "output", surfaceId: frame.surfaceId, seq: frame.seq, data: frame.data } satisfies AttachmentEvent); }
    else if (frame.t === "reset") { attachment.tab = { ...attachment.tab, lastSeq: 0, resetCount: attachment.tab.resetCount + 1 }; this.emit("attachment", { type: "reset", surfaceId: frame.surfaceId, nextSeq: frame.nextSeq } satisfies AttachmentEvent); this.emitState(attachment); }
    else if (frame.t === "terminal_exit") { attachment.tab = { ...attachment.tab, status: "exited", error: frame.exitCode === null ? null : `Terminal exited ${frame.exitCode}` }; this.emitState(attachment); }
    else if (frame.t === "error") {
      const unavailable = frame.code === "host_unavailable";
      attachment.tab = { ...attachment.tab, status: unavailable ? "reconnecting" : "error", error: frame.message }; this.emitState(attachment);
      if (unavailable) attachment.socket?.close(1012, "host unavailable");
    }
  }
  private require(surfaceId: string): Attachment { const value = this.attachments.get(surfaceId); if (!value) throw new Error("Remote terminal tab is not attached"); return value; }
  private send(attachment: Attachment, frame: object): void { if (attachment.socket?.readyState !== WebSocket.OPEN) throw new Error("Remote terminal is reconnecting"); attachment.socket.send(JSON.stringify(frame)); }
  private headers(): Record<string, string> { return { ...(this.options.cookie ? { Cookie: this.options.cookie } : {}), ...(this.options.bearerToken ? { Authorization: `Bearer ${this.options.bearerToken}` } : {}) }; }
  private setFleet(state: FleetState): void { this.fleet = fleetStateSchema.parse(state); this.emit("fleet", this.state()); }
  private emitState(attachment: Attachment): void { this.emit("attachment", { type: "state", tab: structuredClone(attachment.tab) } satisfies AttachmentEvent); }
}

function safeMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 1000); }
