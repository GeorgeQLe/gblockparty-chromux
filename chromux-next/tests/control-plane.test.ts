import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { ControlPlaneClient } from "../src/control-plane/client";
import { FleetCredentialStore } from "../src/control-plane/credential-store";
import { CONTROL_PLANE_LIMITS, HOST_PROTOCOL_VERSION, controlPlaneSnapshotSchema, fleetStateSchema, surfaceServerFrameSchema, type AttachmentEvent } from "../src/control-plane/contracts";

const closers: Array<() => void> = [];
afterEach(() => { while (closers.length) closers.pop()?.(); });

const snapshot = {
  apiVersion: "gblockparty.dev/v1", kind: "ControlPlaneSnapshot", generatedAt: 1,
  hosts: [{ apiVersion: "gblockparty.dev/v1", kind: "Host", id: "host_daemon1", displayName: "George’s Mac", status: "online", capabilities: { tools: ["codex"] } }],
  workspaces: [{ apiVersion: "gblockparty.dev/v1", kind: "Workspace", id: "workspace_one", hostId: "host_daemon1", displayName: "gblock-party", status: "active", workspaceDir: "/Users/private/project" }],
  sessions: [{ apiVersion: "gblockparty.dev/v1", kind: "Session", id: "session_one", workspaceId: "workspace_one", displayName: "Daemon session", toolId: "codex", status: "running", attention: "none" }],
  surfaces: [{ apiVersion: "gblockparty.dev/v1", kind: "Surface", id: "surface_one", sessionId: "session_one", surfaceType: "terminal", status: "available", attach: { transport: "websocket", href: "/api/v1/control-plane/surfaces/attach" } }],
  artifacts: [], leases: [], events: []
};

