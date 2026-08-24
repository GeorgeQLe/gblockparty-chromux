import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppUpdateManifestSchema, DEFAULT_UPDATE_STATE } from "../src/updates/contracts";
import { compareSemver } from "../src/updates/semver";
import { selectNextRelease, selectNextReleaseFromAtom } from "../src/updates/release-discovery";
import { LocalStore } from "../src/persistence/local-store";
import { safeFailure, UpdateService } from "../src/main/update-service";
import { maintenanceBlockers } from "../src/runner/manager";
import { CodexUpdateService, codexInstallKind, parseCodexVersion } from "../src/main/codex-update-service";
import type { RunnerSessionV1, RunnerStateV1 } from "../src/runner/contracts";

const release = (tag: string, overrides: Record<string, unknown> = {}) => {
  const name = `chromux-next-${tag.replace("chromux-next-v", "")}-manifest-v1.json`;
  return { tag_name: tag, draft: false, prerelease: true, html_url: `https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/${tag}`, assets: [{ name, browser_download_url: `https://github.com/GeorgeQLe/gblockparty-chromux/releases/download/${tag}/${name}`, size: 10 }], ...overrides };
};

describe("Chromux Next update contracts", () => {
  it("orders semantic versions and prereleases without lexical mistakes", () => {
    expect(compareSemver("0.12.0", "0.11.10")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0-rc.9")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-rc.10", "1.0.0-rc.2")).toBeGreaterThan(0);
    expect(() => compareSemver("01.0.0", "1.0.0")).toThrow(/Malformed/);
  });

  it("selects the greatest non-draft prerelease and ignores legacy tags", () => {
    const selected = selectNextRelease([
      release("chromux-next-v0.11.9"), release("chromux-v99.0.0"),
      release("chromux-next-v0.12.0", { draft: true }), release("chromux-next-v0.11.10")
    ]);
    expect(selected?.version).toBe("0.11.10");
  });

  it("uses a bounded Atom feed with predictable manifest naming", () => {
    const selected = selectNextReleaseFromAtom("<feed><entry><id>tag:github.com,2008:Repository/1/chromux-next-v0.12.0</id></entry><entry>chromux-v9.9.9</entry></feed>");
    expect(selected).toMatchObject({ tag: "chromux-next-v0.12.0", manifestUrl: expect.stringContaining("chromux-next-0.12.0-manifest-v1.json") });
    expect(() => selectNextReleaseFromAtom("x".repeat(2 * 1024 * 1024 + 1))).toThrow(/too large/);
  });

  it("requires manifest identity fields, checksum bounds, and the expected team", () => {
    const valid = { schemaVersion: 1, tag: "chromux-next-v0.12.0", version: "0.12.0", platform: "darwin", architecture: "arm64", asset: "GBlockParty-Chromux-Next-0.12.0-darwin-arm64.zip", size: 42, sha256: "a".repeat(64), bundleId: "dev.georgele.chromux.next", teamId: "NC56VXK48K" };
    expect(AppUpdateManifestSchema.parse(valid).version).toBe("0.12.0");
    expect(() => AppUpdateManifestSchema.parse({ ...valid, teamId: "EVIL" })).toThrow();
    expect(() => AppUpdateManifestSchema.parse({ ...valid, asset: "other.zip" })).toThrow();
  });

  it("recovers a malformed update slice independently", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-update-state-"));
    const store = new LocalStore(directory);
    await store.updateRunner({ schemaVersion: 1, groups: [], sessions: [], triage: [] });
    await writeFile(path.join(directory, "update-state-v1.json"), "{\"schemaVersion\":99}");
    const state = await store.read();
    expect(state.updateState).toEqual(DEFAULT_UPDATE_STATE);
    expect(state.runner?.sessions).toEqual([]);
    await store.updateUpdateState({ ...DEFAULT_UPDATE_STATE, app: { ...DEFAULT_UPDATE_STATE.app, phase: "available", currentVersion: "0.11.1", latestVersion: "0.12.0" } });
    expect(JSON.parse(await readFile(path.join(directory, "update-state-v1.json"), "utf8")).app.phase).toBe("available");
  });

  it("keeps staging cleanup and extraction failures sanitized and retryable", () => {
    expect(safeFailure(Object.assign(new Error("rm failed"), { code: "ENOTEMPTY" }))).toEqual({
      failure: "filesystem",
      failureMessage: "Chromux Next could not write its private update staging area. Check free disk space and retry.",
      manualOnly: false
    });
    expect(safeFailure(new Error("ditto emitted a private path"))).toMatchObject({ failure: "unknown", manualOnly: false });
  });

  it("re-prepares the same successor after restart and removes its stale staged tree", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-restage-"));
    const current = path.join(directory, "Current.app");
    const executable = path.join(current, "Contents", "MacOS", "chromux-next");
    const stale = path.join(directory, "updates", "0.14.1", "staged", "Chromux Next.app", "Contents", "Resources", "app.asar");
    await mkdir(path.dirname(executable), { recursive: true }); await writeFile(executable, "old");
    await mkdir(path.dirname(stale), { recursive: true }); await writeFile(stale, "stale");
    const store = new LocalStore(directory);
    await store.updateUpdateState({ ...DEFAULT_UPDATE_STATE, app: { phase: "staged", currentVersion: "0.14.0", latestVersion: "0.14.1", releaseUrl: "https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-next-v0.14.1", blockers: [], trust: "verified", managedInstallSupported: true, staged: true } });
    const manifest = { schemaVersion: 1 as const, tag: "chromux-next-v0.14.1", version: "0.14.1", platform: "darwin" as const, architecture: "arm64" as const, asset: "GBlockParty-Chromux-Next-0.14.1-darwin-arm64.zip", size: 42, sha256: "a".repeat(64), bundleId: "dev.georgele.chromux.next" as const, teamId: "NC56VXK48K" as const };
    const command = vi.fn(async (file: string, args: string[]) => {
      if (file === "/usr/bin/ditto") {
        const bundle = path.join(args.at(-1)!, "Chromux Next.app");
        await mkdir(path.join(bundle, "Contents", "MacOS"), { recursive: true }); await writeFile(path.join(bundle, "Contents", "MacOS", "chromux-next"), "new");
        return { stdout: "", stderr: "" };
      }
      if (file === "/usr/bin/plutil") return { stdout: args[1] === "CFBundleIdentifier" ? "dev.georgele.chromux.next\n" : "0.14.1\n", stderr: "" };
      if (file === "/usr/bin/codesign" && args[0] === "-dv") return { stdout: "", stderr: "TeamIdentifier=NC56VXK48K" };
      if (file === "/usr/bin/file") return { stdout: "Mach-O 64-bit executable arm64", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const service = new UpdateService(store, { getMaintenanceBlockers: () => [] } as never, {
      currentVersion: "0.14.0", userDataPath: directory, isPackaged: true, platform: "darwin", arch: "arm64", executablePath: executable,
      api: async () => manifest, download: async () => ({ bytes: 42, sha256: "a".repeat(64) }), command
    });
    await service.initialize();
    expect(service.getState().app).toMatchObject({ phase: "available", staged: false });
    await service.prepare();
    expect(service.getState().app).toMatchObject({ phase: "staged", staged: true, trust: "verified" });
    expect(fs.existsSync(stale)).toBe(false);

    const failing = new UpdateService(store, { getMaintenanceBlockers: () => [] } as never, {
      currentVersion: "0.14.0", userDataPath: directory, isPackaged: true, platform: "darwin", arch: "arm64", executablePath: executable,
      api: async () => manifest, download: async () => ({ bytes: 42, sha256: "a".repeat(64) }),
      command: async (file, args) => {
        if (file === "/usr/bin/ditto") throw new Error(`private extraction output: ${directory}`);
        return command(file, args);
      }
    });
    await failing.initialize(); await failing.prepare();
    expect(failing.getState().app).toMatchObject({
      phase: "failed", failure: "extraction", managedInstallSupported: true,
      failureMessage: "The verified download could not be extracted. Retry preparation; if it repeats, use the release page."
    });
    expect(JSON.stringify(failing.getState())).not.toContain(directory);
  });

  it("caches successful automatic checks for 24 hours and lets manual checks bypass", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-update-check-"));
    const store = new LocalStore(directory); let calls = 0;
    const runner = { getMaintenanceBlockers: () => [] };
    const service = new UpdateService(store, runner as never, { currentVersion: "0.11.1", userDataPath: directory, isPackaged: false, now: () => new Date("2026-08-21T12:00:00Z"), api: async () => { calls += 1; return [release("chromux-next-v0.12.0")]; } });
    await service.initialize(); await service.checkApp(false); await service.checkApp(false);
    expect(calls).toBe(1); expect(service.getState().app.phase).toBe("available");
    await service.checkApp(true); expect(calls).toBe(2);
  });
});

