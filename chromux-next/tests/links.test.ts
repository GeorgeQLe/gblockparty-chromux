import { describe, expect, it } from "vitest";
import { extractSafeLinks, isSafeNavigation } from "../src/domain/links";

describe("safe links", () => {
  it("extracts only explicit HTTP(S) links and deduplicates them", () => {
    expect(extractSafeLinks(
      "See https://example.com/a and http://localhost:4173. Ignore file:///etc/passwd and javascript:alert(1). https://example.com/a"
    )).toEqual(["https://example.com/a", "http://localhost:4173"]);
  });

  it("rejects unsupported and malformed navigation", () => {
    expect(isSafeNavigation("https://example.com")).toBe(true);
    expect(isSafeNavigation("http://localhost:3000")).toBe(true);
    expect(isSafeNavigation("file:///tmp/private")).toBe(false);
    expect(isSafeNavigation("javascript:alert(1)")).toBe(false);
    expect(isSafeNavigation("not a URL")).toBe(false);
  });
});
