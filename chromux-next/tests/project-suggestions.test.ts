import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ProjectSuggestionService } from "../src/main/project-suggestion-service";
import type { ProjectEntryV1 } from "../src/settings/workspace-preferences";

async function gitProject(projectPath: string, worktree = false): Promise<void> {
  await mkdir(projectPath, { recursive: true });
  if (worktree) await writeFile(path.join(projectPath, ".git"), "gitdir: elsewhere");
  else await mkdir(path.join(projectPath, ".git"));
}

function registered(projectPath: string): ProjectEntryV1 {
  return {
    schemaVersion: 1,
    id: "registered",
    name: path.basename(projectPath),
    path: projectPath,
    kind: "project",
    addedAt: "2026-08-26T12:00:00.000Z",
    lastUsedAt: "2026-08-26T12:00:00.000Z"
  };
}

describe("p-style project suggestions", () => {
  it("prioritizes registered and recent projects while matching names before relative paths", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "chromux-projects-"));
    const base = path.join(home, "projects");
    const cache = path.join(home, "cache");
    const registeredPath = path.join(base, "apps", "chromux-registered");
    const recentPath = path.join(base, "tools", "dev", "chromux-next");
    const pathOnly = path.join(base, "chromux-category", "unrelated-name");
    await gitProject(registeredPath);
    await gitProject(recentPath, true);
    await gitProject(pathOnly);
    await mkdir(path.join(cache, "p"), { recursive: true });
    await writeFile(path.join(cache, "p", "p_history"), `${pathOnly}\n${recentPath}\n`);

    const service = new ProjectSuggestionService({
      homeDirectory: home,
      environment: { P_BASE: base, XDG_CACHE_HOME: cache }
    });
    const rows = await service.suggest("chromux", [registered(registeredPath)]);

    expect(rows.map((row) => [row.name, row.source])).toEqual([
      ["chromux-registered", "registered"],
      ["chromux-next", "recent"],
      ["unrelated-name", "recent"]
    ]);
    expect(rows[1]?.detail).toBe("tools/dev/chromux-next");
  });

  it("completes literal directory prefixes and skips dependency trees during p discovery", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "chromux-literal-"));
    const base = path.join(home, "projects");
    const alpha = path.join(base, "apps", "alpha project");
    const ignored = path.join(base, "apps", "node_modules", "alpha-ignored");
    await gitProject(alpha);
    await gitProject(ignored);
    const service = new ProjectSuggestionService({ homeDirectory: home, environment: { P_BASE: base } });

    const literal = await service.suggest(path.join(base, "apps", "alp"), []);
    const canonicalAlpha = await realpath(alpha);
    expect(literal).toMatchObject([{ name: "alpha project", path: canonicalAlpha, source: "filesystem" }]);
    const discovered = await service.suggest("alpha", []);
    expect(discovered.map((row) => row.path)).toEqual([canonicalAlpha]);
  });
});
