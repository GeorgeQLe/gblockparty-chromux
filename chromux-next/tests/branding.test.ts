import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Chromux Next branding", () => {
  it("uses the upward-chevron mark in both package and renderer assets", async () => {
    const [packageIcon, rendererMark] = await Promise.all([
      readFile("build/icon.svg", "utf8"),
      readFile("public/mark.svg", "utf8")
    ]);
    for (const asset of [packageIcon, rendererMark]) {
      expect(asset).toContain('aria-label="Chromux Next"');
      expect(asset).toContain("M18 39 L32 17 L46 39");
      expect(asset).not.toContain("M25 18 L47 32 L25 46");
    }
  });

  it("keeps the successor identity and icon in Forge metadata", async () => {
    const config = await readFile("forge.config.ts", "utf8");
    expect(config).toContain('appBundleId: "dev.georgele.chromux.next"');
    expect(config).toContain('icon: "build/icon"');
  });
});
