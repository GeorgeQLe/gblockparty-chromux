import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { BrowserViewService } from "../src/main/browser-view-service";

function fakeView() {
  const events = new EventEmitter();
  const contents = Object.assign(events, {
    loadURL: vi.fn(async (url: string) => { events.emit("did-navigate", {}, url); }),
    setWindowOpenHandler: vi.fn(),
    getTitle: vi.fn(() => "Fixture page"),
    getURL: vi.fn(() => "https://two.example.test"),
    canGoBack: vi.fn(() => true),
    canGoForward: vi.fn(() => false),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    capturePage: vi.fn(async () => ({ isEmpty: () => false, toPNG: () => Buffer.from("png") })),
    close: vi.fn()
  });
  return {
    webContents: contents,
    setVisible: vi.fn(),
    setBounds: vi.fn()
  };
}

describe("session browser view ownership", () => {
  it("isolates guests by session and exposes only bounded service actions", async () => {
    const views = [fakeView(), fakeView()];
    const added: unknown[] = [];
    const snapshots: unknown[] = [];
    const service = new BrowserViewService({
      getWindow: () => ({
        getContentSize: () => [1000, 700],
        isDestroyed: () => false,
        contentView: { addChildView: (view: unknown) => added.push(view), removeChildView: vi.fn() }
      } as never)
    }, (snapshot) => snapshots.push(snapshot), {
      createView: vi.fn(() => views.shift() as never),
      copyText: vi.fn(),
      openExternal: vi.fn(async () => undefined)
    });

    expect(await service.open("session-one", "javascript:alert(1)")).toBe(false);
    expect(added).toHaveLength(0);
    await service.open("session-one", "https://one.example.test");
    await service.open("session-two", "https://two.example.test");
    expect(added).toHaveLength(2);
    expect(service.snapshot("session-one")?.url).toBe("https://one.example.test");
    expect(service.snapshot("session-two")?.url).toBe("https://two.example.test");
    expect(snapshots).toContainEqual(expect.objectContaining({ sessionId: "session-one" }));

    service.present("session-two", { x: 900, y: 650, width: 500, height: 400 });
    const second = added[1] as ReturnType<typeof fakeView>;
    expect(second.setVisible).toHaveBeenLastCalledWith(true);
    expect(second.setBounds).toHaveBeenLastCalledWith({ x: 900, y: 650, width: 100, height: 50 });
    const popupHandler = second.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as () => { action: string };
    expect(popupHandler()).toEqual({ action: "deny" });
    expect(await service.captureEvidence("session-two")).toEqual({
      png: Buffer.from("png"),
      snapshot: { sessionId: "session-two", url: "https://two.example.test", title: "Fixture page" }
    });
  });

  it("rejects a capture when page provenance changes during capture", async () => {
    const view = fakeView();
    view.webContents.getURL
      .mockReturnValueOnce("https://example.test/before")
      .mockReturnValueOnce("https://example.test/after");
    const service = new BrowserViewService({
      getWindow: () => ({
        getContentSize: () => [1000, 700],
        isDestroyed: () => false,
        contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
      } as never)
    }, () => undefined, {
      createView: () => view as never,
      copyText: vi.fn(),
      openExternal: vi.fn(async () => undefined)
    });
    await service.open("session-one", "https://example.test/before");
    await expect(service.captureEvidence("session-one")).rejects.toThrow("changed during capture");
  });
});
