import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  discoverProjectDirectories
} from "../src/settings/project-directory-search";
import { matchProjectDirectories, type ProjectDirectoryCandidateV1 } from "../src/settings/project-search";

describe("p-style project directory search", () => {
  it("finds Git roots through depth five, prunes node_modules, and ranks parents first", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "chromux-project-search-"));
    const parent = path.join(base, "web", "dev", "parent");
    const child = path.join(parent, "packages", "child");
    const worktree = path.join(base, "tools", "worktree");
    const ignored = path.join(base, "web", "dev", "parent", "node_modules", "ignored");
    await mkdir(path.join(parent, ".git"), { recursive: true });
    await mkdir(path.join(child, ".git"), { recursive: true });
    await mkdir(worktree, { recursive: true });
    await writeFile(path.join(worktree, ".git"), "gitdir: ../repo/.git/worktrees/worktree\n");
    await mkdir(path.join(ignored, ".git"), { recursive: true });

    const canonicalBase = await realpath(base);
    const canonicalParent = path.join(canonicalBase, "web", "dev", "parent");
    const canonicalChild = path.join(canonicalParent, "packages", "child");
    const canonicalWorktree = path.join(canonicalBase, "tools", "worktree");
    const result = await discoverProjectDirectories({ basePaths: [base] });

    expect(result.candidates.map((candidate) => candidate.path)).toEqual([canonicalWorktree, canonicalParent, canonicalChild]);
    expect(result.candidates.find((candidate) => candidate.path === canonicalParent)?.nested).toBe(false);
    expect(result.candidates.find((candidate) => candidate.path === canonicalChild)?.nested).toBe(true);
  });

  it("prefers basename substring matches before relative-path fallback", () => {
    const candidate = (name: string, relativePath: string): ProjectDirectoryCandidateV1 => ({
      name,
      relativePath,
      path: `/projects/${relativePath}`,
      basePath: "/projects",
      nested: false
    });
    const candidates = [
      candidate("chromux-next", "web/dev/chromux-next"),
      candidate("api", "web/dev/chromux-api"),
      candidate("cli", "tools/chromux-cli")
    ];

    expect(matchProjectDirectories(candidates, "chromux").map((item) => item.name)).toEqual(["chromux-next"]);
    expect(matchProjectDirectories(candidates, "tools").map((item) => item.name)).toEqual(["cli"]);
    expect(matchProjectDirectories(candidates, "NEXT").map((item) => item.name)).toEqual(["chromux-next"]);
  });
});
