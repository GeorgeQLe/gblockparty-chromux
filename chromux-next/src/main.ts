import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell
} from "electron";
import type { MessageBoxOptions } from "electron";
import started from "electron-squirrel-startup";
import {
  AgentRunRequestSchema,
  AlignmentDocumentV1Schema,
  BrowserActionInputSchema,
  BrowserOpenInputSchema,
  BrowserPresentationInputSchema,
  EvidenceCaptureInputSchema,
  EvidenceIdInputSchema,
  EvidenceReviewInputSchema,
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  DocumentPathSchema,
  GroupMutationInputSchema,
  IpcChannels,
  MutationPayloadSchema,
  SavePayloadSchema,
  TriageInputSchema,
  TurnInputSchema
  ,AcquireDetectionLeaseInputSchema
  ,CreateFromDetectionInputSchema
  ,DetectionLeaseIdInputSchema
  ,UiPreferencesPatchV1Schema
  ,WorkspacePreferencesPatchV1Schema
  ,UpdateActionSchema
  ,UpdateCheckActionSchema
  ,UpdateReleaseNotesActionSchema
} from "./ipc/contracts";
import { DocumentStore } from "./persistence/document-store";
import { CodexProvider } from "./providers/codex-provider";
import { FakeProvider } from "./providers/fake-provider";
import type { AgentProvider } from "./providers/provider";
import { LocalStore } from "./persistence/local-store";
import { CodexAppServer } from "./runner/protocol";
import { LunaAnalyzer } from "./runner/attention";
import { RunnerManager } from "./runner/manager";
import { ExternalTerminalDetector } from "./detection/external";
import { DetectionLeaseStore } from "./detection/leases";
import type { EnrichedDetectionCandidate } from "./detection/contracts";
import { BrowserViewService } from "./main/browser-view-service";
import { IpcHandlerRegistry } from "./ipc/registry";
import { BrowserEvidenceWorkflow } from "./browser/workflow";
import { UpdateService } from "./main/update-service";
import { CodexUpdateService } from "./main/codex-update-service";

if (started) app.quit();

app.setName("GBlockParty Chromux Next");
app.setPath("userData", process.env.CHROMUX_NEXT_SMOKE_USER_DATA
  ? path.resolve(process.env.CHROMUX_NEXT_SMOKE_USER_DATA)
  : path.join(app.getPath("appData"), "GBlockParty Chromux Next"));

const documents = new DocumentStore();
const localStore = new LocalStore(app.getPath("userData"));
const runnerSmokeArgument = process.argv.find((argument) => argument.startsWith("--runner-restoration-smoke="));
const runnerSmokePhase = runnerSmokeArgument?.slice("--runner-restoration-smoke=".length);
const browserEvidenceSmokeArgument = process.argv.find((argument) => argument.startsWith("--browser-evidence-smoke="));
const browserEvidenceSmokeUrl = browserEvidenceSmokeArgument?.slice("--browser-evidence-smoke=".length);
const visualSmokeArgument = process.argv.find((argument) => argument.startsWith("--visual-smoke-dir="));
const visualSmokeDirectory = visualSmokeArgument?.slice("--visual-smoke-dir=".length);
const isVisualSmoke = Boolean(visualSmokeDirectory);
const situationRoomMode = process.argv.includes("--situation-room");
const rendererRecoveryVisual = process.argv.includes("--renderer-recovery-visual");
const runnerSmokeScenario = process.env.CHROMUX_NEXT_FIXTURE_SCENARIO;
const runnerFixturePath = app.isPackaged
  ? path.join(process.resourcesPath, "subprocess-fixture.cjs")
  : path.join(app.getAppPath(), "fixtures", "subprocess-fixture.cjs");
const runnerSmokeOptions = (runnerSmokePhase || browserEvidenceSmokeUrl || (situationRoomMode && isVisualSmoke)) && runnerSmokeScenario ? {
  command: process.execPath,
  prefixArgs: [runnerFixturePath],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  requestTimeoutMs: 2_000,
  restartDelaysMs: [20, 40, 80],
  shutdownGraceMs: 250
} : undefined;
const runner = new RunnerManager(
  new CodexAppServer(runnerSmokeOptions),
  localStore,
  new LunaAnalyzer(path.join(app.getPath("userData"), "attention-analyzer"), runnerSmokeOptions),
  new LunaAnalyzer(path.join(app.getPath("userData"), "session-title-analyzer"), runnerSmokeOptions)
);
const updates = new UpdateService(localStore, runner, {
  currentVersion: app.getVersion(), userDataPath: app.getPath("userData"),
  isPackaged: app.isPackaged, executablePath: process.execPath
});
const codexUpdates = new CodexUpdateService(runner, (state) => updates.setCodexState(state));
const updateHelperPath = app.isPackaged
  ? path.join(process.resourcesPath, "update-helper.cjs")
  : path.join(app.getAppPath(), "scripts", "update-helper.cjs");
const detector = new ExternalTerminalDetector((rows) => runner.enrichDetection(rows));
const detectionLeases = new DetectionLeaseStore();
const running = new Map<string, AbortController>();
const isSmoke = process.argv.includes("--smoke") || Boolean(runnerSmokePhase) || Boolean(browserEvidenceSmokeUrl);
type VisualDetectionMode = "scanning" | "populated" | "empty" | "denied";
let visualDetectionMode: VisualDetectionMode = "scanning";
let resolveVisualDetection: ((value: ReturnType<typeof visualDetectionFixture>) => void) | undefined;
let mainWindow: BrowserWindow | null = null;
const browser = new BrowserViewService({
  getWindow: () => mainWindow
}, (snapshot) => {
  void evidenceWorkflow.recordNavigation(snapshot).then(sendBrowserState).catch(() => undefined);
});
const evidenceWorkflow = new BrowserEvidenceWorkflow(
  localStore,
  path.join(app.getPath("userData"), "browser-evidence")
);