function session(status: RunnerSessionV1["status"], interactions = 0, activeTurnId?: string): RunnerSessionV1 {
  const at = "2026-08-21T12:00:00.000Z";
  return { schemaVersion: 1, id: `${status}-${interactions}`, title: `${status} session`, projectPath: "/tmp", canonicalProjectPath: "/tmp", groupId: "group", threadId: "thread", ...(activeTurnId ? { activeTurnId } : {}), status, permissionPreset: "workspace", historyHydration: "complete", draft: "saved", createdAt: at, updatedAt: at, events: [], interactions: Array.from({ length: interactions }, (_, index) => ({ schemaVersion: 1, id: `i-${index}`, requestId: index, sessionId: `${status}-${interactions}`, threadId: "thread", at, kind: "question", title: "Question", detail: "Answer needed", questions: [], offeredDecisions: ["cancel"], rawMethod: "item/tool/requestUserInput" })) };
}

describe("maintenance boundary", () => {
  it("allows idle, failed, and closed sessions but blocks starting, active, turns, and interactions", () => {
    const state = (sessions: RunnerSessionV1[]): RunnerStateV1 => ({ schemaVersion: 1, groups: [], sessions, triage: [] });
    expect(maintenanceBlockers(state([session("idle"), session("failed"), session("closed")]))).toEqual([]);
    expect(maintenanceBlockers(state([session("starting"), session("active", 0, "turn"), session("idle", 1)]))).toEqual([
      "starting session is starting", "active session has an active turn", "idle session has 1 unanswered interaction"
    ]);
  });
});

