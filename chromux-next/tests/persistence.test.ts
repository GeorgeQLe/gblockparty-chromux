import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sampleDocument } from "../src/fixtures/sample-document";
import { DocumentStore } from "../src/persistence/document-store";
import { mutationBatch } from "../src/alignment/editor-model";

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

  it("rereads the canonical file for every authoritative mutation", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-authoritative-"));
    const filePath = path.join(directory, "alignment.json");
    const store = new DocumentStore();
    await store.write(filePath, sampleDocument);
    const first = await store.apply(filePath, mutationBatch(sampleDocument, "Review", [{
      type: "status.set",
      status: "in-review"
    }]));
    expect(first.document.revision).toBe(1);
    expect(first.inverseBatch.baseRevision).toBe(1);
    await expect(store.apply(filePath, mutationBatch(sampleDocument, "Stale", [{
      type: "status.set",
      status: "approved"
    }]))).rejects.toThrow("Stale revision");
    expect((await store.read(filePath)).status).toBe("in-review");
  });

  it("serializes concurrent mutations so the same base revision cannot overwrite", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-serialized-"));
    const filePath = path.join(directory, "alignment.json");
    const store = new DocumentStore();
    await store.write(filePath, sampleDocument);
    const first = store.apply(filePath, mutationBatch(sampleDocument, "First", [{
      type: "status.set", status: "in-review"
    }]));
    const second = store.apply(filePath, mutationBatch(sampleDocument, "Second", [{
      type: "status.set", status: "approved"
    }]));
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await store.read(filePath)).revision).toBe(1);
  });

  it("rejects malformed files, wrong document IDs, and external changes without overwriting", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-conflict-"));
    const filePath = path.join(directory, "alignment.json");
    const store = new DocumentStore();
    await writeFile(filePath, "{bad json", "utf8");
    await expect(store.apply(filePath, mutationBatch(sampleDocument, "Nope", [{
      type: "status.set", status: "approved"
    }]))).rejects.toThrow();
    await store.write(filePath, { ...sampleDocument, revision: 4 });
    await expect(store.apply(filePath, {
      ...mutationBatch(sampleDocument, "Wrong document", [{ type: "status.set", status: "approved" }]),
      documentId: "another-document",
      baseRevision: 4
    })).rejects.toThrow("different document");
    await expect(store.apply(filePath, mutationBatch(sampleDocument, "External conflict", [{
      type: "status.set", status: "approved"
    }]))).rejects.toThrow("Stale revision");
    expect((await store.read(filePath)).revision).toBe(4);
  });
});