function sendBrowserState(state: Awaited<ReturnType<BrowserEvidenceWorkflow["state"]>>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannels.browserStateChanged, state);
  }
}

function requireOpenSession(sessionId: string): void {
  if (!runner.getState().sessions.some((session) => session.id === sessionId && session.status !== "closed")) {
    throw new Error("The browser target session is unavailable");
  }
}

function visualDetectionFixture(mode: Exclude<VisualDetectionMode, "scanning">) {
  const rows = mode === "empty" ? [] : [
    {
      schemaVersion: 1 as const,
      targetId: "visual-codex",
      terminal: "Terminal" as const,
      agent: "codex" as const,
      pid: 1201,
      directory: "/Users/example/Projects/chromux-next-long-project-name",
      projectName: "chromux-next-long-project-name",
      ...(mode === "denied" ? {} : { title: "Codex · detect-first onboarding" }),
      command: "codex",
      externalActive: true,
      resumeAvailable: true,
      resumePreview: "I mapped the runner and onboarding boundaries. Ready to continue implementation.",
      threadUpdatedAt: "2026-08-06T12:00:00.000Z"
    },
    {
      schemaVersion: 1 as const,
      targetId: "visual-claude",
      terminal: "iTerm" as const,
      agent: "claude" as const,
      pid: 1202,
      directory: "/Users/example/Projects/design-system",
      projectName: "design-system",
      ...(mode === "denied" ? {} : { title: "Design system review" }),
      command: "claude",
      externalActive: true,
      resumeAvailable: false
    },
    {
      schemaVersion: 1 as const,
      targetId: "visual-shell",
      terminal: "Terminal" as const,
      agent: "shell" as const,
      pid: 1203,
      directory: "/Users/example/Projects/site",
      projectName: "site",
      ...(mode === "denied" ? {} : { title: "Local development" }),
      command: "zsh",
      externalActive: false,
      resumeAvailable: false
    }
  ];
  return {
    schemaVersion: 1 as const,
    scanId: `visual-${mode}`,
    scannedAt: "2026-08-06T12:00:00.000Z",
    titlePermission: mode === "denied" ? "denied" as const : "granted" as const,
    rows
  };
}

function visualDetectionTarget(targetId: string): EnrichedDetectionCandidate {
  const row = visualDetectionFixture("populated").rows.find((item) => item.targetId === targetId);
  if (!row) throw new Error("Detected terminal target is no longer available. Rescan to continue.");
  return {
    pid: row.pid,
    ppid: 1,
    tty: `visual-${row.pid}`,
    command: row.command,
    args: row.command,
    cwd: row.directory,
    terminal: row.terminal,
    agent: row.agent,
    ...(row.resumeAvailable ? { threadId: "visual-source-thread" } : {})
  };
}

