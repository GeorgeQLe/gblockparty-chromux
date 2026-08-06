import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  WebContentsView
} from "electron";
import started from "electron-squirrel-startup";
import { isSafeNavigation } from "./domain/links";
import {
  AgentRunRequestSchema,
  AlignmentDocumentV1Schema,
  BrowserActionSchema,
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
  ,UiPreferencesPatchV1Schema
  ,WorkspacePreferencesPatchV1Schema
} from "./ipc/contracts";
import { DocumentStore } from "./persistence/document-store";
import { CodexProvider } from "./providers/codex-provider";
import { FakeProvider } from "./providers/fake-provider";
import type { AgentProvider } from "./providers/provider";
import { LocalStore } from "./persistence/local-store";
import { CodexAppServer } from "./runner/protocol";
import { LunaAnalyzer } from "./runner/attention";
import { RunnerManager } from "./runner/manager";

if (started) app.quit();

app.setName("GBlockParty Chromux Next");
app.setPath("userData", process.env.CHROMUX_NEXT_SMOKE_USER_DATA
  ? path.resolve(process.env.CHROMUX_NEXT_SMOKE_USER_DATA)
  : path.join(app.getPath("appData"), "GBlockParty Chromux Next"));

const documents = new DocumentStore();
const localStore = new LocalStore(app.getPath("userData"));
const runnerSmokeArgument = process.argv.find((argument) => argument.startsWith("--runner-restoration-smoke="));
const runnerSmokePhase = runnerSmokeArgument?.slice("--runner-restoration-smoke=".length);
const runnerSmokeScenario = process.env.CHROMUX_NEXT_FIXTURE_SCENARIO;
const runnerFixturePath = app.isPackaged
  ? path.join(process.resourcesPath, "subprocess-fixture.cjs")
  : path.join(app.getAppPath(), "fixtures", "subprocess-fixture.cjs");
const runnerSmokeOptions = runnerSmokePhase && runnerSmokeScenario ? {
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
  new LunaAnalyzer(path.join(app.getPath("userData"), "attention-analyzer"), runnerSmokeOptions)
);
const running = new Map<string, AbortController>();
const isSmoke = process.argv.includes("--smoke") || Boolean(runnerSmokePhase);
const visualSmokeArgument = process.argv.find((argument) => argument.startsWith("--visual-smoke-dir="));
const visualSmokeDirectory = visualSmokeArgument?.slice("--visual-smoke-dir=".length);
const isVisualSmoke = Boolean(visualSmokeDirectory);
let mainWindow: BrowserWindow | null = null;
let browserView: WebContentsView | null = null;
let browserUrl = "";

