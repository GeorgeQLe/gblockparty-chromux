import { z } from "zod";

export const RepositoryInspectionRequestSchema = z.object({
  projectPaths: z.array(z.string().min(1).max(4096)).min(1).max(100),
  sessionProjectPaths: z.array(z.string().min(1).max(4096)).max(100).default([])
}).strict();

export const RepositoryEntryV1Schema = z.object({
  schemaVersion: z.literal(1),
  projectPath: z.string().min(1).max(4096),
  repositoryPath: z.string().min(1).max(4096),
  worktree: z.enum(["main", "linked", "plain-directory", "unknown"]),
  branch: z.string().max(512),
  detached: z.boolean(),
  unborn: z.boolean(),
  head: z.string().max(64),
  upstream: z.string().max(1024),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  unstaged: z.number().int().nonnegative(),
  untracked: z.number().int().nonnegative(),
  conflicted: z.number().int().nonnegative(),
  clean: z.boolean(),
  status: z.enum(["clean", "dirty", "not-git", "inaccessible", "timeout", "error"]),
  error: z.string().max(2048),
  attachedSessions: z.number().int().nonnegative()
}).strict();

export const RepositoryInspectionResultSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  repositories: z.array(RepositoryEntryV1Schema).max(100)
}).strict();

export type RepositoryInspectionRequest = z.infer<typeof RepositoryInspectionRequestSchema>;
export type RepositoryEntryV1 = z.infer<typeof RepositoryEntryV1Schema>;
export type RepositoryInspectionResult = z.infer<typeof RepositoryInspectionResultSchema>;
