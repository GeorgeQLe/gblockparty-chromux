import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runner renderer security", () => {
  it("keeps xterm display-only and routes text through the composer", async () => {
    const source = await readFile("src/renderer.tsx", "utf8");
    expect(source).toContain("disableStdin: true");
    expect(source).not.toContain(".onData(");
    expect(source).toContain("window.chromuxNext.runner.send");
    expect(source).toContain('event.metaKey || event.ctrlKey');
  });

  it("keeps blockers non-dismissible and secondary surfaces independent", async () => {
    const source = await readFile("src/renderer.tsx", "utf8");
    expect(source).toContain("cannot dismiss");
    expect(source).toContain('type CenterSurface = "runner" | "alignment" | "deck" | "canvas" | "browser"');
  });
});
