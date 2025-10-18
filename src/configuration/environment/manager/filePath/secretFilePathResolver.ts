import { SyncFileManager } from "../../../../utils/fileManager/syncFileManager";
import { ENVIRONMENT_CONSTANTS, ENVIRONMENT_STAGES } from "../../constants/environment.constants";
import type { EnvironmentStage } from "../../constants/environment.constants";

export default class SecretFilePathResolver {
  private static rootDir: string;

  public static getSecretFilePath(): string {
    return SyncFileManager.join(
      this.rootPath,
      `${ENVIRONMENT_CONSTANTS.BASE_FILE}.${ENVIRONMENT_CONSTANTS.SECRET_FILE_PREFIX}`,
    );
  }

  public static getSecretVariables(): Record<EnvironmentStage, string> {
    return Object.fromEntries(
      ENVIRONMENT_STAGES.map((stage) => [
        stage,
        `${stage.toUpperCase()}_${ENVIRONMENT_CONSTANTS.SECRET_KEY_VAR_PREFIX}`,
      ]),
    ) as Record<EnvironmentStage, string>;
  }

  private static get rootPath(): string {
    if (!this.rootDir) {
      this.rootDir = SyncFileManager.resolve(ENVIRONMENT_CONSTANTS.ROOT);
      SyncFileManager.ensureDirectoryExists(this.rootDir);
    }
    return this.rootDir;
  }
}
