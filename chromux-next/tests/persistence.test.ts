import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sampleDocument } from "../src/fixtures/sample-document";
import { DocumentStore } from "../src/persistence/document-store";

describe("document persistence", () => {
  it("round-trips validated workspace JSON using an atomic replacement", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-test-"));
    const filePath = path.join(directory, "alignment.json");
    const store = new DocumentStore();
    await store.write(filePath, sampleDocument);
    expect(await store.read(filePath)).toEqual(sampleDocument);
    expect((await readFile(filePath, "utf8")).endsWith("\n")).toBe(true);
  });

  it("rejects non-JSON and relative paths", async () => {
    const store = new DocumentStore();
    await expect(store.write("relative.json", sampleDocument)).rejects.toThrow("absolute");
    await expect(store.write("/tmp/alignment.html", sampleDocument)).rejects.toThrow(".json");
  });
});
