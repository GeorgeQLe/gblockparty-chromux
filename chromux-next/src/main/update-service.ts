import { execFile, spawn } from "node:child_process";
import { access, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import type { LocalStore } from "../persistence/local-store";
import type { RunnerManager } from "../runner/manager";
import { AppUpdateManifestSchema, DEFAULT_UPDATE_STATE, UpdateStateV1Schema, type UpdateStateV1 } from "../updates/contracts";
import { compareSemver } from "../updates/semver";
import { selectNextRelease, selectNextReleaseFromAtom, type NextRelease } from "../updates/release-discovery";
import { downloadFile, getJson, getText } from "../updates/network";

const run = promisify(execFile);
const API = new URL("https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases?per_page=100");
const ATOM = new URL("https://github.com/GeorgeQLe/gblockparty-chromux/releases.atom");
const DAY_MS = 86_400_000;
type Failure = NonNullable<UpdateStateV1["app"]["failure"]>;

function safeFailure(error: unknown): { failure: Failure; failureMessage: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel/i.test(message)) return { failure: "cancelled", failureMessage: "The update operation was cancelled." };
  if (/timed out/i.test(message)) return { failure: "timeout", failureMessage: "The update source did not respond in time." };
  if (/checksum|size/i.test(message)) return { failure: "checksum", failureMessage: "The package did not match its release manifest." };
  if (/signature|team|notari|Gatekeeper|bundle|architecture|identity/i.test(message)) return { failure: "untrusted-package", failureMessage: "The package failed macOS trust verification." };
  if (/malformed|manifest|release/i.test(message)) return { failure: "malformed-release", failureMessage: "The release metadata was invalid." };
  if (/HTTP|network|ENOTFOUND|ECONN/i.test(message)) return { failure: "network", failureMessage: "The update service is temporarily unavailable." };
  if (/EACCES|EPERM|writable/i.test(message)) return { failure: "filesystem", failureMessage: "This app location is not writable. Use the release page to update manually." };
  return { failure: "unknown", failureMessage: "The update operation failed safely." };
}

