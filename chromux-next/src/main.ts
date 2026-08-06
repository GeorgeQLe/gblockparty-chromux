import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
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
import { applyMutationBatch } from "./domain/mutations";
import { isSafeNavigation } from "./domain/links";
import {
  AgentRunRequestSchema,
  AlignmentDocumentV1Schema,
  BrowserActionSchema,
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  GroupMutationInputSchema,
  IpcChannels,
  MutationPayloadSchema,
  SavePayloadSchema,
  TriageInputSchema,
  TurnInputSchema
  ,UiPreferencesPatchV1Schema
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
const runner = new RunnerManager(
  new CodexAppServer(),
  localStore,
  new LunaAnalyzer(path.join(app.getPath("userData"), "attention-analyzer"))
);
const running = new Map<string, AbortController>();
const isSmoke = process.argv.includes("--smoke");
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
  if (visualSmokeDirectory) {
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        await mkdir(visualSmokeDirectory, { recursive: true });
        const approaches = ["control-room", "ide-workbench", "focus-studio", "mission-board", "spatial-canvas"] as const;
        const sizes = [{ name: "standard", width: 1440, height: 900 }, { name: "narrow", width: 820, height: 720 }];
        for (const approach of approaches) {
          const preferences = await localStore.updateUiPreferences({ approach });
          mainWindow?.webContents.send(IpcChannels.settingsUiPreferencesChanged, preferences);
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
              return { viewport: innerWidth, composer: rect('.composer-row'), actions: rect('.composer-actions') };
            })()`);
            if (geometry?.actions && (geometry.actions.left < 0 || geometry.actions.right > geometry.viewport + 1)) {
              throw new Error(`Composer actions clipped for ${approach} ${size.name}: ${JSON.stringify(geometry)}`);
            }
            const image = await mainWindow?.webContents.capturePage();
            if (!image || image.isEmpty()) throw new Error(`Empty capture for ${approach} ${size.name}`);
            await writeFile(path.join(visualSmokeDirectory, `${approach}-${size.name}.png`), image.toPNG());
          }
        }
        console.log(`Chromux Next visual qualification captured ${approaches.length * sizes.length} views`);
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
    const applied = applyMutationBatch(payload.document, payload.batch);
    await documents.write(payload.filePath, applied.document);
    return { filePath: payload.filePath, document: applied.document };
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
    console.error("Runner initialization failed:", error instanceof Error ? error.message : String(error));
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void runner.shutdown();
});
