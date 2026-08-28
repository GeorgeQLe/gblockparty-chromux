import path from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { z } from "zod";

const storedCredentialSchema = z.object({
  schemaVersion: z.literal(1), encryptedPayload: z.string().min(1).max(8192)
}).strict();
const protectedPayloadSchema = z.object({
  endpoint: z.string().url().max(2000),
  deviceId: z.string().min(3).max(128), deviceLabel: z.string().min(1).max(120),
  credential: z.string().min(32).max(512)
}).strict();

export interface ProtectedStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface FleetCredential {
  endpoint: string;
  deviceId: string;
  deviceLabel: string;
  credential: string;
}

export class FleetCredentialStore {
  private readonly filePath: string;
  constructor(userDataPath: string, private readonly protectedStorage: ProtectedStorage) {
    this.filePath = path.join(userDataPath, "fleet-device-v1.json");
  }

  async load(): Promise<FleetCredential | null> {
    let parsed: z.infer<typeof storedCredentialSchema>;
    try { parsed = storedCredentialSchema.parse(JSON.parse(await readFile(this.filePath, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("The protected Fleet device credential could not be loaded");
    }
    if (!this.protectedStorage.isEncryptionAvailable()) throw new Error("Protected credential storage is unavailable");
    try {
      return protectedPayloadSchema.parse(JSON.parse(this.protectedStorage.decryptString(Buffer.from(parsed.encryptedPayload, "base64"))));
    } catch { throw new Error("The protected Fleet device credential could not be decrypted"); }
  }

  async save(value: FleetCredential): Promise<void> {
    if (!this.protectedStorage.isEncryptionAvailable()) throw new Error("Protected credential storage is unavailable; enrollment was not saved");
    const payload = protectedPayloadSchema.parse(value);
    const body = storedCredentialSchema.parse({ schemaVersion: 1, encryptedPayload: this.protectedStorage.encryptString(JSON.stringify(payload)).toString("base64") });
    const temporary = `${this.filePath}.tmp`;
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(temporary, `${JSON.stringify(body)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  async clear(): Promise<void> { await unlink(this.filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
}
