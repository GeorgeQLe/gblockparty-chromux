import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { constants } from "node:fs";
import { promisify } from "node:util";
import type { RunnerManager } from "../runner/manager";
import type { UpdateTargetState } from "../updates/contracts";
import { compareSemver } from "../updates/semver";
import { getJson } from "../updates/network";

const execute = promisify(execFile);
const RELEASE_API = new URL("https://api.github.com/repos/openai/codex/releases/latest");
const HOMEBREW_API = new URL("https://formulae.brew.sh/api/cask/codex.json");
const NPM_API = "https://registry.npmjs.org/@openai%2fcodex";
const RELEASE_URL = "https://github.com/openai/codex/releases/latest";
const VERSION_RE = /(?:^|[^0-9])v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)(?:$|[^0-9A-Za-z.-])/;

export function parseCodexVersion(value: unknown): string | undefined { return String(value ?? "").match(VERSION_RE)?.[1]; }

export function codexInstallKind(executable: string, resolved = executable): "homebrew" | "npm" | "standalone" {
  const value = `${executable}\n${resolved}`.replace(/\\/g, "/").toLowerCase();
  if (/\/cellar\/codex\/|\/homebrew\/caskroom\/codex\//.test(value)) return "homebrew";
  if (/\/node_modules\/(?:@openai\/)?codex\/|\/(?:npm|pnpm|bun)\/.*codex/.test(value)) return "npm";
  return "standalone";
}

export interface CodexUpdateOptions {
  path?: string; now?: () => Date; request?: typeof getJson;
  run?: typeof execute; wait?: (milliseconds: number) => Promise<void>;
}

export class CodexUpdateService {
  private state: UpdateTargetState = { phase: "idle", blockers: [], trust: "unknown", managedInstallSupported: false, staged: false, releaseUrl: RELEASE_URL };
  private executable: string | undefined;
  private installing = false;
  private readonly searchPath: string;
  constructor(private readonly runner: RunnerManager, private readonly changed: (state: UpdateTargetState) => void, private readonly options: CodexUpdateOptions = {}) {
    this.searchPath = options.path ?? [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin"), path.join(os.homedir(), ".npm-global/bin"), path.join(os.homedir(), ".bun/bin"), path.join(os.homedir(), ".volta/bin")].filter(Boolean).join(path.delimiter);
  }

  getState(): UpdateTargetState { return structuredClone(this.state); }

  async check(): Promise<UpdateTargetState> {
    this.update({ ...this.state, phase: "checking", failure: undefined, failureMessage: undefined, progressLabel: "Checking Codex releases…" });
    let lastError: unknown;
    for (const delay of [0, 1000, 2000]) {
      if (delay) await (this.options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(delay);
      try { return await this.checkAttempt(); } catch (error) { lastError = error; }
    }
    const missing = /not found/.test(String(lastError));
    return this.update({ phase: "failed", blockers: [], trust: "manual-only", managedInstallSupported: false, staged: false, releaseUrl: RELEASE_URL, failure: missing ? "unsupported" : "network", failureMessage: missing ? "Codex was not found. Install it from the stable release page." : "The Codex update check failed safely.", checkedAt: (this.options.now ?? (() => new Date()))().toISOString() });
  }

  async install(): Promise<UpdateTargetState> {
    if (this.state.phase !== "available" || !this.executable || !this.state.latestVersion || !this.state.currentVersion) throw new Error("No Codex update is ready to install");
    const blockers = this.runner.getMaintenanceBlockers();
    if (blockers.length) return this.update({ ...this.state, phase: "blocked", blockers });
    if (!this.state.managedInstallSupported) return this.state;
    if (this.installing) throw new Error("A Codex update is already running");
    this.installing = true;
    let maintenanceStarted = false;
    try {
      await this.runner.beginMaintenance(); maintenanceStarted = true;
      this.update({ ...this.state, phase: "installing", blockers: [], progressLabel: "Running the supported Codex updater and verifying the result…" });
      await (this.options.run ?? execute)(this.executable, ["update"], { timeout: 5 * 60_000, maxBuffer: 32 * 1024, env: { ...process.env, PATH: this.searchPath, CODEX_DISABLE_UPDATE_PROMPT: "1", CODEX_DISABLE_UPDATE_CHECK: "1" } });
      const version = await this.installedVersion(this.executable);
      if (compareSemver(version, this.state.currentVersion) <= 0 || compareSemver(version, this.state.latestVersion) < 0) throw new Error("Codex version did not increase to the expected release");
      await this.runner.resumeAfterMaintenance();
      return this.update({ ...this.state, phase: "current", currentVersion: version, blockers: [], failure: undefined, failureMessage: undefined, progressLabel: "Codex updated and sessions restored." });
    } catch {
      let restored = !maintenanceStarted;
      if (maintenanceStarted) { try { await this.runner.resumeAfterMaintenance(); restored = true; } catch { restored = false; } }
      return this.update({ ...this.state, phase: "failed", failure: "verification", failureMessage: maintenanceStarted ? restored ? "Codex did not update successfully. The previous runtime was restored." : "Codex did not update and the app-server could not be restored. Restart Chromux Next." : "The workspace changed before Codex maintenance could begin.", progressLabel: undefined });
    } finally {
      this.installing = false;
    }
  }

  private async checkAttempt(): Promise<UpdateTargetState> {
    this.executable = await this.resolveExecutable();
    if (!this.executable) throw new Error("Codex executable was not found");
    const currentVersion = await this.installedVersion(this.executable);
    let resolved = this.executable; try { resolved = await realpath(this.executable); } catch { /* retain entry */ }
    const installKind = codexInstallKind(this.executable, resolved);
    const request = this.options.request ?? getJson;
    const signal = new AbortController().signal;
    const payload = await request(installKind === "homebrew" ? HOMEBREW_API : RELEASE_API, signal) as Record<string, unknown>;
    const latestVersion = parseCodexVersion(installKind === "homebrew" ? payload.version : payload.tag_name);
    if (!latestVersion) throw new Error("Codex release was malformed");
    if (installKind === "npm") {
      const npmPayload = await request(new URL(`${NPM_API}/${encodeURIComponent(latestVersion)}`), signal) as Record<string, unknown>;
      if (parseCodexVersion(npmPayload.version) !== latestVersion) throw new Error("The newest Codex release is not available from npm yet");
    }
    const releaseUrl = installKind !== "homebrew" && typeof payload.html_url === "string" && payload.html_url.startsWith("https://github.com/openai/codex/releases/") ? payload.html_url : RELEASE_URL;
    const childEnv = { ...process.env, PATH: this.searchPath, CODEX_DISABLE_UPDATE_PROMPT: "1", CODEX_DISABLE_UPDATE_CHECK: "1" };
    const help = await (this.options.run ?? execute)(this.executable, ["update", "--help"], { timeout: 10_000, maxBuffer: 32 * 1024, env: childEnv }).catch(() => undefined);
    const supported = Boolean(help && /update/i.test(`${help.stdout}\n${help.stderr}`));
    const available = compareSemver(latestVersion, currentVersion) > 0;
    return this.update({ phase: available ? "available" : "current", currentVersion, latestVersion, releaseUrl, checkedAt: (this.options.now ?? (() => new Date()))().toISOString(), blockers: this.runner.getMaintenanceBlockers(), trust: supported ? "verified" : "manual-only", installKind, managedInstallSupported: supported, staged: false, progressLabel: available ? supported ? "A Codex update is available." : `Update Codex manually using ${installKind} guidance.` : "Codex is current." });
  }

  private async installedVersion(executable: string): Promise<string> {
    const result = await (this.options.run ?? execute)(executable, ["--version"], { timeout: 10_000, maxBuffer: 32 * 1024, env: { ...process.env, PATH: this.searchPath, CODEX_DISABLE_UPDATE_PROMPT: "1", CODEX_DISABLE_UPDATE_CHECK: "1" } });
    const version = parseCodexVersion(`${result.stdout}\n${result.stderr}`); if (!version) throw new Error("Could not read the installed Codex version"); return version;
  }

  private async resolveExecutable(): Promise<string | undefined> {
    const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];
    for (const directory of this.searchPath.split(path.delimiter)) for (const extension of extensions) {
      const candidate = path.join(directory, `codex${extension}`); try { await access(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
    }
    return undefined;
  }
  private update(state: UpdateTargetState): UpdateTargetState { this.state = state; this.changed(this.getState()); return this.getState(); }
}
