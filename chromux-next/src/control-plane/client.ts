import { EventEmitter } from "node:events";
import WebSocket, { type RawData } from "ws";
import {
  CONTROL_PLANE_LIMITS,
  HOST_PROTOCOL_VERSION,
  attachmentInputSchema,
  attachmentResizeSchema,
  clientCapabilityDiscoverySchema,
  clientEnrollmentResponseSchema,
  controlPlaneSnapshotSchema,
  fleetEnrollmentInputSchema,
  fleetStateSchema,
  remoteTabSchema,
  surfaceIdInputSchema,
  surfaceServerFrameSchema,
  type AttachmentEvent,
  type FleetEnrollmentInput,
  type FleetItem,
  type FleetState,
  type RemoteTab
} from "./contracts";
import type { FleetCredential, FleetCredentialStore } from "./credential-store";

interface Attachment {
  tab: RemoteTab;
  socket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  renewTimer: ReturnType<typeof setInterval> | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  leaseId: string | null;
  pendingResize: { cols: number; rows: number } | null;
  wantsControl: boolean;
  backoffMs: number;
  detached: boolean;
}
export interface ControlPlaneClientOptions {
  baseUrl: string;
  enabled: boolean;
  cookie?: string;
  bearerToken?: string;
  credentialStore?: FleetCredentialStore;
  leaseRenewMs?: number;
}

const EMPTY_ENROLLMENT: FleetState["enrollment"] = { status: "not_enrolled", deviceId: null, deviceLabel: null, endpoint: null, error: null };

export class ControlPlaneClient extends EventEmitter {
  private fleet: FleetState;
  private credential: FleetCredential | null = null;
  private readonly attachments = new Map<string, Attachment>();

  constructor(private readonly options: ControlPlaneClientOptions) {
    super();
    const configured = Boolean(options.cookie || options.bearerToken);
    this.fleet = fleetStateSchema.parse({
      enabled: options.enabled, connection: options.enabled ? "ready" : "disabled",
      enrollment: configured ? { status: "enrolled", deviceId: null, deviceLabel: "Process-provided credential", endpoint: options.baseUrl, error: null } : EMPTY_ENROLLMENT,
      refreshedAt: null, items: [], error: null
    });
  }

  async initialize(): Promise<FleetState> {
    if (!this.options.enabled || !this.options.credentialStore) return this.state();
    try {
      this.credential = await this.options.credentialStore.load();
      if (this.credential) this.setEnrollment("enrolled", this.credential);
    } catch (error) {
      this.setFleet({ ...this.fleet, connection: "error", enrollment: { ...EMPTY_ENROLLMENT, status: "error", error: safeMessage(error) }, error: safeMessage(error) });
    }
    return this.state();
  }

  state(): FleetState { return structuredClone(this.fleet); }
  tabs(): RemoteTab[] { return [...this.attachments.values()].map(({ tab }) => structuredClone(tab)); }

