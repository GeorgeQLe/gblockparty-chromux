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
      "Workspace", "NewSessionDialog", "DetectionDialog", "GroupDialog", "SurfaceTabs"
    ]) expect(source).toContain(`function ${primitive}`);
  });

  it("splits semantic tokens, reusable components, and layout rules", async () => {
    const [tokens, components, layouts, primitives] = await Promise.all([
      readFile("src/styles/tokens.css", "utf8"),
      readFile("src/styles/components.css", "utf8"),
      readFile("src/styles/layouts.css", "utf8"),
      readFile("src/ui/components.tsx", "utf8")
    ]);
    for (const token of ["--graphite-950", "--sage-500", "--space-2", "--control-height", "--success", "--warning", "--danger"]) {
      expect(tokens).toContain(token);
    }
    for (const primitive of ["Button", "IconButton", "Tabs", "Field", "Badge", "EmptyState", "Dialog", "Toolbar", "Panel"]) {
      expect(primitives).toContain(`function ${primitive}`);
    }
    expect(components).toContain(":focus-visible");
    expect(tokens).toContain(".density-compact");
    expect(layouts).toContain("@media (max-width: 700px)");
  });

  it("uses one product header and internal icons without prompt or glyph controls", async () => {
    const [renderer, primitives, packageJson] = await Promise.all([
      readFile("src/renderer.tsx", "utf8"),
      readFile("src/ui/components.tsx", "utf8"),
      readFile("package.json", "utf8")
    ]);
    expect(renderer).toContain("<SurfaceTabs surface={surface} setSurface={setSurface}");
    expect(renderer).toContain('icon={Settings}');
    expect(renderer).toContain('icon={Plus}');
    expect(renderer).not.toContain("window.prompt");
    expect(renderer).not.toMatch(/[×⚙＋↑↓]/u);
    expect(primitives).toContain('title={props.title ?? label}');
    expect(packageJson).toContain('"lucide-react"');
  });

  it("provides focus-contained dialogs with escape handling and restoration", async () => {
    const primitives = await readFile("src/ui/components.tsx", "utf8");
    expect(primitives).toContain('aria-modal="true"');
    expect(primitives).toContain('event.key === "Escape"');
    expect(primitives).toContain('event.key !== "Tab"');
    expect(primitives).toContain("returnFocus.current?.focus()");
    expect(primitives).toContain("initialFocus?.current");
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
    const [source, surfaces] = await Promise.all([
      readFile("src/renderer.tsx", "utf8"),
      readFile("src/renderer/persistent-surfaces.tsx", "utf8")
    ]);
    expect(source).toContain('new Event("chromux:flush-drafts")');
    expect(source).toContain("terminalViewports.set");
    expect(source).toContain("scrollToLine(viewport)");
    expect(source).toContain('key="persistent-workspace"');
    expect(surfaces).toContain("surface-pane runner-pane");
    expect(surfaces).toContain("Keeps every workspace mounted");
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
    const primitives = await readFile("src/ui/components.tsx", "utf8");
    expect(source).toContain('aria-label="Session mission board"');
    expect(source).toContain('role="treeitem"');
    expect(`${source}\n${primitives}`).toContain('aria-modal="true"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.metaKey || event.ctrlKey');
  });

  it("provides successor-native onboarding, managed settings, and folder selection", async () => {
    const renderer = await readFile("src/renderer.tsx", "utf8");
    const main = await readFile("src/main.ts", "utf8");
    const store = await readFile("src/persistence/local-store.ts", "utf8");
    for (const feature of [
      "DetectionDialog", "Find your work", "Continue Without Session", "Projects and worktrees", "New session defaults",
      "Session groups", "Compatibility diagnostics", "chooseProject"
    ]) expect(renderer).toContain(feature);
    expect(main).toContain('properties: ["openDirectory", "createDirectory"]');
    expect(main).toContain("getCompatibilityDiagnostics");
    expect(store).toContain("workspacePreferences");
    expect(store).not.toContain("prototype");
  });

  it("makes DETECT first-run and permanently available without controlling external terminals", async () => {
    const [renderer, preload, main] = await Promise.all([
      readFile("src/renderer.tsx", "utf8"),
      readFile("src/preload.ts", "utf8"),
      readFile("src/main.ts", "utf8")
    ]);
    expect(renderer).toContain("Scanning open terminal tabs");
    expect(renderer).toContain("Focus Existing");
    expect(renderer).toContain(".then(complete)");
    expect(renderer).toContain("setResult(undefined)");
    expect(renderer).toContain(">Continue</Button>");
    expect(renderer).toContain("Create continuation");
    expect(renderer).toContain("copies safely stored history into a separate thread");
    expect(renderer).toContain("does not share an in-progress partial turn");
    expect(renderer).toContain("the two threads may diverge");
    expect(renderer).toContain("Scanning open terminal tabs");
    expect(renderer).toContain('title="Detection failed"');
    expect(renderer).toContain(">Try again</Button>");
    expect(renderer).toContain(">Start Fresh</Button>");
    expect(renderer).toContain("<strong>{row.projectName}</strong>");
    expect(renderer).toContain("<strong>{selected.projectName}</strong>");
    expect(renderer).not.toContain("<strong>{row.title || row.command}</strong>");
    expect(renderer).toContain(">Detect</Button>");
    expect(preload).toContain("CreateFromDetectionInputSchema.parse");
    expect(main).toContain("detector.resolve(value.scanId, value.targetId)");
    expect(main).toContain('value.mode === "resume" && target.threadId');
    expect(main).not.toContain("input.cwd");
    expect(main).not.toContain("input.threadId");
  });
});