describe("GBlockParty control-plane client", () => {
  it("rejects malformed snapshots and surface frames", () => {
    expect(() => controlPlaneSnapshotSchema.parse({ ...snapshot, apiVersion: "v2" })).toThrow();
    expect(() => surfaceServerFrameSchema.parse({ v: HOST_PROTOCOL_VERSION, t: "output", surfaceId: "surface_one", seq: -1, data: "bad" })).toThrow();
    expect(() => surfaceServerFrameSchema.parse({ v: HOST_PROTOCOL_VERSION, t: "output", surfaceId: "surface_one", seq: 1, data: "😀".repeat(CONTROL_PLANE_LIMITS.terminalChunkBytes / 2) })).toThrow();
    expect(() => fleetStateSchema.parse({ enabled: true, connection: "ready", enrollment: { status: "not_enrolled", deviceId: null, deviceLabel: null, endpoint: null, error: null }, refreshedAt: 1, items: [{ workspaceDir: "/private" }], error: null })).toThrow();
  });

  it("sanitizes discovery and reconnects with replay/reset before detach-only close", async () => {
    const received: Array<Record<string, unknown>> = []; let connections = 0;
    const server = createServer((request, response) => {
      if (request.url === "/api/v1/control-plane/snapshot") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(snapshot)); return; }
      response.statusCode = 404; response.end();
    });
    const sockets = new WebSocketServer({ server, path: "/api/v1/control-plane/surfaces/attach" });
    sockets.on("connection", (socket) => {
      connections += 1; const connection = connections;
      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as Record<string, unknown>; received.push(frame);
        if (frame.t !== "attach") return;
        socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "attached", surfaceId: "surface_one", sessionId: "session_one", hostId: "host_daemon1", authority: "unleased", nextSeq: connection === 1 ? 0 : 1 }));
        if (connection === 1) { socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "output", surfaceId: "surface_one", seq: 1, data: "first" })); setTimeout(() => socket.terminate(), 10); }
        else { socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "reset", surfaceId: "surface_one", nextSeq: 4, reason: "replay_gap" })); socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "output", surfaceId: "surface_one", seq: 4, data: "after-gap" })); }
      });
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    closers.push(() => { sockets.close(); server.close(); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("missing test port");
    const client = new ControlPlaneClient({ baseUrl: `http://127.0.0.1:${address.port}`, enabled: true }); closers.push(() => client.close());
    const events: AttachmentEvent[] = []; client.on("attachment", (event) => events.push(event));
    const fleet = await client.refresh();
    expect(fleet.items).toHaveLength(1); expect(fleet.items[0]).not.toHaveProperty("workspaceDir"); expect(JSON.stringify(fleet)).not.toContain("/Users/private");
    client.attach("surface_one", "Daemon session");
    await waitFor(() => connections >= 2 && events.some((event) => event.type === "output" && event.data === "after-gap"));
    expect(received.filter((frame) => frame.t === "attach").map((frame) => frame.sinceSeq)).toEqual([0, 1]);
    expect(events.some((event) => event.type === "state" && event.tab.status === "reconnecting")).toBe(true);
    expect(events.some((event) => event.type === "reset")).toBe(true);
    client.input("surface_one", "ls\r"); client.resize("surface_one", 120, 40); client.detach("surface_one");
    await waitFor(() => received.some((frame) => frame.t === "detach"));
    expect(received.map((frame) => frame.t)).toContain("input"); expect(received.map((frame) => frame.t)).toContain("resize"); expect(received.map((frame) => frame.t)).not.toContain("stop");
  });

  it("keeps remote UI isolated from local launch, browser, and capture actions", async () => {
    const source = await readFile("src/control-plane/ui.tsx", "utf8");
    expect(source).toContain("window.chromuxNext.fleet.detach");
    expect(source).not.toContain("runner.create"); expect(source).not.toContain("browser.capture"); expect(source).not.toContain("workspaceDir");
  });

  it("blocks input until the server grants a single-writer lease, renews it, and exposes contention", async () => {
    const received: Array<Record<string, unknown>> = [];
    const server = createServer((request, response) => {
      if (request.url === "/api/v1/control-plane/snapshot") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(snapshot)); return; }
      response.statusCode = 404; response.end();
    });
    const sockets = new WebSocketServer({ server, path: "/api/v1/control-plane/surfaces/attach" });
    sockets.on("connection", (socket) => socket.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as Record<string, unknown>; received.push(frame);
      if (frame.t === "attach") socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "attached", surfaceId: "surface_one", sessionId: "session_one", hostId: "host_daemon1", authority: "leased", nextSeq: 0 }));
      if (frame.t === "lease_request") {
        const requestCount = received.filter((item) => item.t === "lease_request").length;
        socket.send(JSON.stringify(requestCount === 1
          ? { v: HOST_PROTOCOL_VERSION, t: "lease", surfaceId: "surface_one", status: "active", leaseId: "lease_one", holder: { deviceId: "device_one", label: "This Mac" }, expiresAt: Date.now() + 1_000 }
          : { v: HOST_PROTOCOL_VERSION, t: "lease", surfaceId: "surface_one", status: "denied", holder: { deviceId: "device_other", label: "Phone" }, expiresAt: Date.now() + 1_000 }));
      }
      if (frame.t === "lease_renew") socket.send(JSON.stringify({ v: HOST_PROTOCOL_VERSION, t: "lease", surfaceId: "surface_one", status: "active", leaseId: "lease_one", holder: { deviceId: "device_one", label: "This Mac" }, expiresAt: Date.now() + 1_000 }));
    }));
    server.listen(0, "127.0.0.1"); await once(server, "listening"); closers.push(() => { sockets.close(); server.close(); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("missing test port");
    const client = new ControlPlaneClient({ baseUrl: `http://127.0.0.1:${address.port}`, enabled: true, bearerToken: "x".repeat(40), leaseRenewMs: 25 }); closers.push(() => client.close());
    const states: AttachmentEvent[] = []; client.on("attachment", (event) => states.push(event));
    await client.refresh(); client.attach("surface_one", "Daemon session");
    await waitFor(() => states.some((event) => event.type === "state" && event.tab.control === "read_only"));
    expect(() => client.input("surface_one", "blocked")).toThrow("read-only");
    expect(received.some((frame) => frame.t === "input")).toBe(false);
    client.requestControl("surface_one");
    await waitFor(() => states.some((event) => event.type === "state" && event.tab.control === "controlled"));
    client.input("surface_one", "allowed");
    await waitFor(() => received.some((frame) => frame.t === "lease_renew") && received.some((frame) => frame.t === "input"));
    client.releaseControl("surface_one");
    await waitFor(() => received.some((frame) => frame.t === "lease_release"));
    client.requestControl("surface_one");
    await waitFor(() => states.some((event) => event.type === "state" && event.tab.control === "contended" && event.tab.leaseHolder === "Phone"));
    expect(() => client.input("surface_one", "still blocked")).toThrow("read-only");
  });

  it("enrolls once, protects the device credential, and clears it on server revocation", async () => {
    let snapshotCalls = 0; const credential = "device-credential-" + "x".repeat(32);
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-fleet-enroll-")); closers.push(() => { void rm(directory, { recursive: true, force: true }); });
    const protectedStorage = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value).reverse(), decryptString: (value: Buffer) => Buffer.from(value).reverse().toString("utf8") };
    const store = new FleetCredentialStore(directory, protectedStorage);
    const server = createServer((request, response) => {
      if (request.url === "/api/v1/control-plane/client-capabilities") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ apiVersion: "gblockparty.dev/v1", kind: "ClientCapabilityDiscovery", enrollmentHref: "/api/v1/control-plane/client-enrollments/exchange", snapshotHref: "/api/v1/control-plane/snapshot", surfaceAttachHref: "/api/v1/control-plane/surfaces/attach", authMethods: ["one_time_code"], scopes: ["snapshot:read", "terminal:observe", "terminal:control"], terminalAuthority: "single_writer_lease", replay: { bounded: true, resetSignal: true } })); return; }
      if (request.url === "/api/v1/control-plane/client-enrollments/exchange" && request.method === "POST") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ apiVersion: "gblockparty.dev/v1", kind: "ClientEnrollment", device: { id: "device_one", label: "Chromux Mac", scopes: ["snapshot:read", "terminal:observe", "terminal:control"] }, credential })); return; }
      if (request.url === "/api/v1/control-plane/snapshot") {
        snapshotCalls += 1;
        if (request.headers.authorization !== `Bearer ${credential}` || snapshotCalls > 1) { response.statusCode = 401; response.end(); return; }
        response.setHeader("content-type", "application/json"); response.end(JSON.stringify(snapshot)); return;
      }
      response.statusCode = 404; response.end();
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening"); closers.push(() => server.close());
    const address = server.address(); if (!address || typeof address === "string") throw new Error("missing test port");
    const endpoint = `http://127.0.0.1:${address.port}`;
    const client = new ControlPlaneClient({ baseUrl: endpoint, enabled: true, credentialStore: store }); closers.push(() => client.close());
    const enrolled = await client.enroll({ endpoint, code: "gbp_1234567890123456", deviceLabel: "Chromux Mac" });
    expect(enrolled.enrollment).toMatchObject({ status: "enrolled", deviceId: "device_one" });
    expect(await readFile(path.join(directory, "fleet-device-v1.json"), "utf8")).not.toContain(credential);
    const revoked = await client.refresh();
    expect(revoked.enrollment.status).toBe("revoked"); expect(revoked.items).toEqual([]);
    await expect(store.load()).resolves.toBeNull();
  });
});

async function waitFor(assertion: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!assertion()) { if (Date.now() > deadline) throw new Error("timed out waiting for control-plane event"); await new Promise((resolve) => setTimeout(resolve, 10)); }
}
