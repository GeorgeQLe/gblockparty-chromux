import path from "node:path";
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
  IpcChannels,
  MutationPayloadSchema,
  SavePayloadSchema
} from "./ipc/contracts";
import { DocumentStore } from "./persistence/document-store";
import { CodexProvider } from "./providers/codex-provider";
import { FakeProvider } from "./providers/fake-provider";
import type { AgentProvider } from "./providers/provider";

if (started) app.quit();

app.setName("GBlockParty Chromux Next");
app.setPath("userData", path.join(app.getPath("appData"), "GBlockParty Chromux Next"));

const documents = new DocumentStore();
const running = new Map<string, AbortController>();
const isSmoke = process.argv.includes("--smoke");
let mainWindow: BrowserWindow | null = null;
let browserView: WebContentsView | null = null;
let browserUrl = "";

function resizeBrowser(): void {
  if (!mainWindow || !browserView) return;
  const [width = 1440, height = 900] = mainWindow.getContentSize();
  browserView.setBounds({ x: 300, y: 52, width: Math.max(400, width - 300), height: Math.max(300, height - 52) });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    title: "GBlockParty Chromux Next",
    show: !isSmoke,
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
        "Boolean(window.chromuxNext?.documents && window.chromuxNext?.agents && window.chromuxNext?.browser)"
      );
      if (!ready) process.exitCode = 1;
      console.log(ready ? "Chromux Next smoke passed" : "Chromux Next preload bridge missing");
      app.quit();
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
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
