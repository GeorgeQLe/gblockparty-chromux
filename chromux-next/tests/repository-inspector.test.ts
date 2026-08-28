import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { parsePorcelainV2, RepositoryInspector } from "../src/main/repository-inspector";

const run = promisify(execFile);

describe("RepositoryInspector", () => {
  it("parses branch, tracking, change, and conflict records", () => {
    expect(parsePorcelainV2([
      "# branch.oid abc", "# branch.head feature", "# branch.upstream origin/feature", "# branch.ab +3 -2",
      "1 M. N... 100644 100644 100644 a a staged.ts", "1 .M N... 100644 100644 100644 a a changed.ts",
      "? new.ts", "u UU N... 100644 100644 100644 100644 a b c conflict.ts"
    ].join("\n"))).toEqual({ branch: "feature", detached: false, unborn: false, upstream: "origin/feature", ahead: 3, behind: 2, staged: 1, unstaged: 1, untracked: 1, conflicted: 1 });
  });

  it("recognizes detached and unborn states", () => {
    expect(parsePorcelainV2("# branch.head (detached)\n").detached).toBe(true);
    expect(parsePorcelainV2("# branch.oid (initial)\n# branch.head main\n").unborn).toBe(true);
  });

  it("deduplicates canonical paths and reports clean, dirty, and non-Git folders without mutation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "chromux-repository-"));
    const repository = path.join(root, "repo");
    await run("mkdir", [repository]);
    await run("git", ["init", "-q"], { cwd: repository });
    await run("git", ["config", "user.email", "test@example.com"], { cwd: repository });
    await run("git", ["config", "user.name", "Chromux Test"], { cwd: repository });
    await writeFile(path.join(repository, "tracked.txt"), "clean\n");
    await run("git", ["add", "tracked.txt"], { cwd: repository });
    await run("git", ["commit", "-qm", "initial"], { cwd: repository });
    const inspector = new RepositoryInspector();
    const clean = await inspector.inspect({ projectPaths: [repository, path.join(repository, ".")], sessionProjectPaths: [repository, repository] });
    expect(clean.repositories).toHaveLength(1);
    expect(clean.repositories[0]).toMatchObject({ status: "clean", attachedSessions: 2, staged: 0, unstaged: 0, untracked: 0 });
    await writeFile(path.join(repository, "tracked.txt"), "dirty\n");
    await writeFile(path.join(repository, "new.txt"), "new\n");
    const dirty = await inspector.inspect({ projectPaths: [repository], sessionProjectPaths: [] });
    expect(dirty.repositories[0]).toMatchObject({ status: "dirty", unstaged: 1, untracked: 1 });
    const plain = await inspector.inspect({ projectPaths: [root], sessionProjectPaths: [] });
    expect(plain.repositories[0]).toMatchObject({ status: "not-git", worktree: "plain-directory" });
  });
});
