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
    expect(source).toContain('key="persistent-workspace"');
    expect(source).toContain("surface-pane runner-pane");
    expect(source).not.toContain('surface === "runner" && <Composer');
  });

  it("restores the complete structured Alignment workspace and authoritative IPC", async () => {
    const renderer = await readFile("src/renderer.tsx", "utf8");
    const preload = await readFile("src/preload.ts", "utf8");
    const main = await readFile("src/main.ts", "utf8");
    for (const feature of [
      "AlignmentSurface", "KindEditor", "ContributorPanel", "applyProposal",
      "humanReview", "item.insert", "item.remove", "item.move", "status.set"
    ]) expect(renderer).toContain(feature);
    expect(preload).toContain("async apply(filePath, batch)");
    expect(preload).not.toContain("async apply(filePath, document, batch)");
    expect(main).toContain("documents.apply(payload.filePath, payload.batch)");
    expect(main).not.toContain("applyMutationBatch(payload.document");
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
