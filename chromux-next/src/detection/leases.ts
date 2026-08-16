import { randomUUID } from "node:crypto";
import {
  DetectionLeaseV1Schema,
  type DetectionLeaseV1,
  type EnrichedDetectionCandidate
} from "./contracts";

export const DETECTION_LEASE_TTL_MS = 2 * 60_000;
export const MAX_DETECTION_LEASES = 32;

type LeaseRecord = {
  expiresAt: number;
  target: EnrichedDetectionCandidate;
  timer: NodeJS.Timeout;
};

type LeaseDependencies = {
  now(): number;
  id(): string;
  ttlMs: number;
  capacity: number;
};

const DEFAULT_DEPENDENCIES: LeaseDependencies = {
  now: Date.now,
  id: randomUUID,
  ttlMs: DETECTION_LEASE_TTL_MS,
  capacity: MAX_DETECTION_LEASES
};

/** Main-process-only authority retained independently from the replaceable scan cache. */
export class DetectionLeaseStore {
  private readonly leases = new Map<string, LeaseRecord>();
  private readonly dependencies: LeaseDependencies;

  constructor(dependencies: Partial<LeaseDependencies> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  acquire(target: EnrichedDetectionCandidate): DetectionLeaseV1 {
    this.clearExpired();
    if (this.leases.size >= this.dependencies.capacity) {
      throw new Error("Too many detected-session configurations are open. Close one and try again.");
    }
    const leaseId = this.dependencies.id();
    if (this.leases.has(leaseId)) throw new Error("Could not reserve the detected terminal. Rescan to continue.");
    return this.put(leaseId, structuredClone(target));
  }

  renew(leaseId: string): DetectionLeaseV1 {
    const record = this.requireActive(leaseId);
    clearTimeout(record.timer);
    return this.put(leaseId, record.target);
  }

  resolve(leaseId: string): EnrichedDetectionCandidate {
    return structuredClone(this.requireActive(leaseId).target);
  }

  release(leaseId: string): void {
    const record = this.requireActive(leaseId);
    clearTimeout(record.timer);
    this.leases.delete(leaseId);
  }

  /** Called only after transactional creation succeeds; expiry during creation must not mask success. */
  consume(leaseId: string): void {
    const record = this.leases.get(leaseId);
    if (!record) return;
    clearTimeout(record.timer);
    this.leases.delete(leaseId);
  }

  private requireActive(leaseId: string): LeaseRecord {
    const record = this.leases.get(leaseId);
    if (!record || record.expiresAt <= this.dependencies.now()) {
      if (record) {
        clearTimeout(record.timer);
        this.leases.delete(leaseId);
      }
      throw new Error("Detection lease expired or is unknown. Rescan to continue.");
    }
    return record;
  }

  private put(leaseId: string, target: EnrichedDetectionCandidate): DetectionLeaseV1 {
    const expiresAt = this.dependencies.now() + this.dependencies.ttlMs;
    const timer = setTimeout(() => {
      const current = this.leases.get(leaseId);
      if (current && current.expiresAt <= this.dependencies.now()) this.leases.delete(leaseId);
    }, this.dependencies.ttlMs);
    timer.unref();
    this.leases.set(leaseId, { expiresAt, target, timer });
    return DetectionLeaseV1Schema.parse({
      schemaVersion: 1,
      leaseId,
      expiresAt: new Date(expiresAt).toISOString()
    });
  }

  private clearExpired(): void {
    const now = this.dependencies.now();
    for (const [leaseId, record] of this.leases) {
      if (record.expiresAt <= now) {
        clearTimeout(record.timer);
        this.leases.delete(leaseId);
      }
    }
  }
}
