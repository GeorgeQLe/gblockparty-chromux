import { z } from "zod";

export const CONTROL_PLANE_VERSION = "gblockparty.dev/v1" as const;
export const HOST_PROTOCOL_VERSION = "gblockparty.host/v1" as const;
export const CONTROL_PLANE_LIMITS = {
  identifier: 128,
  credential: 512,
  messageBytes: 64 * 1024,
  terminalChunkBytes: 64 * 1024,
  cols: 500,
  rows: 300
} as const;

const id = z.string().min(3).max(CONTROL_PLANE_LIMITS.identifier)
  .regex(/^[a-z][a-z0-9-]*_[a-zA-Z0-9._~-]+$/);
const seq = z.number().int().nonnegative();
const timestamp = z.number().int().nonnegative();
const endpoint = z.string().trim().min(1).max(2000).transform((value, context) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    if (parsed.pathname && parsed.pathname !== "/") throw new Error();
    parsed.search = ""; parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    context.addIssue({ code: "custom", message: "Control-plane endpoint must be an HTTP(S) origin" });
    return z.NEVER;
  }
});
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
  enrollment: z.object({
    status: z.enum(["not_enrolled", "enrolled", "revoked", "error"]),
    deviceId: id.nullable(), deviceLabel: z.string().min(1).max(120).nullable(),
    endpoint: z.string().max(2000).nullable(), error: z.string().max(1000).nullable()
  }),
  refreshedAt: timestamp.nullable(), items: z.array(fleetItemSchema).max(5000), error: z.string().max(1000).nullable()
});

export const CLIENT_SCOPES = ["snapshot:read", "terminal:observe", "terminal:control"] as const;
export const clientCapabilityDiscoverySchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("ClientCapabilityDiscovery"),
  enrollmentHref: z.literal("/api/v1/control-plane/client-enrollments/exchange"),
  snapshotHref: z.literal("/api/v1/control-plane/snapshot"), surfaceAttachHref: z.literal("/api/v1/control-plane/surfaces/attach"),
  authMethods: z.tuple([z.literal("one_time_code")]), scopes: z.tuple(CLIENT_SCOPES.map((scope) => z.literal(scope)) as [z.ZodLiteral<typeof CLIENT_SCOPES[0]>, z.ZodLiteral<typeof CLIENT_SCOPES[1]>, z.ZodLiteral<typeof CLIENT_SCOPES[2]>]),
  terminalAuthority: z.literal("single_writer_lease"), replay: z.object({ bounded: z.literal(true), resetSignal: z.literal(true) }).passthrough()
});
export const fleetEnrollmentInputSchema = z.object({
  endpoint, code: z.string().min(16).max(256), deviceLabel: z.string().trim().min(1).max(120)
}).strict();
export const clientEnrollmentResponseSchema = z.object({
  apiVersion: z.literal(CONTROL_PLANE_VERSION), kind: z.literal("ClientEnrollment"),
  device: z.object({ id, label: z.string().min(1).max(120), scopes: z.array(z.enum(CLIENT_SCOPES)).min(1).max(CLIENT_SCOPES.length) }),
  credential: z.string().min(32).max(CONTROL_PLANE_LIMITS.credential)
});

const frameBase = { v: z.literal(HOST_PROTOCOL_VERSION) };
export const surfaceServerFrameSchema = z.discriminatedUnion("t", [
  z.object({ ...frameBase, t: z.literal("attached"), surfaceId: id, sessionId: id, hostId: id, authority: z.enum(["unleased", "leased"]), nextSeq: seq }),
  z.object({ ...frameBase, t: z.literal("output"), surfaceId: id, seq, data: boundedUtf8(CONTROL_PLANE_LIMITS.terminalChunkBytes) }),
  z.object({ ...frameBase, t: z.literal("heartbeat"), at: timestamp }),
  z.object({ ...frameBase, t: z.literal("terminal_exit"), surfaceId: id, exitCode: z.number().int().nullable() }),
  z.object({ ...frameBase, t: z.literal("reset"), surfaceId: id, nextSeq: seq, reason: z.literal("replay_gap") }),
  z.object({ ...frameBase, t: z.literal("lease"), surfaceId: id, status: z.enum(["active", "released", "expired", "denied"]), leaseId: id.optional(), holder: z.object({ deviceId: id, label: z.string().min(1).max(120) }).nullable().optional(), expiresAt: timestamp.nullable() }),
  z.object({ ...frameBase, t: z.literal("error"), surfaceId: id.optional(), code: z.string().min(1).max(80), message: z.string().max(1000) })
]);

export const attachmentInputSchema = z.object({ surfaceId: id, data: boundedUtf8(CONTROL_PLANE_LIMITS.terminalChunkBytes).pipe(z.string().min(1)) });
export const attachmentResizeSchema = z.object({ surfaceId: id, cols: z.number().int().min(1).max(CONTROL_PLANE_LIMITS.cols), rows: z.number().int().min(1).max(CONTROL_PLANE_LIMITS.rows) });
export const surfaceIdInputSchema = z.object({ surfaceId: id });
export const fleetAttachInputSchema = z.object({ surfaceId: id, title: z.string().min(1).max(120) });
export const remoteTabSchema = z.object({
  surfaceId: id, sessionId: id, title: z.string().min(1).max(120),
  status: z.enum(["connecting", "connected", "reconnecting", "exited", "error"]),
  authority: z.enum(["unleased", "leased"]).nullable(),
  control: z.enum(["negotiating", "unleased", "read_only", "requesting", "controlled", "contended"]),
  leaseHolder: z.string().min(1).max(120).nullable(), leaseExpiresAt: timestamp.nullable(),
  lastSeq: seq, resetCount: z.number().int().nonnegative(), error: z.string().max(1000).nullable()
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
export type FleetEnrollmentInput = z.infer<typeof fleetEnrollmentInputSchema>;
