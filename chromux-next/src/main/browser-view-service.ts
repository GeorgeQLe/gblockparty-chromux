import { clipboard, shell, WebContentsView, type BrowserWindow, type Rectangle } from "electron";
import { isSafeNavigation } from "../domain/links";

export type BrowserViewAction =
  | "back"
  | "forward"
  | "reload"
  | "close"
  | "copy-link"
  | "open-external";

export interface BrowserViewHost {
  getWindow(): BrowserWindow | null;
  getBounds(window: BrowserWindow): Rectangle;
}

export interface BrowserViewDependencies {
  createView(): WebContentsView;
  copyText(value: string): void;
  openExternal(url: string): Promise<void>;
}

const electronDependencies: BrowserViewDependencies = {
  createView: () => new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }),
  copyText: (value) => clipboard.writeText(value),
  openExternal: (url) => shell.openExternal(url).then(() => undefined)
};

/** Owns the guest browser lifecycle; callers never receive the view itself. */
export class BrowserViewService {
  private view: WebContentsView | null = null;
  private currentUrl = "";

  constructor(
    private readonly host: BrowserViewHost,
    private readonly dependencies: BrowserViewDependencies = electronDependencies
  ) {}

  resize(): void {
    const window = this.host.getWindow();
    if (!window || !this.view) return;
    this.view.setBounds(this.host.getBounds(window));
  }

  async open(url: string): Promise<boolean> {
    if (!isSafeNavigation(url)) return false;
    this.currentUrl = url;
    await this.ensureView().webContents.loadURL(url);
    return true;
  }

  async action(type: BrowserViewAction): Promise<boolean> {
    const view = this.view;
    if (!view) return false;
    if (type === "back" && view.webContents.canGoBack()) view.webContents.goBack();
    if (type === "forward" && view.webContents.canGoForward()) view.webContents.goForward();
    if (type === "reload") view.webContents.reload();
    if (type === "copy-link") this.dependencies.copyText(this.currentUrl);
    if (type === "open-external" && isSafeNavigation(this.currentUrl)) {
      await this.dependencies.openExternal(this.currentUrl);
    }
    if (type === "close") this.close();
    return true;
  }

  close(): void {
    const view = this.view;
    if (!view) return;
    const window = this.host.getWindow();
    if (window && !window.isDestroyed()) window.contentView.removeChildView(view);
    view.webContents.close();
    this.view = null;
    this.currentUrl = "";
  }

  private ensureView(): WebContentsView {
    const window = this.host.getWindow();
    if (!window) throw new Error("Main window is unavailable");
    if (this.view) return this.view;
    const view = this.dependencies.createView();
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event, url) => {
      if (!isSafeNavigation(url)) event.preventDefault();
    });
    view.webContents.on("did-navigate", (_event, url) => {
      this.currentUrl = url;
    });
    window.contentView.addChildView(view);
    this.view = view;
    this.resize();
    return view;
  }
}
