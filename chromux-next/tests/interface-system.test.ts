import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("five-approach shared interface system", () => {
  it("provides five structural shells over shared workflow primitives", async () => {
    const source = await readFile("src/renderer.tsx", "utf8");
    for (const shell of [
      "ControlRoomShell", "IdeWorkbenchShell", "FocusStudioShell",
      "MissionBoardShell", "SpatialCanvasShell"
    ]) expect(source).toContain(`function ${shell}`);
    for (const primitive of [
      "RunnerTerminal", "Composer", "InteractionCard", "AttentionSidebar",
      "Workspace", "NewSessionDialog", "SurfaceTabs"
    ]) expect(source).toContain(`function ${primitive}`);
  });

  it("keeps workflow actions and every surface in shared components", async () => {
    const source = await readFile("src/renderer.tsx", "utf8");
    for (const action of ["runner.create", "runner.select", "runner.mutateGroup", "runner.close", "runner.send", "runner.interrupt", "runner.respond", "attention.triage"]) {
      expect(source).toContain(action);
    }
    for (const surface of ["runner", "alignment", "deck", "canvas", "browser"]) {
      expect(source).toContain(`"${surface}"`);
    }
  });

  it("flushes drafts and preserves transcript viewport before live switching", async () => {
    const source = await readFile("src/renderer.tsx", "utf8");
    expect(source).toContain('new Event("chromux:flush-drafts")');
    expect(source).toContain("terminalViewports.set");
    expect(source).toContain("scrollToLine(viewport)");
  });

  it("exposes accessible board/tree equivalents and modal keyboard containment", async () => {
    const source = await readFile("src/renderer.tsx", "utf8");
    expect(source).toContain('aria-label="Session mission board"');
    expect(source).toContain('role="treeitem"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.metaKey || event.ctrlKey');
  });
});
