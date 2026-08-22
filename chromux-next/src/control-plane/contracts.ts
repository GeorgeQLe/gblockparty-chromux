import { z } from "zod";

export const CONTROL_PLANE_VERSION = "gblockparty.dev/v1" as const;
export const HOST_PROTOCOL_VERSION = "gblockparty.host/v1" as const;
export const CONTROL_PLANE_LIMITS = {
  identifier: 128,
  messageBytes: 64 * 1024,
  terminalChunkBytes: 64 * 1024,
  cols: 500,
  rows: 300
} as const;

const id = z.string().min(3).max(CONTROL_PLANE_LIMITS.identifier)
  .regex(/^[a-z][a-z0-9-]*_[a-zA-Z0-9._~-]+$/);
const seq = z.number().int().nonnegative();
const timestamp = z.number().int().nonnegative();
const boundedUtf8 = (maxBytes: number) => z.string().refine((value) => new TextEncoder().encode(value).byteLength <= maxBytes, `must be at most ${maxBytes} UTF-8 bytes`);

const hostSchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("Host"), id,
  displayName: z.string().min(1).max(120), status: z.enum(["online", "offline", "degraded"]),
  capabilities: z.object({ tools: z.array(z.string().max(40)).max(32) })
});
const workspaceSchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("Workspace"), id,
  hostId: id, displayName: z.string().min(1).max(120), status: z.enum(["active", "stopped", "error"])
});
const sessionSchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("Session"), id,
  workspaceId: id, displayName: z.string().min(1).max(120), toolId: z.string().min(1).max(40),
  status: z.string().min(1).max(40), attention: z.enum(["none", "approval_required", "error", "completed"])
});
const surfaceSchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("Surface"), id,
  sessionId: id, surfaceType: z.enum(["terminal", "browser", "preview"]),
  status: z.enum(["available", "unavailable"]),
  attach: z.object({ transport: z.enum(["websocket", "https"]), href: z.string().startsWith("/").max(500) }).nullable()
});

export const controlPlaneSnapshotSchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("ControlPlaneSnapshot"),
  generatedAt: timestamp, hosts: z.array(hostSchema).max(1000), workspaces: z.array(workspaceSchema).max(5000),
  sessions: z.array(sessionSchema).max(5000), surfaces: z.array(surfaceSchema).max(10000),
  artifacts: z.array(z.unknown()).max(10000), leases: z.array(z.unknown()).max(10000), events: z.array(z.unknown()).max(10000)
});

export const fleetItemSchema = z.object({
  hostId: id, hostName: z.string().min(1).max(120), hostStatus: z.enum(["online", "offline", "degraded"]),
  workspaceId: id, workspaceName: z.string().min(1).max(120), workspaceStatus: z.enum(["active", "stopped", "error"]),
  sessionId: id, sessionName: z.string().min(1).max(120), toolId: z.string().min(1).max(40),
  status: z.string().min(1).max(40), attention: z.enum(["none", "approval_required", "error", "completed"]),
  surfaceId: id, surfaceStatus: z.enum(["available", "unavailable"]), attachable: z.boolean()
});
export const fleetStateSchema = z.object({
  enabled: z.boolean(), connection: z.enum(["disabled", "ready", "loading", "offline", "error"]),
  refreshedAt: timestamp.nullable(), items: z.array(fleetItemSchema).max(5000), error: z.string().max(1000).nullable()
});

const frameBase = { v: z.literal(HOST_PROTOCOL_VERSION) };
export const surfaceServerFrameSchema = z.discriminatedUnion("t", [
  z.object({ ...frameBase, t: z.literal("attached"), surfaceId: id, sessionId: id, hostId: id, authority: z.literal("unleased"), nextSeq: seq }),
  z.object({ ...frameBase, t: z.literal("output"), surfaceId: id, seq, data: boundedUtf8(CONTROL_PLANE_LIMITS.terminalChunkBytes) }),
  z.object({ ...frameBase, t: z.literal("heartbeat"), at: timestamp }),
  z.object({ ...frameBase, t: z.literal("terminal_exit"), surfaceId: id, exitCode: z.number().int().nullable() }),
  z.object({ ...frameBase, t: z.literal("reset"), surfaceId: id, nextSeq: seq, reason: z.literal("replay_gap") }),
  z.object({ ...frameBase, t: z.literal("error"), surfaceId: id.optional(), code: z.string().min(1).max(80), message: z.string().max(1000) })
]);

export const attachmentInputSchema = z.object({ surfaceId: id, data: boundedUtf8(CONTROL_PLANE_LIMITS.terminalChunkBytes).pipe(z.string().min(1)) });
export const attachmentResizeSchema = z.object({ surfaceId: id, cols: z.number().int().min(1).max(CONTROL_PLANE_LIMITS.cols), rows: z.number().int().min(1).max(CONTROL_PLANE_LIMITS.rows) });
export const surfaceIdInputSchema = z.object({ surfaceId: id });
export const fleetAttachInputSchema = z.object({ surfaceId: id, title: z.string().min(1).max(120) });
export const remoteTabSchema = z.object({
  surfaceId: id, sessionId: id, title: z.string().min(1).max(120),
  status: z.enum(["connecting", "connected", "reconnecting", "exited", "error"]),
  authority: z.literal("unleased").nullable(), lastSeq: seq, resetCount: z.number().int().nonnegative(), error: z.string().max(1000).nullable()
});
export const attachmentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), tab: remoteTabSchema }),
  z.object({ type: z.literal("output"), surfaceId: id, seq, data: z.string().max(CONTROL_PLANE_LIMITS.terminalChunkBytes) }),
  z.object({ type: z.literal("reset"), surfaceId: id, nextSeq: seq }),
]);

export type ControlPlaneSnapshot = z.infer<typeof controlPlaneSnapshotSchema>;
export type FleetItem = z.infer<typeof fleetItemSchema>;
export type FleetState = z.infer<typeof fleetStateSchema>;
export type RemoteTab = z.infer<typeof remoteTabSchema>;
export type AttachmentEvent = z.infer<typeof attachmentEventSchema>;
export type SurfaceServerFrame = z.infer<typeof surfaceServerFrameSchema>;
