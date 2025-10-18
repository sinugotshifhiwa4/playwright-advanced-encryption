import { SyncFileManager } from "../../../../utils/fileManager/syncFileManager";
import { ENVIRONMENT_CONSTANTS, ENVIRONMENT_STAGES } from "../../constants/environment.constants";
import type { EnvironmentStage } from "../../constants/environment.constants";

export default class StagesFilePathResolver {
  private static rootDir: string;

  public static getEnvironmentStages(): Record<EnvironmentStage, string> {
    return Object.fromEntries(
      ENVIRONMENT_STAGES.map((stage) => [
        stage,
        SyncFileManager.join(this.rootPath, `${ENVIRONMENT_CONSTANTS.BASE_FILE}.${stage}`),
      ]),
    ) as Record<EnvironmentStage, string>;
  }

  public static isValidStage(value: unknown): value is EnvironmentStage {
    return typeof value === "string" && ENVIRONMENT_STAGES.includes(value as EnvironmentStage);
  }

  private static get rootPath(): string {
    if (!this.rootDir) {
      this.rootDir = SyncFileManager.resolve(ENVIRONMENT_CONSTANTS.ROOT);
      SyncFileManager.ensureDirectoryExists(this.rootDir);
    }
    return this.rootDir;
  }
}