function resizeBrowser(): void {
  browser.resize();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    title: "GBlockParty Chromux Next",
    show: Boolean(browserEvidenceSmokeUrl) || (!isSmoke && !isVisualSmoke),
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const rendererUrl = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (situationRoomMode) rendererUrl.searchParams.set("mode", "situation-room");
    if (rendererRecoveryVisual) rendererUrl.searchParams.set("renderer-recovery-visual", "1");
    void mainWindow.loadURL(rendererUrl.toString());
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      ...(situationRoomMode || rendererRecoveryVisual ? { query: {
        ...(situationRoomMode ? { mode: "situation-room" } : {}),
        ...(rendererRecoveryVisual ? { "renderer-recovery-visual": "1" } : {})
      } } : {})
    });
  }
  if (isSmoke) {
    mainWindow.webContents.once("did-finish-load", async () => {
      if (runnerSmokePhase || browserEvidenceSmokeUrl) return;
      const ready = await mainWindow?.webContents.executeJavaScript(
        "Boolean(window.chromuxNext?.documents && window.chromuxNext?.runner && window.chromuxNext?.attention && window.chromuxNext?.browser)"
      );
      const expectedSituationRoom = process.env.CHROMUX_NEXT_EXPECT_SITUATION_ROOM === "1";
      const renderedSituationRoom = expectedSituationRoom
        ? await mainWindow?.webContents.executeJavaScript("document.querySelector('.app-root')?.dataset.approach === 'situation-room'")
        : true;
      const expectedApproach = process.env.CHROMUX_NEXT_EXPECT_APPROACH;
      const restoredApproach = expectedApproach
        ? await mainWindow?.webContents.executeJavaScript("window.chromuxNext.settings.getUiPreferences().then((value) => value.approach)")
        : undefined;
      const passed = Boolean(ready) && Boolean(renderedSituationRoom) && (!expectedApproach || restoredApproach === expectedApproach);
      if (!passed) process.exitCode = 1;
      console.log(passed ? "Chromux Next smoke passed" : `Chromux Next smoke failed (approach: ${String(restoredApproach)})`);
      app.quit();
    });
  }
  if (runnerSmokePhase) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        if (runnerSmokePhase === "first") {
          const result = await mainWindow?.webContents.executeJavaScript(`(async () => {
            const deadline = Date.now() + 5000;
            while ((await window.chromuxNext.runner.models()).length === 0) {
              if (Date.now() >= deadline) throw new Error("Runner did not initialize");
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
            const first = await window.chromuxNext.runner.create({ projectPath: "/tmp", title: "First restored session" });
            const second = await window.chromuxNext.runner.create({ projectPath: "/tmp", title: "Second restored session" });
            await window.chromuxNext.runner.saveDraft(first.id, "first draft");
            await window.chromuxNext.runner.saveDraft(second.id, "second draft");
            await window.chromuxNext.runner.select(first.groupId, first.id);
            return { first, second, state: await window.chromuxNext.runner.state() };
          })()`);
          if (!result?.first?.threadId || !result?.second?.threadId
            || result.first.threadId === result.second.threadId
            || result.state.selectedSessionId !== result.first.id) {
            throw new Error("First launch did not create distinct persisted sessions");
          }
        } else {
          const result = await mainWindow?.webContents.executeJavaScript(`(async () => {
            const deadline = Date.now() + 5000;
            let state;
            do {
              const models = await window.chromuxNext.runner.models();
              state = await window.chromuxNext.runner.state();
              if (models.length > 0 && state.sessions.length === 2
                && state.sessions.every((item) => item.status === "idle")) break;
              await new Promise((resolve) => setTimeout(resolve, 25));
            } while (Date.now() < deadline);
            return state;
          })()`);
          const drafts = result?.sessions?.map((item: any) => item.draft).sort();
          const threadIds = result?.sessions?.map((item: any) => item.threadId);
          if (result?.sessions?.length !== 2
            || new Set(threadIds).size !== 2
            || JSON.stringify(drafts) !== JSON.stringify(["first draft", "second draft"])
            || result.selectedSessionId !== result.sessions.find((item: any) => item.title === "First restored session")?.id
            || result.groups?.[0]?.sessionIds?.length !== 2
            || result.sessions.some((item: any) => item.status !== "idle")) {
            throw new Error(`Second launch restoration mismatch: ${JSON.stringify(result)}`);
          }
        }
        console.log(`Chromux Next runner restoration smoke ${runnerSmokePhase} passed`);
      } catch (error) {
        process.exitCode = 1;
        console.error("Chromux Next runner restoration smoke failed:", error instanceof Error ? error.message : String(error));
      } finally {
        app.quit();
      }
    });
  }
  if (browserEvidenceSmokeUrl) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        const result = await mainWindow?.webContents.executeJavaScript(`(async () => {
          const deadline = Date.now() + 5000;
          while ((await window.chromuxNext.runner.models()).length === 0) {
            if (Date.now() >= deadline) throw new Error("Runner did not initialize");
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          const first = await window.chromuxNext.runner.create({ projectPath: "/tmp", title: "Browser one" });
          const second = await window.chromuxNext.runner.create({ projectPath: "/tmp", title: "Browser two" });
          await window.chromuxNext.browser.present(first.id, { x: 20, y: 100, width: 640, height: 480 });
          await window.chromuxNext.browser.open(first.id, ${JSON.stringify(`${browserEvidenceSmokeUrl}/one`)});
          await window.chromuxNext.browser.open(second.id, ${JSON.stringify(`${browserEvidenceSmokeUrl}/two`)});
          await window.chromuxNext.browser.present(first.id, { x: 20, y: 100, width: 640, height: 480 });
          await new Promise((resolve) => setTimeout(resolve, 150));
          const captured = await window.chromuxNext.browser.capture(first.id, "Verify real packaged capture");
          const evidence = captured.evidence.at(-1);
          if (!evidence || evidence.status !== "awaiting-review") throw new Error("Capture did not enter review");
          const preview = await window.chromuxNext.browser.preview(evidence.id);
          await window.chromuxNext.browser.review(evidence.id, "approve", "Packaged review approved");
          const delivered = await window.chromuxNext.browser.deliver(evidence.id);
          return {
            preview: preview.dataUrl.startsWith("data:image/png;base64,"),
            status: delivered.evidence.find((item) => item.id === evidence.id)?.status,
            urls: delivered.sessions.map((item) => item.url).sort()
          };
        })()`);
        if (!result?.preview || result.status !== "delivered"
          || result.urls?.length !== 2
          || !result.urls[0]?.endsWith("/one") || !result.urls[1]?.endsWith("/two")) {
          throw new Error(`Browser evidence result mismatch: ${JSON.stringify(result)}`);
        }
        console.log("Chromux Next packaged browser evidence smoke passed");
      } catch (error) {
        process.exitCode = 1;
        console.error("Chromux Next packaged browser evidence smoke failed:", error instanceof Error ? error.message : String(error));
      } finally {
        app.quit();
      }
    });
  }
  if (visualSmokeDirectory) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        const visualWindow = mainWindow;
        if (!visualWindow || visualWindow.isDestroyed()) throw new Error("Visual window is unavailable");
        await mkdir(visualSmokeDirectory, { recursive: true });
        let captureCount = 0;
        const capture = async (name: string, width = 1440, height = 900) => {
          visualWindow.setContentSize(width, height);
          await new Promise((resolve) => setTimeout(resolve, 140));
          const image = await visualWindow.webContents.capturePage();
          if (!image || image.isEmpty()) throw new Error(`Empty capture for ${name}`);
          await writeFile(path.join(visualSmokeDirectory, `${name}.png`), image.toPNG());
          captureCount += 1;
        };
        if (rendererRecoveryVisual) {
          const recoveryDeadline = Date.now() + 5_000;
          while (!await visualWindow.webContents.executeJavaScript("Boolean(document.querySelector('.renderer-recovery'))")) {
            if (Date.now() >= recoveryDeadline) throw new Error("Renderer recovery screen was not visible");
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await capture("renderer-recovery-standard");
          await capture("renderer-recovery-narrow", 760, 600);
          if (captureCount !== 2) throw new Error(`Expected 2 renderer recovery captures, received ${captureCount}`);
          console.log(`Renderer recovery visual qualification captured ${captureCount} views`);
          return;
        }
        if (situationRoomMode) {
          const roomDeadline = Date.now() + 5_000;
          while (!await visualWindow.webContents.executeJavaScript("Boolean(document.querySelector('.situation-room-shell'))")) {
            if (Date.now() >= roomDeadline) throw new Error("Situation Room shell was not visible");
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          await capture("situation-approval-standard");
          await visualWindow.webContents.executeJavaScript("document.querySelector('.event-dossier summary')?.click()");
          await capture("situation-approval-long-narrow", 820, 720);
          await visualWindow.webContents.executeJavaScript("[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Later')?.click()");
          await new Promise((resolve) => setTimeout(resolve, 100));
          await capture("situation-question-standard", 1440, 900);
          await capture("situation-question-narrow", 820, 720);
          await visualWindow.webContents.executeJavaScript("[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Later')?.click()");
          await new Promise((resolve) => setTimeout(resolve, 100));
          await capture("situation-deferred-queue", 1440, 900);
          const reducedPreferences = await localStore.updateUiPreferences({ motion: "reduced" });
          visualWindow.webContents.send(IpcChannels.settingsUiPreferencesChanged, reducedPreferences);
          await capture("situation-reduced-motion", 1440, 900);
          await visualWindow.webContents.executeJavaScript(`(() => {
            const approval = [...document.querySelectorAll('.decision-queue-list button')].find((item) => item.textContent?.includes('Approve package verification'));
            if (!approval) throw new Error('Deferred approval was not found');
            approval.click();
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          await visualWindow.webContents.executeJavaScript(`(() => {
            const accept = [...document.querySelectorAll('.decision-card')].find((item) => item.textContent?.includes('Authorize once'));
            if (!accept) throw new Error('Authorize once was not found');
            accept.click();
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 150));
          await visualWindow.webContents.executeJavaScript(`(() => {
            const question = [...document.querySelectorAll('.decision-queue-list button')].find((item) => item.textContent?.includes('Choose release posture'));
            if (!question) throw new Error('Deferred question was not found');
            question.click();
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 100));
          await visualWindow.webContents.executeJavaScript(`(() => {
            document.querySelectorAll('.event-questions fieldset').forEach((fieldset) => fieldset.querySelector('input[type="radio"]')?.click());
            const submit = [...document.querySelectorAll('.decision-card')].find((item) => item.textContent?.includes('Submit answers'));
            if (!submit) throw new Error('Submit answers was not found');
            submit.click();
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 180));
          await capture("situation-empty-queue", 1440, 900);
          await capture("situation-empty-queue-narrow", 820, 720);
          if (captureCount !== 8) throw new Error(`Expected 8 Situation Room captures, received ${captureCount}`);
          console.log(`Chromux Next Situation Room visual qualification captured ${captureCount} views`);
          return;
        }
        const onboardingDeadline = Date.now() + 5_000;
        let onboardingVisible = false;
        while (!onboardingVisible && Date.now() < onboardingDeadline) {
          onboardingVisible = Boolean(await visualWindow.webContents.executeJavaScript(
            "Boolean(document.querySelector('.onboarding-modal'))"
          ));
          if (!onboardingVisible) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (!onboardingVisible) throw new Error("Successor onboarding was not visible");
        await capture("detect-scanning-standard");
        await capture("detect-scanning-narrow", 820, 720);
        visualDetectionMode = "populated";
        resolveVisualDetection?.(visualDetectionFixture("populated"));
        resolveVisualDetection = undefined;
        await new Promise((resolve) => setTimeout(resolve, 100));
        await capture("detect-populated-standard");
        await capture("detect-populated-narrow", 820, 720);
        visualDetectionMode = "empty";
        await visualWindow.webContents.executeJavaScript(
          "[...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Rescan'))?.click()"
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        await capture("detect-empty-standard");
        visualDetectionMode = "denied";
        await visualWindow.webContents.executeJavaScript(
          "[...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Rescan'))?.click()"
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        await capture("detect-denied-standard");
        visualDetectionMode = "populated";
        await visualWindow.webContents.executeJavaScript(
          "[...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Rescan'))?.click()"
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        await visualWindow.webContents.executeJavaScript(
          "[...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Continue'))?.click()"
        );
        await capture("detect-config-standard");
        await capture("detect-config-narrow", 820, 720);
        const visualProjectAt = new Date().toISOString();
        await localStore.addProject({
          schemaVersion: 1,
          id: "visual-project",
          name: "chromux-next-long-project-name",
          path: "/Users/example/Projects/chromux-next-long-project-name",
          kind: "worktree",
          addedAt: visualProjectAt,
          lastUsedAt: visualProjectAt
        });
        const workspacePreferences = await localStore.updateWorkspacePreferences({
          onboardingComplete: true,
          defaultProjectId: "visual-project",
          defaultPermissionPreset: "workspace"
        });
        visualWindow.webContents.send(IpcChannels.settingsWorkspacePreferencesChanged, workspacePreferences);
        await visualWindow.webContents.executeJavaScript(`(() => {
          const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('New Session'));
          if (!button) throw new Error("New Session button was not found");
          button.click();
        })()`);
        await capture("new-session-standard");
        await capture("new-session-narrow", 820, 720);
        await visualWindow.webContents.executeJavaScript(
          "document.querySelector('[aria-label=\"Close New session\"]')?.click()"
        );
        await visualWindow.webContents.executeJavaScript(`(() => {
          const button = document.querySelector('[aria-label="Open Settings"]');
          if (!button) throw new Error("Settings button was not found");
          button.click();
        })()`);
        await capture("settings-projects-standard");
        await capture("settings-projects-narrow", 820, 720);
        for (const section of ["groups", "appearance"]) {
          await visualWindow.webContents.executeJavaScript(`(() => {
            const button = [...document.querySelectorAll('.settings-tabs button')]
              .find((item) => item.textContent?.trim() === '${section}');
            if (!button) throw new Error("${section} settings tab was not found");
            button.click();
          })()`);
          await capture(`settings-${section}-standard`);
        }
        await visualWindow.webContents.executeJavaScript(`(() => {
          const button = [...document.querySelectorAll('.settings-tabs button')]
            .find((item) => item.textContent === 'updates');
          if (!button) throw new Error("Updates settings tab was not found");
          button.click();
        })()`);
        await capture("settings-updates-standard");
        await capture("settings-updates-narrow", 820, 720);
        const diagnosticsDeadline = Date.now() + 3_000;
        while (Date.now() < diagnosticsDeadline) {
          const diagnostics = runner.getCompatibilityDiagnostics(app.getVersion(), `${process.platform} ${process.arch}`);
          if (diagnostics.checks.find((check) => check.id === "app-server")?.status === "pass") break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await visualWindow.webContents.executeJavaScript(`(() => {
          const button = [...document.querySelectorAll('.settings-tabs button')]
            .find((item) => item.textContent === 'diagnostics');
          if (!button) throw new Error("Diagnostics tab was not found");
          button.click();
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await capture("settings-diagnostics-standard");
        await capture("settings-diagnostics-narrow", 820, 720);
        await visualWindow.webContents.executeJavaScript(
          "document.querySelector('[aria-label=\"Close Settings\"]')?.click()"
        );
        await visualWindow.webContents.executeJavaScript(`(() => {
          const button = [...document.querySelectorAll('.surface-tabs button')]
            .find((item) => item.textContent?.trim().toLowerCase() === 'browser');
          if (!button) throw new Error('Browser surface control was not found');
          button.click();
        })()`);
        await capture("session-browser-standard");
        await capture("session-browser-narrow", 820, 720);
        const approaches = ["control-room", "ide-workbench", "focus-studio", "mission-board", "spatial-canvas"] as const;
        const sizes = [{ name: "standard", width: 1440, height: 900 }, { name: "narrow", width: 820, height: 720 }];
        for (const approach of approaches) {
          const preferences = await localStore.updateUiPreferences({ approach });
          mainWindow?.webContents.send(IpcChannels.settingsUiPreferencesChanged, preferences);
          await mainWindow?.webContents.executeJavaScript(`(() => {
            const button = [...document.querySelectorAll('.surface-tabs button')].find((item) => item.textContent?.trim().toLowerCase() === 'alignment');
            if (!button) throw new Error('Alignment surface control was not found');
            button.click();
          })()`);
          for (const size of sizes) {
            mainWindow?.setContentSize(size.width, size.height);
            await new Promise((resolve) => setTimeout(resolve, 180));
            const actual = await mainWindow?.webContents.executeJavaScript("document.querySelector('.app-root')?.dataset.approach");
            if (actual !== approach) throw new Error(`Expected ${approach}, rendered ${String(actual)}`);
            const geometry = await mainWindow?.webContents.executeJavaScript(`(() => {
              const rect = (selector) => {
                const element = document.querySelector(selector);
                if (!element) return null;
                const value = element.getBoundingClientRect();
                return { left: value.left, right: value.right, width: value.width };
              };
              return {
                viewport: innerWidth,
                alignment: rect('.surface-pane.active .alignment-workspace'),
                toolbar: rect('.surface-pane.active .alignment-toolbar')
              };
            })()`);
            if (!geometry?.alignment || !geometry?.toolbar
              || geometry.alignment.left < 0 || geometry.alignment.right > geometry.viewport + 1
              || geometry.toolbar.left < 0 || geometry.toolbar.right > geometry.viewport + 1) {
              throw new Error(`Alignment workspace clipped for ${approach} ${size.name}: ${JSON.stringify(geometry)}`);
            }
            await capture(`${approach}-${size.name}`, size.width, size.height);
          }
        }
        if (captureCount !== 30) throw new Error(`Expected 30 visual captures, received ${captureCount}`);
        console.log(`Chromux Next visual qualification captured ${captureCount} views`);
      } catch (error) {
        process.exitCode = 1;
        console.error("Chromux Next visual qualification failed:", error instanceof Error ? error.message : String(error));
      } finally {
        app.quit();
      }
    });
  }
  mainWindow.on("resize", resizeBrowser);
  mainWindow.on("closed", () => {
    browser.close();
    mainWindow = null;
  });
}

function registerIpc(): void {
  const registry = new IpcHandlerRegistry(ipcMain);
  registry.handle(IpcChannels.documentOpen, async () => {
    const result = await dialog.showOpenDialog({
      title: "Open alignment document",
      properties: ["openFile"],
      filters: [{ name: "Alignment documents", extensions: ["json"] }]
    });
    const filePath = result.filePaths[0];
    return result.canceled || !filePath ? null : { filePath, document: await documents.read(filePath) };
  });
  registry.handle(IpcChannels.documentRead, async (_event, input: unknown) => {
    const filePath = DocumentPathSchema.parse(input);
    return { filePath, document: await documents.read(filePath) };
  });
  registry.handle(IpcChannels.documentSave, async (_event, input: unknown) => {
    const payload = SavePayloadSchema.parse(input);
    await documents.write(payload.filePath, payload.document);
    return payload;
  });
  registry.handle(IpcChannels.documentSaveAs, async (_event, input: unknown) => {
    const document = AlignmentDocumentV1Schema.parse(input);
    const result = await dialog.showSaveDialog({
      title: "Save alignment document",
      defaultPath: `${document.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`,
      filters: [{ name: "Alignment documents", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return null;
    await documents.write(result.filePath, document);
    return { filePath: result.filePath, document };
  });
  registry.handle(IpcChannels.mutationApply, async (_event, input: unknown) => {
    const payload = MutationPayloadSchema.parse(input);
    const applied = await documents.apply(payload.filePath, payload.batch);
    return { filePath: payload.filePath, document: applied.document, inverseBatch: applied.inverseBatch };
  });
  registry.handle(IpcChannels.agentRun, async (ipcEvent, input: unknown) => {
    const request = AgentRunRequestSchema.parse(input);
    if (running.has(request.id)) throw new Error(`Run already exists: ${request.id}`);
    const controller = new AbortController();
    running.set(request.id, controller);
    const provider: AgentProvider = request.provider === "codex" ? new CodexProvider() : new FakeProvider();
    try {
      return await provider.run(
        request,
        (agentEvent) => ipcEvent.sender.send(IpcChannels.agentEvent, agentEvent),
        controller.signal
      );
    } finally {
      running.delete(request.id);
    }
  });
  registry.handle(IpcChannels.agentCancel, (_event, input: unknown) => {
    if (typeof input !== "string") return false;
    const controller = running.get(input);
    controller?.abort();
    return Boolean(controller);
  });
  registry.handle(IpcChannels.browserOpen, async (_event, input: unknown) => {
    const value = BrowserOpenInputSchema.parse(input);
    requireOpenSession(value.sessionId);
    return browser.open(value.sessionId, value.url);
  });
  registry.handle(IpcChannels.browserAction, async (_event, input: unknown) => {
    const action = BrowserActionInputSchema.parse(input);
    requireOpenSession(action.sessionId);
    return browser.action(action.sessionId, action.type);
  });
  registry.handle(IpcChannels.browserState, () => evidenceWorkflow.state());
  registry.handle(IpcChannels.browserPresent, (_event, input: unknown) => {
    const presentation = BrowserPresentationInputSchema.parse(input);
    if (presentation.sessionId) requireOpenSession(presentation.sessionId);
    browser.present(presentation.sessionId, presentation.bounds);
  });
  registry.handle(IpcChannels.browserCapture, async (_event, input: unknown) => {
    const value = EvidenceCaptureInputSchema.parse(input);
    requireOpenSession(value.sessionId);
    const capture = await browser.captureEvidence(value.sessionId);
    const result = await evidenceWorkflow.capture(capture.snapshot, value.note, capture.png);
    sendBrowserState(result.state);
    return result.state;
  });
  registry.handle(IpcChannels.browserReview, async (_event, input: unknown) => {
    const value = EvidenceReviewInputSchema.parse(input);
    const state = await evidenceWorkflow.review(value.evidenceId, value.decision, value.note);
    sendBrowserState(state);
    return state;
  });
  registry.handle(IpcChannels.browserPreview, (_event, input: unknown) => {
    const value = EvidenceIdInputSchema.parse(input);
    return evidenceWorkflow.preview(value.evidenceId);
  });
  registry.handle(IpcChannels.browserDeliver, async (_event, input: unknown) => {
    const value = EvidenceIdInputSchema.parse(input);
    const state = await evidenceWorkflow.deliver(value.evidenceId, async (sessionId, prompt) => {
      requireOpenSession(sessionId);
      await runner.startOrSteer({ sessionId, text: prompt });
    });
    sendBrowserState(state);
    return state;
  });
  registry.handle(IpcChannels.runnerState, () => runner.getState());
  registry.handle(IpcChannels.runnerModels, () => runner.getModels());
  registry.handle(IpcChannels.runnerCreate, (_event, input: unknown) =>
    runner.createSession(CreateSessionInputSchema.parse(input)));
  registry.handle(IpcChannels.runnerDetectExternal, () => {
    if (!isVisualSmoke) return detector.scan();
    if (visualDetectionMode === "scanning") {
      return new Promise((resolve) => { resolveVisualDetection = resolve; });
    }
    return visualDetectionFixture(visualDetectionMode);
  });
  registry.handle(IpcChannels.runnerAcquireDetectionLease, (_event, input: unknown) => {
    const value = AcquireDetectionLeaseInputSchema.parse(input);
    const target = isVisualSmoke
      ? visualDetectionTarget(value.targetId)
      : detector.resolve(value.scanId, value.targetId);
    return detectionLeases.acquire(target);
  });
  registry.handle(IpcChannels.runnerRenewDetectionLease, (_event, input: unknown) => {
    const value = DetectionLeaseIdInputSchema.parse(input);
    return detectionLeases.renew(value.leaseId);
  });
  registry.handle(IpcChannels.runnerReleaseDetectionLease, (_event, input: unknown) => {
    const value = DetectionLeaseIdInputSchema.parse(input);
    detectionLeases.release(value.leaseId);
  });
  registry.handle(IpcChannels.runnerCreateFromDetection, async (_event, input: unknown) => {
    const value = CreateFromDetectionInputSchema.parse(input);
    const target = detectionLeases.resolve(value.leaseId);
    if (value.mode === "continue" && !target.threadId) {
      throw new Error("The selected terminal has no resumable exact-directory Codex thread.");
    }
    const created = await runner.createDetectedSession({
      cwd: target.cwd,
      ...(value.mode === "continue" && target.threadId ? { threadId: target.threadId } : {}),
      mode: value.mode,
      ...(value.title ? { title: value.title } : {}),
      permissionPreset: value.permissionPreset,
      ...(value.model ? { model: value.model } : {}),
      ...(value.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {})
    });
    if (created.workspacePreferences) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(IpcChannels.settingsWorkspacePreferencesChanged, created.workspacePreferences);
        }
      }
    }
    detectionLeases.consume(value.leaseId);
    return created.session;
  });
  registry.handle(IpcChannels.runnerClose, async (_event, input: unknown) => {
    if (typeof input !== "string") throw new Error("Invalid session id");
    await runner.closeSession(input);
    browser.closeSession(input);
  });
  registry.handle(IpcChannels.runnerSend, (_event, input: unknown) =>
    runner.startOrSteer(TurnInputSchema.parse(input)));
  registry.handle(IpcChannels.runnerInterrupt, (_event, input: unknown) => {
    if (typeof input !== "string") throw new Error("Invalid session id");
    return runner.interrupt(input);
  });
  registry.handle(IpcChannels.runnerDraft, (_event, input: unknown) =>
    runner.saveDraft(DraftInputSchema.parse(input)));
  registry.handle(IpcChannels.runnerRespond, (_event, input: unknown) =>
    runner.respond(ApprovalResponseInputSchema.parse(input)));
  registry.handle(IpcChannels.runnerGroup, (_event, input: unknown) =>
    runner.mutateGroup(GroupMutationInputSchema.parse(input)));
  registry.handle(IpcChannels.runnerSelect, (_event, input: unknown) => {
    const payload = input as { groupId?: unknown; sessionId?: unknown };
    if (typeof payload?.groupId !== "string" || typeof payload?.sessionId !== "string") {
      throw new Error("Invalid selection");
    }
    return runner.select(payload.groupId, payload.sessionId);
  });
  registry.handle(IpcChannels.attentionRefresh, () => runner.refreshAttention());
  registry.handle(IpcChannels.attentionTriage, (_event, input: unknown) =>
    runner.triage(TriageInputSchema.parse(input)));
  registry.handle(IpcChannels.settingsGetUiPreferences, () => localStore.getUiPreferences());
  registry.handle(IpcChannels.settingsUpdateUiPreferences, async (_event, input: unknown) => {
    const preferences = await localStore.updateUiPreferences(UiPreferencesPatchV1Schema.parse(input));
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannels.settingsUiPreferencesChanged, preferences);
    }
    return preferences;
  });
  const broadcastWorkspacePreferences = (preferences: Awaited<ReturnType<LocalStore["getWorkspacePreferences"]>>) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannels.settingsWorkspacePreferencesChanged, preferences);
      }
    }
  };
  registry.handle(IpcChannels.settingsGetWorkspacePreferences, () => localStore.getWorkspacePreferences());
  registry.handle(IpcChannels.settingsUpdateWorkspacePreferences, async (_event, input: unknown) => {
    const preferences = await localStore.updateWorkspacePreferences(
      WorkspacePreferencesPatchV1Schema.parse(input)
    );
    broadcastWorkspacePreferences(preferences);
    return preferences;
  });
  registry.handle(IpcChannels.settingsChooseProject, async () => {
    const result = await dialog.showOpenDialog({
      title: "Add a project or worktree",
      buttonLabel: "Add to Chromux Next",
      properties: ["openDirectory", "createDirectory"]
    });
    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) return null;
    const canonicalPath = await realpath(selectedPath);
    let kind: "project" | "worktree" = "project";
    try {
      if ((await stat(path.join(canonicalPath, ".git"))).isFile()) kind = "worktree";
    } catch {
      // Non-Git folders remain valid projects.
    }
    const now = new Date().toISOString();
    const preferences = await localStore.addProject({
      schemaVersion: 1,
      id: randomUUID(),
      name: path.basename(canonicalPath) || canonicalPath,
      path: canonicalPath,
      kind,
      addedAt: now,
      lastUsedAt: now
    });
    broadcastWorkspacePreferences(preferences);
    return preferences;
  });
  registry.handle(IpcChannels.settingsRemoveProject, async (_event, input: unknown) => {
    if (typeof input !== "string") throw new Error("Invalid project id");
    const preferences = await localStore.removeProject(input);
    broadcastWorkspacePreferences(preferences);
    return preferences;
  });
  registry.handle(IpcChannels.settingsCompatibilityDiagnostics, () =>
    runner.getCompatibilityDiagnostics(app.getVersion(), `${process.platform} ${process.arch}`));
  registry.handle(IpcChannels.updateState, () => updates.getState());
  registry.handle(IpcChannels.updateCheck, async (_event, input: unknown) => {
    const { target } = UpdateCheckActionSchema.parse(input);
    if (target === "all" || target === "app") await updates.checkApp(true);
    if (target === "all" || target === "codex") await codexUpdates.check();
    return updates.getState();
  });
  registry.handle(IpcChannels.updatePrepareApp, async (_event, input: unknown) => {
    UpdateActionSchema.parse(input);
    const state = updates.getState();
    const messageOptions = {
      type: "question", buttons: ["Download and verify", "Cancel"], defaultId: 1, cancelId: 1,
      title: "Prepare Chromux Next update?", message: `Download Chromux Next ${state.app.latestVersion ?? "update"}?`,
      detail: "The package will be downloaded into Chromux Next user data and independently checked for size, checksum, bundle identity, Developer ID signature, Team ID, architecture, and Gatekeeper acceptance. It will not be installed automatically."
    } satisfies MessageBoxOptions;
    const confirmation = mainWindow ? await dialog.showMessageBox(mainWindow, messageOptions) : await dialog.showMessageBox(messageOptions);
    return confirmation.response === 0 ? updates.prepare() : updates.getState();
  });
  registry.handle(IpcChannels.updateCancelApp, (_event, input: unknown) => {
    UpdateActionSchema.parse(input); return updates.cancel();
  });
  registry.handle(IpcChannels.updateInstallApp, async (_event, input: unknown) => {
    UpdateActionSchema.parse(input);
    const state = updates.getState();
    const messageOptions = {
      type: "warning", buttons: ["Install and restart", "Cancel"], defaultId: 1, cancelId: 1,
      title: "Install verified Chromux Next update?",
      message: `Install Chromux Next ${state.app.latestVersion ?? "update"} now?`,
      detail: "Chromux Next will persist idle sessions and drafts, stop its Codex app-server, replace this signed app bundle, then relaunch. Active turns and unanswered interactions block installation."
    } satisfies MessageBoxOptions;
    const confirmation = mainWindow ? await dialog.showMessageBox(mainWindow, messageOptions) : await dialog.showMessageBox(messageOptions);
    if (confirmation.response !== 0) return updates.getState();
    const result = await updates.confirmInstall(updateHelperPath);
    if (result.launched) setImmediate(() => app.quit());
    return updates.getState();
  });
  registry.handle(IpcChannels.updateInstallCodex, async (_event, input: unknown) => {
    UpdateActionSchema.parse(input);
    const state = updates.getState();
    const messageOptions = {
      type: "warning", buttons: ["Update Codex", "Cancel"], defaultId: 1, cancelId: 1,
      title: "Update Codex CLI?", message: `Update Codex to ${state.codex.latestVersion ?? "the available version"}?`,
      detail: "Chromux Next will persist idle sessions and drafts, stop its app-server, run the Codex updater, verify the new version, and restore sessions."
    } satisfies MessageBoxOptions;
    const confirmation = mainWindow ? await dialog.showMessageBox(mainWindow, messageOptions) : await dialog.showMessageBox(messageOptions);
    if (confirmation.response === 0) await codexUpdates.install();
    return updates.getState();
  });
  registry.handle(IpcChannels.updateOpenReleaseNotes, async (_event, input: unknown) => {
    const { target } = UpdateReleaseNotesActionSchema.parse(input);
    const url = updates.getState()[target].releaseUrl;
    if (!url) return false;
    const parsed = new URL(url);
    const allowed = target === "app"
      ? parsed.origin === "https://github.com" && /^\/GeorgeQLe\/gblockparty-chromux\/releases\/tag\/chromux-next-v\d+\.\d+\.\d+$/.test(parsed.pathname)
      : parsed.origin === "https://github.com" && /^\/openai\/codex\/releases\/(?:latest|tag\/rust-v\d+\.\d+\.\d+)$/.test(parsed.pathname);
    if (!allowed || parsed.search || parsed.hash) return false;
    await shell.openExternal(url); return true;
  });
  registry.assertComplete();
  runner.on("state", (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannels.runnerStateChanged, state);
    }
    void updates.refreshBlockers();
  });
  updates.on("state", (state) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(IpcChannels.updateStateChanged, state);
  });
}

app.whenReady().then(async () => {
  registerIpc();
  await runner.initialize().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!isSmoke || !/is stopping|app-server stopped/.test(message)) {
      console.error("Runner initialization failed:", message);
    }
  });
  await updates.initialize();
  // Do not let the renderer snapshot empty runner state while model discovery
  // and persisted-session restoration are still in flight.
  createWindow();
  await writeFile(path.join(app.getPath("userData"), "update-startup-success-v1"), new Date().toISOString(), { mode: 0o600 }).catch(() => undefined);
  void updates.checkApp(false).then(() => codexUpdates.check()).catch(() => undefined);
  setInterval(() => void updates.checkApp(false).then(() => codexUpdates.check()), 24 * 60 * 60 * 1000).unref();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let quitReady = false;
let quitPromise: Promise<void> | undefined;
app.on("before-quit", (event) => {
  if (quitReady) return;
  event.preventDefault();
  quitPromise ??= runner.shutdown()
    .catch((error) => {
      process.exitCode = 1;
      console.error("Runner shutdown failed:", error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      quitReady = true;
      app.quit();
    });
});
