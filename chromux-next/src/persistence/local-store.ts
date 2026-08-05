import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const LocalStateSchema = z.object({
  schemaVersion: z.literal(1),
  recentDocuments: z.array(z.string().max(4096)).max(20).default([]),
  lastProjectPath: z.string().max(4096).default(""),
  window: z.object({
    width: z.number().int().min(800).max(10_000),
    height: z.number().int().min(600).max(10_000)
  }).default({ width: 1440, height: 900 }),
  runLogs: z.array(z.object({
    runId: z.string(),
    provider: z.string(),
    status: z.string(),
    at: z.string().datetime()
  })).max(100).default([])
});
export type LocalState = z.infer<typeof LocalStateSchema>;

const DEFAULT_STATE: LocalState = {
  schemaVersion: 1,
  recentDocuments: [],
  lastProjectPath: "",
  window: { width: 1440, height: 900 },
  runLogs: []
};

export class LocalStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "state-v1.json");
  }

  async read(): Promise<LocalState> {
    try {
      return LocalStateSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(DEFAULT_STATE);
      throw error;
    }
  }

  async write(state: LocalState): Promise<void> {
    const validated = LocalStateSchema.parse(state);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
