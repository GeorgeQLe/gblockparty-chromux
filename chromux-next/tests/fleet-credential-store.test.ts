import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FleetCredentialStore, type ProtectedStorage } from "../src/control-plane/credential-store";

const directories: string[] = [];
afterEach(async () => { while (directories.length) await rm(directories.pop()!, { recursive: true, force: true }); });

const protectedStorage: ProtectedStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from([...Buffer.from(value)].map((byte) => byte ^ 0xa5)),
  decryptString: (value) => Buffer.from([...value].map((byte) => byte ^ 0xa5)).toString("utf8")
};

describe("Fleet protected device credentials", () => {
  it("persists only encrypted credential bytes in a user-only file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-fleet-credential-")); directories.push(directory);
    const store = new FleetCredentialStore(directory, protectedStorage);
    const value = { endpoint: "https://fleet.example.com", deviceId: "device_one", deviceLabel: "Chromux Mac", credential: "credential-that-must-never-be-plaintext" };
    await store.save(value);
    const raw = await readFile(path.join(directory, "fleet-device-v1.json"), "utf8");
    expect(raw).not.toContain(value.credential);
    expect(raw).not.toContain(value.endpoint);
    expect((await stat(path.join(directory, "fleet-device-v1.json"))).mode & 0o777).toBe(0o600);
    await expect(store.load()).resolves.toEqual(value);
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it("fails closed instead of writing plaintext when protected storage is unavailable", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-fleet-credential-")); directories.push(directory);
    const store = new FleetCredentialStore(directory, { ...protectedStorage, isEncryptionAvailable: () => false });
    await expect(store.save({ endpoint: "https://fleet.example.com", deviceId: "device_one", deviceLabel: "Mac", credential: "x".repeat(40) })).rejects.toThrow("Protected credential storage is unavailable");
  });
});
