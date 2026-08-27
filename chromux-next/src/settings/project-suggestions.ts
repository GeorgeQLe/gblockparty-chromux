import { z } from "zod";

export const ProjectSuggestionQuerySchema = z.object({
  query: z.string().max(4096),
  limit: z.number().int().min(1).max(20).default(12)
}).strict();

export const ProjectSuggestionV1Schema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(256),
  path: z.string().min(1).max(4096),
  detail: z.string().min(1).max(4096),
  source: z.enum(["registered", "recent", "p", "filesystem"])
}).strict();

export type ProjectSuggestionQuery = z.infer<typeof ProjectSuggestionQuerySchema>;
export type ProjectSuggestionV1 = z.infer<typeof ProjectSuggestionV1Schema>;
