import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromuxOwnedCodexEnvironment, codexSearchPath } from "../src/main/codex-environment";

describe("Chromux-owned Codex environment", () => {
  it("adds packaged-app installation locations without duplicating PATH entries", () => {
    const value = codexSearchPath(["/usr/bin", "/opt/homebrew/bin"].join(path.delimiter), "/Users/example");
    expect(value.split(path.delimiter)).toEqual([
      "/usr/bin",
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/Users/example/.local/bin",
      "/Users/example/.npm-global/bin",
      "/Users/example/.bun/bin",
      "/Users/example/.volta/bin"
    ]);
  });

  it("suppresses duplicate update prompts only in the returned child environment", () => {
    const source = { PATH: "/usr/bin", KEEP_ME: "yes" };
    const result = chromuxOwnedCodexEnvironment(source, "/Users/example");
    expect(result).toMatchObject({
      KEEP_ME: "yes",
      CODEX_DISABLE_UPDATE_PROMPT: "1",
      CODEX_DISABLE_UPDATE_CHECK: "1"
    });
    expect(source).toEqual({ PATH: "/usr/bin", KEEP_ME: "yes" });
  });
});