function bundlePath(executable = process.execPath): string | undefined { return executable.match(/^(.*\.app)\/Contents\/MacOS\//)?.[1]; }

export interface UpdateServiceOptions {
  currentVersion: string; userDataPath: string; isPackaged: boolean;
  platform?: NodeJS.Platform; arch?: string; executablePath?: string; now?: () => Date;
  api?: typeof getJson; text?: typeof getText; download?: typeof downloadFile;
}

/** Main-process-owned app updater. Renderer-visible state never contains commands or local paths. */
export class UpdateService extends EventEmitter {
  private state: UpdateStateV1 = structuredClone(DEFAULT_UPDATE_STATE);
  private controller: AbortController | undefined;
  private release?: NextRelease;
  private stagedAppPath: string | undefined;
  private preparing = false;
  private readonly now: () => Date;

  constructor(private readonly store: LocalStore, private readonly runner: RunnerManager, private readonly options: UpdateServiceOptions) {
    super(); this.now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    this.state = UpdateStateV1Schema.parse(await this.store.getUpdateState());
    this.state.app.currentVersion = this.options.currentVersion;
    this.state.app.blockers = this.runner.getMaintenanceBlockers();
    if (this.state.app.staged) this.state.app = { ...this.state.app, phase: "available", staged: false, trust: "unknown", progressLabel: "Prepare the package again after restarting Chromux Next." };
    if (this.state.app.latestVersion && this.state.app.releaseUrl) {
      const version = this.state.app.latestVersion; const tag = `chromux-next-v${version}`; const stored = new URL(this.state.app.releaseUrl);
      if (stored.origin === "https://github.com" && stored.pathname === `/GeorgeQLe/gblockparty-chromux/releases/tag/${tag}` && !stored.search && !stored.hash) {
        this.release = { version, tag, releaseUrl: stored.toString(), manifestUrl: `https://github.com/GeorgeQLe/gblockparty-chromux/releases/download/${tag}/chromux-next-${version}-manifest-v1.json` };
      }
    }
    await this.publish();
  }

  getState(): UpdateStateV1 { return structuredClone(this.state); }

  async checkApp(manual = true): Promise<UpdateStateV1> {
    const checked = this.state.app.checkedAt ? Date.parse(this.state.app.checkedAt) : 0;
    if (!manual && this.state.app.phase !== "failed" && this.now().getTime() - checked < DAY_MS) return this.getState();
    this.state.app = { ...this.state.app, phase: "checking", currentVersion: this.options.currentVersion, failure: undefined, failureMessage: undefined, progressLabel: "Checking Chromux Next releases…" };
    await this.publish();
    const controller = new AbortController();
    try {
      let release: NextRelease | undefined;
      try { release = selectNextRelease(await (this.options.api ?? getJson)(API, controller.signal)); }
      catch { release = selectNextReleaseFromAtom(await (this.options.text ?? getText)(ATOM, controller.signal)); }
      if (!release) throw new Error("No valid Chromux Next prerelease was found");
      this.release = release;
      const available = compareSemver(release.version, this.options.currentVersion) > 0;
      this.state.app = { phase: available ? "available" : "current", currentVersion: this.options.currentVersion, latestVersion: release.version, releaseUrl: release.releaseUrl, checkedAt: this.now().toISOString(), blockers: this.runner.getMaintenanceBlockers(), trust: "unknown", managedInstallSupported: this.managedPlatform(), staged: false, progressLabel: available ? "A newer Chromux Next prerelease is available." : "Chromux Next is current." };
    } catch (error) { this.state.app = { ...this.state.app, phase: "failed", checkedAt: this.now().toISOString(), ...safeFailure(error), progressLabel: undefined }; }
    await this.publish(); return this.getState();
  }

  async prepare(): Promise<UpdateStateV1> {
    if (!this.release || this.state.app.phase !== "available") throw new Error("No Chromux Next update is available to prepare");
    if (!this.managedPlatform()) {
      this.state.app = { ...this.state.app, phase: "available", trust: "manual-only", managedInstallSupported: false, progressLabel: "Managed installation requires a signed packaged macOS arm64 build. Open the release page to update manually." };
      await this.publish(); return this.getState();
    }
    if (this.preparing) throw new Error("An app update is already being prepared");
    this.preparing = true;
    this.controller?.abort(); this.controller = new AbortController();
    const version = this.release.version; const root = path.join(this.options.userDataPath, "updates", version);
    const archive = path.join(root, `GBlockParty-Chromux-Next-${version}-darwin-arm64.zip`); const extracted = path.join(root, "staged");
    try {
      await this.verifyCurrentInstall();
      this.state.app = { ...this.state.app, phase: "downloading", progressPercent: 0, progressLabel: "Downloading and verifying the signed package…", staged: false, trust: "unknown" }; await this.publish();
      await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true, mode: 0o700 });
      const manifest = AppUpdateManifestSchema.parse(await (this.options.api ?? getJson)(new URL(this.release.manifestUrl), this.controller.signal));
      if (manifest.version !== version || compareSemver(manifest.version, this.options.currentVersion) <= 0) throw new Error("Manifest would not install a newer version");
      const assetUrl = new URL(`https://github.com/GeorgeQLe/gblockparty-chromux/releases/download/${manifest.tag}/${manifest.asset}`);
      const result = await (this.options.download ?? downloadFile)(assetUrl, archive, this.controller.signal, manifest.size, (bytes, total) => { if (total) this.state.app.progressPercent = Math.min(99, Math.floor(bytes / total * 100)); });
      if (result.bytes !== manifest.size || result.sha256 !== manifest.sha256) throw new Error("Package checksum or size mismatch");
      await mkdir(extracted, { mode: 0o700 });
      await run("/usr/bin/ditto", ["-x", "-k", "--sequesterRsrc", "--rsrc", archive, extracted], { timeout: 120_000, maxBuffer: 64 * 1024 });
      this.stagedAppPath = await this.verifyStaged(extracted, manifest.version);
      const blockers = this.runner.getMaintenanceBlockers();
      this.state.app = { ...this.state.app, phase: blockers.length ? "blocked" : "staged", progressPercent: 100, progressLabel: "Signed, notarized package verified. Installation still requires confirmation.", blockers, staged: true, trust: "verified", managedInstallSupported: true };
    } catch (error) { this.stagedAppPath = undefined; const problem = safeFailure(error); this.state.app = { ...this.state.app, phase: "failed", staged: false, trust: problem.failure === "untrusted-package" || problem.failure === "filesystem" ? "manual-only" : "unknown", managedInstallSupported: problem.failure === "untrusted-package" || problem.failure === "filesystem" ? false : this.state.app.managedInstallSupported, ...problem, progressPercent: undefined, progressLabel: undefined }; }
    finally { this.controller = undefined; this.preparing = false; }
    await this.publish(); return this.getState();
  }

  async cancel(): Promise<UpdateStateV1> { this.controller?.abort(); return this.getState(); }

  async refreshBlockers(): Promise<void> {
    const blockers = this.runner.getMaintenanceBlockers();
    const appPhase = this.state.app.staged ? blockers.length ? "blocked" : "staged" : this.state.app.phase;
    const codexPhase = this.state.codex.phase === "blocked" && !blockers.length ? "available" : this.state.codex.phase === "available" && blockers.length ? "blocked" : this.state.codex.phase;
    if (JSON.stringify(this.state.app.blockers) === JSON.stringify(blockers) && this.state.app.phase === appPhase && JSON.stringify(this.state.codex.blockers) === JSON.stringify(blockers) && this.state.codex.phase === codexPhase) return;
    this.state.app = { ...this.state.app, phase: appPhase, blockers };
    this.state.codex = { ...this.state.codex, phase: codexPhase, blockers };
    await this.publish();
  }

  async confirmInstall(helperPath: string): Promise<{ launched: boolean }> {
    const blockers = this.runner.getMaintenanceBlockers();
    if (!this.stagedAppPath || !this.state.app.staged || this.state.app.trust !== "verified") throw new Error("No verified app update is staged");
    if (blockers.length) { this.state.app = { ...this.state.app, phase: "blocked", blockers }; await this.publish(); return { launched: false }; }
    const current = bundlePath(this.options.executablePath); if (!current) throw new Error("The current application bundle could not be located");
    try { await access(path.dirname(current), constants.W_OK); } catch { throw new Error("Current application location is not writable"); }
    await this.runner.beginMaintenance();
    this.state.app = { ...this.state.app, phase: "installing", blockers: [], progressLabel: "Installing the verified update and preparing to relaunch…" }; await this.publish();
    const marker = path.join(this.options.userDataPath, "update-startup-success-v1");
    const child = spawn(process.execPath, [helperPath, String(process.pid), current, this.stagedAppPath, marker], { detached: true, stdio: "ignore", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
    child.unref(); return { launched: true };
  }

  setCodexState(state: UpdateStateV1["codex"]): void { this.state.codex = state; void this.publish(); }
  private managedPlatform(): boolean { return (this.options.platform ?? process.platform) === "darwin" && (this.options.arch ?? process.arch) === "arm64" && this.options.isPackaged; }

  private async verifyCurrentInstall(): Promise<void> {
    const current = bundlePath(this.options.executablePath); if (!current) throw new Error("Current bundle identity is unavailable");
    await access(path.dirname(current), constants.W_OK);
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", current], { timeout: 30_000, maxBuffer: 32 * 1024 });
    const details = (await run("/usr/bin/codesign", ["-dv", "--verbose=4", current], { timeout: 10_000, maxBuffer: 32 * 1024 })).stderr;
    if (!details.includes("TeamIdentifier=NC56VXK48K")) throw new Error("Current bundle has the wrong signing Team ID");
  }

  private async verifyStaged(directory: string, version: string): Promise<string> {
    const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (entries.length !== 1) throw new Error("Package must contain exactly one app bundle");
    const bundle = path.join(directory, entries[0]!.name); const plist = path.join(bundle, "Contents", "Info.plist");
    const readPlist = async (key: string) => (await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist], { timeout: 10_000, maxBuffer: 4096 })).stdout.trim();
    if (await readPlist("CFBundleIdentifier") !== "dev.georgele.chromux.next") throw new Error("Wrong bundle identity");
    if (await readPlist("CFBundleShortVersionString") !== version) throw new Error("Wrong bundle version");
    await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", bundle], { timeout: 30_000, maxBuffer: 32 * 1024 });
    const details = (await run("/usr/bin/codesign", ["-dv", "--verbose=4", bundle], { timeout: 10_000, maxBuffer: 32 * 1024 })).stderr;
    if (!details.includes("TeamIdentifier=NC56VXK48K")) throw new Error("Wrong signing Team ID");
    await run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", bundle], { timeout: 30_000, maxBuffer: 32 * 1024 });
    const executable = path.join(bundle, "Contents", "MacOS", "chromux-next");
    if (!(await stat(executable)).isFile()) throw new Error("Bundle executable is missing");
    if (!(await run("/usr/bin/file", [executable], { timeout: 10_000, maxBuffer: 4096 })).stdout.includes("arm64")) throw new Error("Wrong package architecture");
    return bundle;
  }

  private async publish(): Promise<void> { this.state = UpdateStateV1Schema.parse(this.state); await this.store.updateUpdateState(this.state); this.emit("state", this.getState()); }
}
