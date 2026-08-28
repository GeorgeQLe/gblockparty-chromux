import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStore } from "../src/persistence/local-store";

describe("project Alignment bindings", () => {
  it("persists independent project paths across restart", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-bindings-"));
    const store = new LocalStore(directory);
    await store.bindAlignmentDocument("/projects/one", "/docs/one.json");
    await store.bindAlignmentDocument("/projects/two", "/docs/two.json");
    const restored = new LocalStore(directory);
    expect(await restored.getAlignmentDocumentPath("/projects/one")).toBe("/docs/one.json");
    expect(await restored.getAlignmentDocumentPath("/projects/two")).toBe("/docs/two.json");
  });

  it("drops only malformed entries", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-bindings-recovery-"));
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "alignment-bindings-v1.json"), JSON.stringify({ schemaVersion: 1, bindings: { "/valid": "/doc.json", "/invalid": 42 } }));
    const state = await new LocalStore(directory).read();
    expect(state.alignmentBindings.bindings).toEqual({ "/valid": "/doc.json" });
  });
});
