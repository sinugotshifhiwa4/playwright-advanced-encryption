import dotenv from "dotenv";
import EnvironmentDetector from "../../../detector/environmentDetector";
import path from "path";
import { AsyncFileManager } from "../../../../utils/fileManager/asyncFileManager";
import SecretFileManager from "../secretFileManager";
import StagesFileManager from "../stagesFileManager";
import SecretFilePathResolver from "./secretFilePathResolver";
import StagesFilePathResolver from "./stagesFilePathResolver";
import ErrorHandler from "../../../../utils/errorHandling/errorHandler";
import logger from "../../../../utils/logger/loggerManager";

export default class EnvironmentFileManager {
  private static instance: EnvironmentFileManager;
  private initialized = false;
  private loadedFiles: string[] = [];

  private constructor() {}

  public static getInstance(): EnvironmentFileManager {
    if (!EnvironmentFileManager.instance) {
      EnvironmentFileManager.instance = new EnvironmentFileManager();
    }
    return EnvironmentFileManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug("environment already initialized");
      return;
    }

    if (EnvironmentDetector.isCI()) {
      return;
    }

    try {
      await this.loadAllEnvironments();
      this.initialized = true;
      this.logInitializationResult();
    } catch (error) {
      ErrorHandler.captureError(error, "initialize", "Failed to set up environment variables");
      throw error;
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getLoadedFiles(): readonly string[] {
    return [...this.loadedFiles];
  }

  /**
   * Loads all environment files in sequence
   */
  private async loadAllEnvironments(): Promise<void> {
    await this.loadEnvironmentFile(SecretFilePathResolver.getSecretFilePath(), "base", (fp) =>
      SecretFileManager.handleMissingEnvFile(fp),
    );

    const env = EnvironmentDetector.getCurrentEnvironmentStage();
    const stageFilePath = this.getStageFilePath(env);
    await this.loadEnvironmentFile(stageFilePath, "stage", (fp) =>
      StagesFileManager.logEnvironmentFileNotFound(fp, env),
    );
  }

  /**
   * Logs the initialization result based on loaded files
   */
  private logInitializationResult(): void {
    if (this.loadedFiles.length > 0) {
      logger.info(
        `Environment successfully initialized with ${this.loadedFiles.length} config files: ${this.loadedFiles.join(", ")}`,
      );
    } else {
      logger.warn("Environment initialized but no config files were loaded");
    }
  }

  /**
   * Unified method to load any environment file (base or stage)
   * @param filePath - Path to the environment file
   * @param fileType - Type of file being loaded (for logging)
   * @param onMissing - Optional callback to handle missing files
   */
  private async loadEnvironmentFile(
    filePath: string,
    fileType: "base" | "stage",
    onMissing?: (filePath: string) => void,
  ): Promise<boolean> {
    try {
      const fileExists = await AsyncFileManager.doesFileExist(filePath);

      if (!fileExists) {
        if (onMissing) {
          onMissing(filePath);
        }
        return false;
      }

      // Load dotenv and validate
      const result = dotenv.config({ path: filePath, override: true });

      if (result.error) {
        throw new Error(
          `Error loading environment variables from ${filePath}: ${result.error.message}`,
        );
      }

      // Register the loaded file
      const fileName = path.basename(filePath);
      this.loadedFiles.push(fileName);
      logger.info(`Successfully loaded ${fileType} environment file: ${fileName}`);

      return true;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "loadEnvironmentFile",
        `Failed to load ${fileType} environment file at ${filePath}`,
      );

      // For base files, re-throw; for stage files, log and continue
      if (fileType === "base") {
        throw error;
      }
      return false;
    }
  }

  /**
   * Gets the file path for a specific environment stage
   */
  private getStageFilePath(env: string): string {
    const stages = StagesFilePathResolver.getEnvironmentStages();

    if (!(env in stages)) {
      ErrorHandler.logAndThrow(
        "getStageFilePath",
        `Invalid environment stage: ${env}. Valid stages are: ${Object.keys(stages).join(", ")}`,
      );
    }

    return stages[env as keyof typeof stages];
  }
}
