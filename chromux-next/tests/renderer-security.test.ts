import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runner renderer security", () => {
  it("keeps the DOM transcript inert and routes all input through the composer", async () => {
    const [source, transcript, fleet] = await Promise.all([
      readFile("src/renderer.tsx", "utf8"),
      readFile("src/renderer/transcript.tsx", "utf8"),
      readFile("src/control-plane/ui.tsx", "utf8")
    ]);
    expect(transcript).not.toContain("dangerouslySetInnerHTML");
    expect(transcript).not.toContain("<img");
    expect(transcript).not.toMatch(/fetch\s*\(/);
    expect(transcript).not.toContain("window.open");
    expect(transcript).toContain("openBrowser(block.url)");
    expect(source).not.toContain("disableStdin");
    expect(source).not.toContain(".onData(");
    expect(fleet).toContain("instance.onData");
    expect(source).toContain("window.chromuxNext.runner.send");
    expect(source).toContain('event.metaKey || event.ctrlKey');
  });

  it("keeps blockers non-dismissible and secondary surfaces independent", async () => {
    const [source, surfaces] = await Promise.all([
      readFile("src/renderer.tsx", "utf8"),
      readFile("src/renderer/persistent-surfaces.tsx", "utf8")
    ]);
    expect(source).toContain("cannot dismiss");
    expect(surfaces).toContain('type CenterSurface = "runner" | "alignment" | "deck" | "canvas" | "browser"');
  });

  it("keeps settings narrow and runtime validated across the preload boundary", async () => {
    const preload = await readFile("src/preload.ts", "utf8");
    const bridge = await readFile("src/ipc/bridge.ts", "utf8");
    expect(preload).toContain("UiPreferencesPatchV1Schema.parse");
    expect(preload).toContain("UiPreferencesV1Schema.parse");
    expect(bridge).not.toContain("css:");
    expect(bridge).not.toContain("filesystem");
  });

  it("does not expose detected cwd or thread ownership in create IPC", async () => {
    const [preload, bridge, contracts] = await Promise.all([
      readFile("src/preload.ts", "utf8"),
      readFile("src/ipc/bridge.ts", "utf8"),
      readFile("src/detection/contracts.ts", "utf8")
    ]);
    expect(preload).toContain("detectExternal");
    expect(preload).toContain("AcquireDetectionLeaseInputSchema.parse");
    expect(preload).toContain("DetectionLeaseIdInputSchema.parse");
    expect(preload).toContain("CreateFromDetectionInputSchema.parse");
    expect(bridge).toContain("CreateFromDetectionInput");
    const createSchema = contracts.slice(
      contracts.indexOf("CreateFromDetectionInputSchema"),
      contracts.indexOf("export type CreateFromDetectionInput")
    );
    expect(createSchema).not.toContain("cwd:");
    expect(createSchema).not.toContain("threadId:");
    expect(createSchema).not.toContain("scanId:");
    expect(createSchema).not.toContain("targetId:");
    expect(createSchema).toContain("leaseId: Id");
  });
});