function resizeBrowser(): void {
  if (!mainWindow || !browserView) return;
  const [width = 1440, height = 900] = mainWindow.getContentSize();
  browserView.setBounds({ x: 250, y: 104, width: Math.max(400, width - 570), height: Math.max(300, height - 104) });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    title: "GBlockParty Chromux Next",
    show: !isSmoke && !isVisualSmoke,
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
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  if (isSmoke) {
    mainWindow.webContents.once("did-finish-load", async () => {
      if (runnerSmokePhase) return;
      const ready = await mainWindow?.webContents.executeJavaScript(
        "Boolean(window.chromuxNext?.documents && window.chromuxNext?.runner && window.chromuxNext?.attention && window.chromuxNext?.browser)"
      );
      const expectedApproach = process.env.CHROMUX_NEXT_EXPECT_APPROACH;
      const restoredApproach = expectedApproach
        ? await mainWindow?.webContents.executeJavaScript("window.chromuxNext.settings.getUiPreferences().then((value) => value.approach)")
        : undefined;
      const passed = Boolean(ready) && (!expectedApproach || restoredApproach === expectedApproach);
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
  if (visualSmokeDirectory) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        const visualWindow = mainWindow;
        if (!visualWindow || visualWindow.isDestroyed()) throw new Error("Visual window is unavailable");
        await mkdir(visualSmokeDirectory, { recursive: true });
        await new Promise((resolve) => setTimeout(resolve, 180));
        const onboardingVisible = await visualWindow.webContents.executeJavaScript(
          "Boolean(document.querySelector('.onboarding-modal'))"
        );
        if (!onboardingVisible) throw new Error("Successor onboarding was not visible");
        await writeFile(
          path.join(visualSmokeDirectory, "onboarding-standard.png"),
          (await visualWindow.webContents.capturePage()).toPNG()
        );
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
          const button = document.querySelector('[aria-label="Open Settings"]');
          if (!button) throw new Error("Settings button was not found");
          button.click();
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await writeFile(
          path.join(visualSmokeDirectory, "settings-projects-standard.png"),
          (await visualWindow.webContents.capturePage()).toPNG()
        );
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
        await writeFile(
          path.join(visualSmokeDirectory, "settings-diagnostics-standard.png"),
          (await visualWindow.webContents.capturePage()).toPNG()
        );
        await visualWindow.webContents.executeJavaScript(
          "document.querySelector('[aria-label=\"Close Settings\"]')?.click()"
        );
        const approaches = ["control-room", "ide-workbench", "focus-studio", "mission-board", "spatial-canvas"] as const;
        const sizes = [{ name: "standard", width: 1440, height: 900 }, { name: "narrow", width: 820, height: 720 }];
        for (const approach of approaches) {
          const preferences = await localStore.updateUiPreferences({ approach });
          mainWindow?.webContents.send(IpcChannels.settingsUiPreferencesChanged, preferences);
          await mainWindow?.webContents.executeJavaScript(`(() => {
            const button = [...document.querySelectorAll('.surface-tabs button')].find((item) => item.textContent === 'alignment');
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
            const image = await mainWindow?.webContents.capturePage();
            if (!image || image.isEmpty()) throw new Error(`Empty capture for ${approach} ${size.name}`);
            await writeFile(path.join(visualSmokeDirectory, `${approach}-${size.name}.png`), image.toPNG());
          }
        }
        console.log(`Chromux Next visual qualification captured ${approaches.length * sizes.length + 3} views`);
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
    browserView?.webContents.close();
    browserView = null;
    mainWindow = null;
  });
}

function ensureBrowserView(): WebContentsView {
  if (!mainWindow) throw new Error("Main window is unavailable");
  if (browserView) return browserView;
  browserView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  browserView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  browserView.webContents.on("will-navigate", (event, url) => {
    if (!isSafeNavigation(url)) event.preventDefault();
  });
  browserView.webContents.on("did-navigate", (_event, url) => {
    browserUrl = url;
  });
  mainWindow.contentView.addChildView(browserView);
  resizeBrowser();
  return browserView;
}

function registerIpc(): void {
  ipcMain.handle(IpcChannels.documentOpen, async () => {
    const result = await dialog.showOpenDialog({
      title: "Open alignment document",
      properties: ["openFile"],
      filters: [{ name: "Alignment documents", extensions: ["json"] }]
    });
    const filePath = result.filePaths[0];
    return result.canceled || !filePath ? null : { filePath, document: await documents.read(filePath) };
  });
  ipcMain.handle(IpcChannels.documentRead, async (_event, input: unknown) => {
    const filePath = DocumentPathSchema.parse(input);
    return { filePath, document: await documents.read(filePath) };
  });
  ipcMain.handle(IpcChannels.documentSave, async (_event, input: unknown) => {
    const payload = SavePayloadSchema.parse(input);
    await documents.write(payload.filePath, payload.document);
    return payload;
  });
  ipcMain.handle(IpcChannels.documentSaveAs, async (_event, input: unknown) => {
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
  ipcMain.handle(IpcChannels.mutationApply, async (_event, input: unknown) => {
    const payload = MutationPayloadSchema.parse(input);
    const applied = await documents.apply(payload.filePath, payload.batch);
    return { filePath: payload.filePath, document: applied.document, inverseBatch: applied.inverseBatch };
  });
  ipcMain.handle(IpcChannels.agentRun, async (ipcEvent, input: unknown) => {
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
  ipcMain.handle(IpcChannels.agentCancel, (_event, input: unknown) => {
    if (typeof input !== "string") return false;
    const controller = running.get(input);
    controller?.abort();
    return Boolean(controller);
  });
  ipcMain.handle(IpcChannels.browserOpen, async (_event, input: unknown) => {
    if (typeof input !== "string" || !isSafeNavigation(input)) return false;
    browserUrl = input;
    await ensureBrowserView().webContents.loadURL(input);
    return true;
  });
  ipcMain.handle(IpcChannels.browserAction, async (_event, input: unknown) => {
    const action = BrowserActionSchema.parse(input);
    if (!browserView) return false;
    if (action.type === "back" && browserView.webContents.canGoBack()) browserView.webContents.goBack();
    if (action.type === "forward" && browserView.webContents.canGoForward()) browserView.webContents.goForward();
    if (action.type === "reload") browserView.webContents.reload();
    if (action.type === "copy-link") clipboard.writeText(browserUrl);
    if (action.type === "open-external" && isSafeNavigation(browserUrl)) await shell.openExternal(browserUrl);
    if (action.type === "close" && mainWindow) {
      mainWindow.contentView.removeChildView(browserView);
      browserView.webContents.close();
      browserView = null;
      browserUrl = "";
    }
    return true;
  });
  ipcMain.handle(IpcChannels.runnerState, () => runner.getState());
  ipcMain.handle(IpcChannels.runnerModels, () => runner.getModels());
  ipcMain.handle(IpcChannels.runnerCreate, (_event, input: unknown) =>
    runner.createSession(CreateSessionInputSchema.parse(input)));
  ipcMain.handle(IpcChannels.runnerClose, (_event, input: unknown) => {
    if (typeof input !== "string") throw new Error("Invalid session id");
    return runner.closeSession(input);
  });
  ipcMain.handle(IpcChannels.runnerSend, (_event, input: unknown) =>
    runner.startOrSteer(TurnInputSchema.parse(input)));
  ipcMain.handle(IpcChannels.runnerInterrupt, (_event, input: unknown) => {
    if (typeof input !== "string") throw new Error("Invalid session id");
    return runner.interrupt(input);
  });
  ipcMain.handle(IpcChannels.runnerDraft, (_event, input: unknown) =>
    runner.saveDraft(DraftInputSchema.parse(input)));
  ipcMain.handle(IpcChannels.runnerRespond, (_event, input: unknown) =>
    runner.respond(ApprovalResponseInputSchema.parse(input)));
  ipcMain.handle(IpcChannels.runnerGroup, (_event, input: unknown) =>
    runner.mutateGroup(GroupMutationInputSchema.parse(input)));
  ipcMain.handle(IpcChannels.runnerSelect, (_event, input: unknown) => {
    const payload = input as { groupId?: unknown; sessionId?: unknown };
    if (typeof payload?.groupId !== "string" || typeof payload?.sessionId !== "string") {
      throw new Error("Invalid selection");
    }
    runner.select(payload.groupId, payload.sessionId);
  });
  ipcMain.handle(IpcChannels.attentionRefresh, () => runner.refreshAttention());
  ipcMain.handle(IpcChannels.attentionTriage, (_event, input: unknown) =>
    runner.triage(TriageInputSchema.parse(input)));
  ipcMain.handle(IpcChannels.settingsGetUiPreferences, () => localStore.getUiPreferences());
  ipcMain.handle(IpcChannels.settingsUpdateUiPreferences, async (_event, input: unknown) => {
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
  ipcMain.handle(IpcChannels.settingsGetWorkspacePreferences, () => localStore.getWorkspacePreferences());
  ipcMain.handle(IpcChannels.settingsUpdateWorkspacePreferences, async (_event, input: unknown) => {
    const preferences = await localStore.updateWorkspacePreferences(
      WorkspacePreferencesPatchV1Schema.parse(input)
    );
    broadcastWorkspacePreferences(preferences);
    return preferences;
  });
  ipcMain.handle(IpcChannels.settingsChooseProject, async () => {
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
  ipcMain.handle(IpcChannels.settingsRemoveProject, async (_event, input: unknown) => {
    if (typeof input !== "string") throw new Error("Invalid project id");
    const preferences = await localStore.removeProject(input);
    broadcastWorkspacePreferences(preferences);
    return preferences;
  });
  ipcMain.handle(IpcChannels.settingsCompatibilityDiagnostics, () =>
    runner.getCompatibilityDiagnostics(app.getVersion(), `${process.platform} ${process.arch}`));
  runner.on("state", (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannels.runnerStateChanged, state);
    }
  });
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  await runner.initialize().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!isSmoke || !/is stopping|app-server stopped/.test(message)) {
      console.error("Runner initialization failed:", message);
    }
  });
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