describe("Codex update service", () => {
  it("detects install kinds and parses bounded versions", () => {
    expect(codexInstallKind("/opt/homebrew/bin/codex", "/opt/homebrew/Caskroom/codex/0.148.0/codex")).toBe("homebrew");
    expect(codexInstallKind("/usr/local/lib/node_modules/@openai/codex/bin/codex.js")).toBe("npm");
    expect(codexInstallKind("/usr/local/bin/codex")).toBe("standalone");
    expect(parseCodexVersion("codex-cli 0.148.0")).toBe("0.148.0");
    expect(parseCodexVersion("nightly")).toBeUndefined();
  });

  it("probes capability, updates explicitly, verifies the version, and restores sessions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-codex-update-"));
    const executable = path.join(directory, "codex"); await writeFile(executable, ""); await chmod(executable, 0o755);
    let installed = "0.148.0";
    const beginMaintenance = vi.fn(async () => undefined); const resumeAfterMaintenance = vi.fn(async () => undefined);
    const runner = { getMaintenanceBlockers: () => [], beginMaintenance, resumeAfterMaintenance };
    const changed = vi.fn();
    const run = vi.fn(async (_file: string, args: string[]) => {
      if (args[0] === "--version") return { stdout: `codex-cli ${installed}`, stderr: "" };
      if (args[0] === "update" && args[1] === "--help") return { stdout: "Update Codex", stderr: "" };
      if (args[0] === "update") { installed = "0.149.0"; return { stdout: "raw private output", stderr: "" }; }
      throw new Error("unexpected command");
    });
    const service = new CodexUpdateService(runner as never, changed, {
      path: directory, run: run as never, wait: async () => undefined,
      request: (async (url: URL) => {
        expect(url.hostname).toBe("api.github.com");
        return { tag_name: "rust-v0.149.0", html_url: "https://github.com/openai/codex/releases/tag/rust-v0.149.0" };
      }) as never
    });
    expect((await service.check()).managedInstallSupported).toBe(true);
    const result = await service.install();
    expect(result).toMatchObject({ phase: "current", currentVersion: "0.149.0" });
    expect(JSON.stringify(result)).not.toContain("raw private output");
    expect(beginMaintenance).toHaveBeenCalledOnce(); expect(resumeAfterMaintenance).toHaveBeenCalledOnce();
  });

  it("keeps unsupported capability informational", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-codex-manual-"));
    await mkdir(path.join(directory, "bin")); const executable = path.join(directory, "bin", "codex"); await writeFile(executable, ""); await chmod(executable, 0o755);
    const service = new CodexUpdateService({ getMaintenanceBlockers: () => [] } as never, vi.fn(), {
      path: path.join(directory, "bin"), wait: async () => undefined,
      run: (async (_file: string, args: string[]) => args[0] === "--version" ? { stdout: "codex 0.148.0", stderr: "" } : Promise.reject(new Error("unsupported"))) as never,
      request: (async () => ({ tag_name: "rust-v0.149.0", html_url: "https://github.com/openai/codex/releases/tag/rust-v0.149.0" })) as never
    });
    expect(await service.check()).toMatchObject({ phase: "available", managedInstallSupported: false, trust: "manual-only", installKind: "standalone" });
  });
});
