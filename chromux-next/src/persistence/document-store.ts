import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { AlignmentDocumentV1Schema, type AlignmentDocumentV1 } from "../domain/schema";

export class DocumentStore {
  async read(filePath: string): Promise<AlignmentDocumentV1> {
    this.assertJsonPath(filePath);
    const contents = await readFile(filePath, { encoding: "utf8" });
    return AlignmentDocumentV1Schema.parse(JSON.parse(contents));
  }

  async write(filePath: string, document: AlignmentDocumentV1): Promise<void> {
    this.assertJsonPath(filePath);
    const validated = AlignmentDocumentV1Schema.parse(document);
    const directory = path.dirname(filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
    );
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, filePath);
  }

  private assertJsonPath(filePath: string): void {
    if (!path.isAbsolute(filePath)) throw new Error("Document path must be absolute");
    if (path.extname(filePath).toLowerCase() !== ".json") throw new Error("Documents must use a .json extension");
  }
}
