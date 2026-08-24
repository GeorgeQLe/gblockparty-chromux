import fs from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The production helper intentionally remains CommonJS so Electron can run it
// directly with ELECTRON_RUN_AS_NODE after the app process exits.
// @ts-expect-error CommonJS fixture module has no declaration file.
import helperModule from "../scripts/update-helper-core.cjs";

const helper: {
  applyUpdate(input: Record<string, unknown>): boolean;
  openApp(appPath: string, environment: NodeJS.ProcessEnv, spawnProcess: (...args: unknown[]) => { unref(): void }): void;
} = helperModule;
const { applyUpdate, openApp } = helper;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "chromux-next-helper-"));
  const current = path.join(root, "Chromux Next.app"); const staged = path.join(root, "Staged.app"); const marker = path.join(root, "startup-marker");
  await mkdir(current); await mkdir(staged); await writeFile(path.join(current, "version"), "old"); await writeFile(path.join(staged, "version"), "new");
  return { root, current, staged, marker };
}

describe("update replacement helper", () => {
  it("atomically replaces, observes startup, and cleans the backup", async () => {
    const value = await fixture();
    expect(applyUpdate({ pid: 1, ...value, processAlive: () => false, launch: () => { fs.writeFileSync(value.marker, "ready"); }, sleep: () => undefined })).toBe(true);
    expect(await readFile(path.join(value.current, "version"), "utf8")).toBe("new");
    expect(fs.existsSync(`${value.current}.chromux-update-backup`)).toBe(false);
  });

  it("rolls back and reopens the prior bundle when startup never succeeds", async () => {
    const value = await fixture(); const launches: Array<{ target: string; profile: string | undefined }> = [];
    expect(() => applyUpdate({ pid: 1, ...value, startupTimeoutMs: 0, processAlive: () => false, launchEnvironment: { CHROMUX_NEXT_SMOKE_USER_DATA: "/tmp/isolated-profile" }, launch: (target: string, environment: NodeJS.ProcessEnv) => { launches.push({ target, profile: environment.CHROMUX_NEXT_SMOKE_USER_DATA }); }, sleep: () => undefined })).toThrow(/startup marker/);
    expect(await readFile(path.join(value.current, "version"), "utf8")).toBe("old");
    expect(launches).toEqual([
      { target: value.current, profile: "/tmp/isolated-profile" },
      { target: value.current, profile: "/tmp/isolated-profile" }
    ]);
  });

  it("opens the exact bundle as a new instance with the isolated profile", () => {
    let invocation: unknown[] = []; let detached = false;
    openApp("/tmp/rollback/Chromux Next.app", { CHROMUX_NEXT_SMOKE_USER_DATA: "/tmp/isolated profile", CODEX_HOME: "/tmp/isolated codex" }, (...args: unknown[]) => {
      invocation = args; return { unref: () => { detached = true; } };
    });
    expect(invocation).toEqual([
      "/usr/bin/open",
      ["-n", "--env", "CHROMUX_NEXT_SMOKE_USER_DATA=/tmp/isolated profile", "--env", "CODEX_HOME=/tmp/isolated codex", "/tmp/rollback/Chromux Next.app"],
      { detached: true, stdio: "ignore" }
    ]);
    expect(detached).toBe(true);
  });

  it("never deletes the current bundle when failure happens before backup", async () => {
    const value = await fixture(); let launched = "";
    const fileSystem = new Proxy(fs, { get(target, property, receiver) {
      if (property === "rmSync") return () => { throw new Error("injected pre-backup failure"); };
      return Reflect.get(target, property, receiver);
    } });
    expect(() => applyUpdate({ pid: 1, ...value, fileSystem, processAlive: () => false, launch: (target: string) => { launched = target; }, sleep: () => undefined })).toThrow(/pre-backup/);
    expect(await readFile(path.join(value.current, "version"), "utf8")).toBe("old");
    expect(launched).toBe(value.current);
  });
});
