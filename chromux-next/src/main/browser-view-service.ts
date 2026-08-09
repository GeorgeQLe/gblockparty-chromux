import { createHash } from "node:crypto";
import { clipboard, shell, WebContentsView, type BrowserWindow, type Rectangle } from "electron";
import { isSafeNavigation } from "../domain/links";

export type BrowserViewAction = "back" | "forward" | "reload" | "copy-link" | "open-external";

export interface BrowserViewSnapshot {
  sessionId: string;
  url: string;
  title: string;
}

export interface BrowserViewHost {
  getWindow(): BrowserWindow | null;
}

export interface BrowserViewDependencies {
  createView(sessionId: string): WebContentsView;
  copyText(value: string): void;
  openExternal(url: string): Promise<void>;
}

const electronDependencies: BrowserViewDependencies = {
  createView: (sessionId) => new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: `persist:chromux-next-${createHash("sha256").update(sessionId).digest("hex").slice(0, 24)}`
    }
  }),
  copyText: (value) => clipboard.writeText(value),
  openExternal: (url) => shell.openExternal(url).then(() => undefined)
};

interface OwnedView {
  view: WebContentsView;
  url: string;
  title: string;
}

/** Owns isolated, session-scoped guests; callers never receive WebContents. */
export class BrowserViewService {
  private readonly views = new Map<string, OwnedView>();
  private visibleSessionId: string | undefined;
  private visibleBounds: Rectangle | undefined;

  constructor(
    private readonly host: BrowserViewHost,
    private readonly changed: (snapshot: BrowserViewSnapshot) => void = () => undefined,
    private readonly dependencies: BrowserViewDependencies = electronDependencies
  ) {}

  present(sessionId?: string, bounds?: Rectangle): void {
    this.visibleSessionId = sessionId;
    this.visibleBounds = bounds;
    for (const [id, owned] of this.views) {
      const visible = id === sessionId && Boolean(bounds);
      owned.view.setVisible(visible);
      if (visible && bounds) owned.view.setBounds(this.clamp(bounds));
    }
  }

  resize(): void {
    if (this.visibleSessionId && this.visibleBounds) {
      this.present(this.visibleSessionId, this.visibleBounds);
    }
  }

  async open(sessionId: string, url: string): Promise<boolean> {
    if (!isSafeNavigation(url)) return false;
    const owned = this.ensureView(sessionId);
    owned.url = url;
    await owned.view.webContents.loadURL(url);
    this.emit(sessionId, owned);
    return true;
  }

  snapshot(sessionId: string): BrowserViewSnapshot | undefined {
    const owned = this.views.get(sessionId);
    return owned ? { sessionId, url: owned.url, title: owned.title } : undefined;
  }

  async action(sessionId: string, type: BrowserViewAction): Promise<boolean> {
    const owned = this.views.get(sessionId);
    if (!owned) return false;
    const contents = owned.view.webContents;
    if (type === "back" && contents.canGoBack()) contents.goBack();
    if (type === "forward" && contents.canGoForward()) contents.goForward();
    if (type === "reload") contents.reload();
    if (type === "copy-link") this.dependencies.copyText(owned.url);
    if (type === "open-external" && isSafeNavigation(owned.url)) {
      await this.dependencies.openExternal(owned.url);
    }
    return true;
  }

  async captureEvidence(sessionId: string): Promise<{ png: Buffer; snapshot: BrowserViewSnapshot }> {
    const owned = this.views.get(sessionId);
    if (!owned) throw new Error("The selected session has no open browser page");
    const contents = owned.view.webContents;
    const before = { url: contents.getURL(), title: contents.getTitle().slice(0, 500) };
    if (!isSafeNavigation(before.url)) throw new Error("The current browser page is not safe to capture");
    const image = await contents.capturePage();
    if (image.isEmpty()) throw new Error("The current browser page could not be captured");
    const after = { url: contents.getURL(), title: contents.getTitle().slice(0, 500) };
    if (before.url !== after.url || before.title !== after.title) {
      throw new Error("The browser page changed during capture; review the page and try again");
    }
    owned.url = after.url;
    owned.title = after.title;
    return { png: image.toPNG(), snapshot: { sessionId, ...after } };
  }

  closeSession(sessionId: string): void {
    const owned = this.views.get(sessionId);
    if (!owned) return;
    const window = this.host.getWindow();
    if (window && !window.isDestroyed()) window.contentView.removeChildView(owned.view);
    owned.view.webContents.close();
    this.views.delete(sessionId);
    if (this.visibleSessionId === sessionId) this.present();
  }

  close(): void {
    for (const sessionId of [...this.views.keys()]) this.closeSession(sessionId);
  }

  private clamp(bounds: Rectangle): Rectangle {
    const window = this.host.getWindow();
    if (!window) return bounds;
    const [windowWidth = 1, windowHeight = 1] = window.getContentSize();
    const x = Math.min(bounds.x, Math.max(0, windowWidth - 1));
    const y = Math.min(bounds.y, Math.max(0, windowHeight - 1));
    return {
      x,
      y,
      width: Math.max(1, Math.min(bounds.width, windowWidth - x)),
      height: Math.max(1, Math.min(bounds.height, windowHeight - y))
    };
  }

  private ensureView(sessionId: string): OwnedView {
    const existing = this.views.get(sessionId);
    if (existing) return existing;
    const window = this.host.getWindow();
    if (!window) throw new Error("Main window is unavailable");
    const view = this.dependencies.createView(sessionId);
    const owned: OwnedView = { view, url: "", title: "" };
    view.setVisible(false);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event, url) => {
      if (!isSafeNavigation(url)) event.preventDefault();
    });
    view.webContents.on("did-navigate", (_event, url) => {
      owned.url = url;
      owned.title = view.webContents.getTitle().slice(0, 500);
      this.emit(sessionId, owned);
    });
    view.webContents.on("page-title-updated", (_event, title) => {
      owned.title = title.slice(0, 500);
      this.emit(sessionId, owned);
    });
    window.contentView.addChildView(view);
    this.views.set(sessionId, owned);
    if (this.visibleSessionId === sessionId && this.visibleBounds) {
      view.setVisible(true);
      view.setBounds(this.clamp(this.visibleBounds));
    }
    return owned;
  }

  private emit(sessionId: string, owned: OwnedView): void {
    if (owned.url && isSafeNavigation(owned.url)) {
      this.changed({ sessionId, url: owned.url, title: owned.title });
    }
  }
}
