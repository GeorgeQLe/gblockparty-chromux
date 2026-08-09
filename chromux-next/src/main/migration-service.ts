/**
 * Reserved successor migration boundary. v0.7.1 migrates only the app's own
 * combined state-v1 file into independent slices; legacy Chromux profiles are
 * deliberately outside this service until the reviewed import milestone.
 */
export interface SuccessorMigrationResult {
  sourceVersion: number;
  targetVersion: number;
  migrated: boolean;
}

export class SuccessorMigrationService {
  async migrate(): Promise<SuccessorMigrationResult> {
    return { sourceVersion: 1, targetVersion: 1, migrated: false };
  }
}