  async enroll(input: FleetEnrollmentInput): Promise<FleetState> {
    if (!this.options.enabled) throw new Error("Fleet integration is disabled");
    if (!this.options.credentialStore) throw new Error("Protected credential storage is unavailable");
    const value = fleetEnrollmentInputSchema.parse(input);
    const capabilities = await fetch(new URL("/api/v1/control-plane/client-capabilities", value.endpoint));
    if (!capabilities.ok) throw new Error(`Fleet capability discovery returned ${capabilities.status}`);
    clientCapabilityDiscoverySchema.parse(await capabilities.json());
    const response = await fetch(new URL("/api/v1/control-plane/client-enrollments/exchange", value.endpoint), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: value.code, deviceLabel: value.deviceLabel })
    });
    if (!response.ok) throw new Error(response.status === 401 ? "The enrollment code is expired or has already been used" : `Fleet enrollment returned ${response.status}`);
    const enrolled = clientEnrollmentResponseSchema.parse(await response.json());
    const credential = { endpoint: value.endpoint, deviceId: enrolled.device.id, deviceLabel: enrolled.device.label, credential: enrolled.credential };
    await this.options.credentialStore.save(credential);
    this.credential = credential;
    this.setEnrollment("enrolled", credential);
    return this.refresh();
  }

  async forgetEnrollment(): Promise<FleetState> {
    for (const surfaceId of [...this.attachments.keys()]) this.detach(surfaceId);
    await this.options.credentialStore?.clear();
    this.credential = null;
    this.setFleet({ ...this.fleet, connection: this.options.enabled ? "ready" : "disabled", enrollment: EMPTY_ENROLLMENT, items: [], refreshedAt: null, error: null });
    return this.state();
  }

  async refresh(): Promise<FleetState> {
    if (!this.options.enabled) return this.state();
    this.setFleet({ ...this.fleet, connection: "loading", error: null });
    try {
      const response = await fetch(new URL("/api/v1/control-plane/snapshot", this.baseUrl()), { headers: this.headers() });
      if (response.status === 401 && this.credential) { await this.handleRevoked(); return this.state(); }
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
      this.setFleet({ ...this.fleet, connection: "ready", refreshedAt: Date.now(), items, error: null });
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
    const attachment: Attachment = {
      tab: remoteTabSchema.parse({ surfaceId, sessionId: item.sessionId, title: title || item.sessionName, status: "connecting", authority: null, control: "negotiating", leaseHolder: null, leaseExpiresAt: null, lastSeq: 0, resetCount: 0, error: null }),
      socket: null, reconnectTimer: null, heartbeatTimer: null, renewTimer: null, expiryTimer: null,
      leaseId: null, pendingResize: null, wantsControl: false, backoffMs: 500, detached: false
    };
    this.attachments.set(surfaceId, attachment); this.emitState(attachment); this.connect(attachment); return structuredClone(attachment.tab);
  }

  detach(surfaceId: string): void {
    const value = surfaceIdInputSchema.parse({ surfaceId }); const attachment = this.attachments.get(value.surfaceId); if (!attachment) return;
    attachment.detached = true; attachment.wantsControl = false; this.clearTimers(attachment);
    if (attachment.socket?.readyState === WebSocket.OPEN) {
      try {
        if (attachment.leaseId) this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "lease_release", surfaceId, leaseId: attachment.leaseId });
        this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "detach", surfaceId });
      } catch { /* socket close still detaches locally and the server expires ownership */ }
    }
    attachment.socket?.close(1000, "detached"); this.attachments.delete(surfaceId);
  }

  requestControl(surfaceId: string): void {
    const attachment = this.require(surfaceId);
    if (attachment.tab.authority !== "leased") throw new Error("This terminal does not use leased control");
    attachment.wantsControl = true;
    attachment.tab = { ...attachment.tab, control: "requesting", leaseHolder: null, error: null }; this.emitState(attachment);
    try { this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "lease_request", surfaceId }); }
    catch (error) { attachment.wantsControl = false; this.clearLease(attachment, "read_only", null); throw error; }
  }

  releaseControl(surfaceId: string): void {
    const attachment = this.require(surfaceId); attachment.wantsControl = false;
    try { if (attachment.leaseId) this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "lease_release", surfaceId, leaseId: attachment.leaseId }); }
    finally { this.clearLease(attachment, "read_only", null); }
  }

  input(surfaceId: string, data: string): void {
    const value = attachmentInputSchema.parse({ surfaceId, data }); const attachment = this.require(value.surfaceId);
    if (attachment.tab.control !== "controlled" && attachment.tab.control !== "unleased") throw new Error("Terminal input is read-only until this device holds the control lease");
    this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "input", ...value });
  }
  resize(surfaceId: string, cols: number, rows: number): void {
    const value = attachmentResizeSchema.parse({ surfaceId, cols, rows }); const attachment = this.require(value.surfaceId);
    attachment.pendingResize = { cols: value.cols, rows: value.rows };
    if (attachment.socket?.readyState === WebSocket.OPEN) this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "resize", ...value });
  }
  close(): void { for (const surfaceId of [...this.attachments.keys()]) this.detach(surfaceId); }

  private connect(attachment: Attachment): void {
    if (attachment.detached) return;
    const target = new URL("/api/v1/control-plane/surfaces/attach", this.baseUrl()); target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(target, { headers: this.headers(), maxPayload: CONTROL_PLANE_LIMITS.messageBytes }); attachment.socket = socket;
    socket.on("open", () => {
      attachment.backoffMs = 500;
      this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "attach", surfaceId: attachment.tab.surfaceId, sinceSeq: attachment.tab.lastSeq });
      if (attachment.pendingResize) this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "resize", surfaceId: attachment.tab.surfaceId, ...attachment.pendingResize });
      attachment.heartbeatTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "heartbeat", at: Date.now() })); }, 10_000); attachment.heartbeatTimer.unref();
    });
    socket.on("message", (raw) => this.receive(attachment, raw));
    socket.on("close", (code) => {
      attachment.socket = null; this.clearTimers(attachment); attachment.leaseId = null;
      if (attachment.detached || !this.attachments.has(attachment.tab.surfaceId)) return;
      if (code === 4401 && this.credential) { void this.handleRevoked(); return; }
      attachment.tab = { ...attachment.tab, status: "reconnecting", control: attachment.tab.authority === "unleased" ? "unleased" : "read_only", leaseHolder: null, leaseExpiresAt: null, error: code === 4403 ? "Device credential lacks terminal access" : null }; this.emitState(attachment);
      if (code === 4403) return;
      const wait = attachment.backoffMs; attachment.backoffMs = Math.min(wait * 2, 30_000); attachment.reconnectTimer = setTimeout(() => this.connect(attachment), wait);
    });
    socket.on("error", () => undefined);
  }

  private receive(attachment: Attachment, raw: RawData): void {
    const bytes = Array.isArray(raw) ? raw.reduce((sum, part) => sum + part.byteLength, 0) : raw.byteLength;
    if (bytes > CONTROL_PLANE_LIMITS.messageBytes) return attachment.socket?.close(4400, "frame too large");
    let value: unknown; try { value = JSON.parse(raw.toString()); } catch { return attachment.socket?.close(4400, "invalid json"); }
    const parsed = surfaceServerFrameSchema.safeParse(value);
    if (!parsed.success) return attachment.socket?.close(4400, "invalid frame");
    const frame = parsed.data;
    if (frame.t !== "heartbeat" && "surfaceId" in frame && frame.surfaceId && frame.surfaceId !== attachment.tab.surfaceId) return attachment.socket?.close(4403, "wrong surface");
    if (frame.t === "attached") {
      attachment.tab = { ...attachment.tab, status: "connected", authority: frame.authority, control: frame.authority === "unleased" ? "unleased" : "read_only", lastSeq: Math.max(attachment.tab.lastSeq, frame.nextSeq), error: null }; this.emitState(attachment);
      if (frame.authority === "leased" && attachment.wantsControl) this.requestControl(frame.surfaceId);
    } else if (frame.t === "output") {
      if (frame.seq <= attachment.tab.lastSeq) return; attachment.tab = { ...attachment.tab, lastSeq: frame.seq }; this.emit("attachment", { type: "output", surfaceId: frame.surfaceId, seq: frame.seq, data: frame.data } satisfies AttachmentEvent);
    } else if (frame.t === "reset") {
      attachment.tab = { ...attachment.tab, lastSeq: 0, resetCount: attachment.tab.resetCount + 1 }; this.emit("attachment", { type: "reset", surfaceId: frame.surfaceId, nextSeq: frame.nextSeq } satisfies AttachmentEvent); this.emitState(attachment);
    } else if (frame.t === "lease") {
      if (frame.status === "active" && frame.leaseId && frame.expiresAt !== null) {
        attachment.leaseId = frame.leaseId; attachment.wantsControl = true;
        attachment.tab = { ...attachment.tab, control: "controlled", leaseHolder: frame.holder?.label ?? null, leaseExpiresAt: frame.expiresAt, error: null }; this.scheduleLease(attachment); this.emitState(attachment);
      } else {
        attachment.wantsControl = frame.status === "denied" ? false : attachment.wantsControl;
        this.clearLease(attachment, frame.status === "denied" ? "contended" : "read_only", frame.holder?.label ?? null);
      }
    } else if (frame.t === "terminal_exit") {
      this.clearLease(attachment, "read_only", null); attachment.tab = { ...attachment.tab, status: "exited", error: frame.exitCode === null ? null : `Terminal exited ${frame.exitCode}` }; this.emitState(attachment);
    } else if (frame.t === "error") {
      const unavailable = frame.code === "host_unavailable"; const leaseRequired = frame.code === "lease_required";
      if (leaseRequired) this.clearLease(attachment, "read_only", null);
      attachment.tab = { ...attachment.tab, status: unavailable ? "reconnecting" : attachment.tab.status, error: frame.message }; this.emitState(attachment);
      if (unavailable) attachment.socket?.close(1012, "host unavailable");
    }
  }

  private scheduleLease(attachment: Attachment): void {
    if (attachment.renewTimer) clearInterval(attachment.renewTimer); if (attachment.expiryTimer) clearTimeout(attachment.expiryTimer);
    attachment.renewTimer = setInterval(() => { if (attachment.leaseId && attachment.socket?.readyState === WebSocket.OPEN) this.send(attachment, { v: HOST_PROTOCOL_VERSION, t: "lease_renew", surfaceId: attachment.tab.surfaceId, leaseId: attachment.leaseId }); }, this.options.leaseRenewMs ?? 8_000); attachment.renewTimer.unref();
    const wait = Math.max(0, (attachment.tab.leaseExpiresAt ?? Date.now()) - Date.now());
    attachment.expiryTimer = setTimeout(() => this.clearLease(attachment, "read_only", null), wait + 25); attachment.expiryTimer.unref();
  }
  private clearLease(attachment: Attachment, control: RemoteTab["control"], holder: string | null): void {
    if (attachment.renewTimer) clearInterval(attachment.renewTimer); if (attachment.expiryTimer) clearTimeout(attachment.expiryTimer);
    attachment.renewTimer = null; attachment.expiryTimer = null; attachment.leaseId = null;
    attachment.tab = { ...attachment.tab, control, leaseHolder: holder, leaseExpiresAt: null }; this.emitState(attachment);
  }
  private clearTimers(attachment: Attachment): void {
    if (attachment.reconnectTimer) clearTimeout(attachment.reconnectTimer); if (attachment.heartbeatTimer) clearInterval(attachment.heartbeatTimer);
    if (attachment.renewTimer) clearInterval(attachment.renewTimer); if (attachment.expiryTimer) clearTimeout(attachment.expiryTimer);
    attachment.reconnectTimer = null; attachment.heartbeatTimer = null; attachment.renewTimer = null; attachment.expiryTimer = null;
  }
  private async handleRevoked(): Promise<void> {
    for (const attachment of this.attachments.values()) {
      attachment.detached = true; this.clearTimers(attachment); attachment.socket?.close();
      attachment.tab = { ...attachment.tab, status: "error", control: "read_only", leaseHolder: null, leaseExpiresAt: null, error: "This device enrollment was revoked. Enroll again to reconnect." }; this.emitState(attachment);
    }
    this.attachments.clear(); await this.options.credentialStore?.clear(); this.credential = null;
    this.setFleet({ ...this.fleet, connection: "error", enrollment: { ...EMPTY_ENROLLMENT, status: "revoked", error: "This device enrollment was revoked. Enroll again to reconnect." }, items: [], error: "Device access revoked" });
  }
  private setEnrollment(status: "enrolled", credential: FleetCredential): void { this.setFleet({ ...this.fleet, enrollment: { status, deviceId: credential.deviceId, deviceLabel: credential.deviceLabel, endpoint: credential.endpoint, error: null }, error: null }); }
  private require(surfaceId: string): Attachment { const value = surfaceIdInputSchema.parse({ surfaceId }); const attachment = this.attachments.get(value.surfaceId); if (!attachment) throw new Error("Remote terminal tab is not attached"); return attachment; }
  private send(attachment: Attachment, frame: object): void { if (attachment.socket?.readyState !== WebSocket.OPEN) throw new Error("Remote terminal is reconnecting"); attachment.socket.send(JSON.stringify(frame)); }
  private baseUrl(): string { return this.credential?.endpoint ?? this.options.baseUrl; }
  private headers(): Record<string, string> { return { ...(this.options.cookie ? { Cookie: this.options.cookie } : {}), ...(this.credential?.credential || this.options.bearerToken ? { Authorization: `Bearer ${this.credential?.credential ?? this.options.bearerToken}` } : {}) }; }
  private setFleet(state: FleetState): void { this.fleet = fleetStateSchema.parse(state); this.emit("fleet", this.state()); }
  private emitState(attachment: Attachment): void { this.emit("attachment", { type: "state", tab: structuredClone(attachment.tab) } satisfies AttachmentEvent); }
}

function safeMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 1000); }
