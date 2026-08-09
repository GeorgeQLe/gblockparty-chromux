import type { ReleaseClient } from "./service-contracts";

export type UpdateServiceState = "idle" | "checking" | "unavailable";

/** Explicit no-install baseline; signed update behavior arrives in v0.10.0. */
export class UpdateService {
  private state: UpdateServiceState = "idle";

  constructor(private readonly releases: ReleaseClient) {}

  getState(): UpdateServiceState {
    return this.state;
  }

  get releaseClient(): ReleaseClient {
    return this.releases;
  }
}
