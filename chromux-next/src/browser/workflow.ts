import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BrowserEvidenceV1Schema,
  BrowserWorkspaceV1Schema,
  EvidencePreviewSchema,
  type BrowserEvidenceV1,
  type BrowserWorkspaceV1
} from "./contracts";
import type { BrowserViewSnapshot } from "../main/browser-view-service";

export interface BrowserWorkspaceStore {
  getBrowserWorkspace(): Promise<BrowserWorkspaceV1>;
  updateBrowserWorkspace(workspace: BrowserWorkspaceV1): Promise<void>;
}

export interface BrowserEvidenceDependencies {
  now(): Date;
  id(): string;
  writeArtifact(filePath: string, contents: Buffer): Promise<void>;
  readArtifact(filePath: string): Promise<Buffer>;
}

const nodeDependencies: BrowserEvidenceDependencies = {
  now: () => new Date(),
  id: () => randomUUID(),
  async writeArtifact(filePath, contents) {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, contents, { mode: 0o600 });
  },
  readArtifact: (filePath) => readFile(filePath)
};

/** Persists navigation and enforces review-before-delivery for page evidence. */
export class BrowserEvidenceWorkflow {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: BrowserWorkspaceStore,
    private readonly artifactDirectory: string,
    private readonly dependencies: BrowserEvidenceDependencies = nodeDependencies
  ) {}

  state(): Promise<BrowserWorkspaceV1> {
    return this.store.getBrowserWorkspace();
  }

  async recordNavigation(snapshot: BrowserViewSnapshot): Promise<BrowserWorkspaceV1> {
    return this.mutate((current) => ({
      ...current,
      sessions: [
        ...current.sessions.filter((entry) => entry.sessionId !== snapshot.sessionId),
        {
          schemaVersion: 1 as const,
          sessionId: snapshot.sessionId,
          url: snapshot.url,
          title: snapshot.title,
          updatedAt: this.dependencies.now().toISOString()
        }
      ].slice(-200)
    }));
  }

  async capture(
    snapshot: BrowserViewSnapshot,
    note: string,
    png: Buffer
  ): Promise<{ state: BrowserWorkspaceV1; evidence: BrowserEvidenceV1 }> {
    if (!png.length || png.length > 10 * 1024 * 1024) throw new Error("Browser evidence must be a non-empty PNG under 10 MiB");
    const id = this.dependencies.id();
    const artifactName = `evidence-${id}.png`;
    await this.dependencies.writeArtifact(path.join(this.artifactDirectory, artifactName), png);
    const evidence = BrowserEvidenceV1Schema.parse({
      schemaVersion: 1,
      id,
      sessionId: snapshot.sessionId,
      url: snapshot.url,
      title: snapshot.title,
      note,
      status: "awaiting-review",
      capturedAt: this.dependencies.now().toISOString(),
      artifactName
    });
    const state = await this.mutate((current) => ({
      ...current,
      evidence: [...current.evidence, evidence].slice(-200)
    }));
    return { state, evidence };
  }

  async review(evidenceId: string, decision: "approve" | "reject", note?: string): Promise<BrowserWorkspaceV1> {
    return this.mutate((current) => {
      const evidence = this.requireEvidence(current, evidenceId);
      if (evidence.status === "delivered") throw new Error("Delivered evidence cannot be reviewed again");
      return {
        ...current,
        evidence: current.evidence.map((entry) => entry.id === evidenceId ? {
          ...entry,
          ...(note === undefined ? {} : { note }),
          status: decision === "approve" ? "approved" as const : "rejected" as const,
          reviewedAt: this.dependencies.now().toISOString()
        } : entry)
      };
    });
  }

  async preview(evidenceId: string): Promise<{ evidenceId: string; dataUrl: string }> {
    const evidence = this.requireEvidence(await this.state(), evidenceId);
    const png = await this.dependencies.readArtifact(path.join(this.artifactDirectory, evidence.artifactName));
    if (!png.length || png.length > 10 * 1024 * 1024) throw new Error("Evidence preview is unavailable");
    return EvidencePreviewSchema.parse({ evidenceId, dataUrl: `data:image/png;base64,${png.toString("base64")}` });
  }

  async deliver(evidenceId: string, send: (sessionId: string, prompt: string) => Promise<void>): Promise<BrowserWorkspaceV1> {
    let result: BrowserWorkspaceV1 | undefined;
    const next = this.queue.then(async () => {
      const current = await this.store.getBrowserWorkspace();
      const evidence = this.requireEvidence(current, evidenceId);
      if (evidence.status !== "approved") throw new Error("Evidence must be approved before delivery");
      const artifactPath = path.join(this.artifactDirectory, evidence.artifactName);
      const prompt = [
        "Review this human-approved browser evidence:",
        `URL: ${evidence.url}`,
        `Page title: ${evidence.title || "Untitled"}`,
        `Screenshot: ${artifactPath}`,
        evidence.note ? `Reviewer note: ${evidence.note}` : ""
      ].filter(Boolean).join("\n");
      await send(evidence.sessionId, prompt);
      result = BrowserWorkspaceV1Schema.parse({
        ...current,
        evidence: current.evidence.map((entry) => entry.id === evidenceId ? {
          ...entry,
          status: "delivered" as const,
          deliveredAt: this.dependencies.now().toISOString()
        } : entry)
      });
      await this.store.updateBrowserWorkspace(result);
    });
    this.queue = next.catch(() => undefined);
    return next.then(() => result!);
  }

  private requireEvidence(state: BrowserWorkspaceV1, evidenceId: string): BrowserEvidenceV1 {
    const evidence = state.evidence.find((entry) => entry.id === evidenceId);
    if (!evidence) throw new Error("Browser evidence was not found");
    return evidence;
  }

  private mutate(operation: (current: BrowserWorkspaceV1) => BrowserWorkspaceV1): Promise<BrowserWorkspaceV1> {
    let result: BrowserWorkspaceV1 | undefined;
    const next = this.queue.then(async () => {
      result = BrowserWorkspaceV1Schema.parse(operation(await this.store.getBrowserWorkspace()));
      await this.store.updateBrowserWorkspace(result);
    });
    this.queue = next.catch(() => undefined);
    return next.then(() => result!);
  }
}
