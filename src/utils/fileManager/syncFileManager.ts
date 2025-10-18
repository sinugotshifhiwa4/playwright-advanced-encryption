import BaseFileManager from "./internal/baseFileManager";
import path from "path";
import fs from "fs";
import { FileEncoding } from "./internal/file-encoding.enum";
import ErrorHandler from "../errorHandling/errorHandler";
import logger from "../logger/loggerManager";

export class SyncFileManager extends BaseFileManager {
  /**
   * Checks if a directory exists (synchronous)
   */
  public static doesDirectoryExist(dirPath: string): boolean {
    const normalizedPath = this.normalize(dirPath);
    this.validate(normalizedPath, "dirPath");

    try {
      const stats = fs.statSync(normalizedPath);
      return stats.isDirectory();
    } catch {
      logger.debug(`Directory does not exist: ${this.resolve(normalizedPath)}`);
      return false;
    }
  }

  /**
   * Checks if a file exists (synchronous)
   */
  public static doesFileExist(filePath: string): boolean {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      const stats = fs.statSync(normalizedPath);
      return stats.isFile();
    } catch {
      logger.debug(`File does not exist: ${path.basename(normalizedPath)}`);
      return false;
    }
  }

  /**
   * Creates directory structure recursively (synchronous)
   */
  public static createDirectory(dirPath: string): void {
    const normalizedPath = this.normalize(dirPath);
    this.validate(normalizedPath, "dirPath");

    try {
      fs.mkdirSync(normalizedPath, { recursive: true });
      logger.debug(`Created directory: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "createDirectorySync",
        `Failed to create directory: ${normalizedPath}`,
      );
      throw error;
    }
  }

  /**
   * Ensures directory exists (creates if it doesn't) - synchronous
   */
  public static ensureDirectoryExists(dirPath: string): { success: boolean } {
    try {
      if (!this.doesDirectoryExist(dirPath)) {
        this.createDirectory(dirPath);
      }
      return { success: true };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "ensureDirectoryExists",
        `Failed to ensure directory: ${dirPath}`,
      );
      return { success: false };
    }
  }

  /**
   * Reads file synchronously
   */
  public static readFile(filePath: string, encoding: FileEncoding = FileEncoding.UTF8): string {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      const content = fs.readFileSync(normalizedPath, { encoding });
      //logger.debug(`Successfully loaded file: ${this.resolve(normalizedPath)}`);
      return content.toString();
    } catch (error) {
      ErrorHandler.captureError(error, "readFileSync", `Failed to read file: ${normalizedPath}`);
      throw error;
    }
  }

  /**
   * Writes file synchronously
   */
  public static writeFile(
    filePath: string,
    content: string,
    keyName: string,
    encoding: FileEncoding = FileEncoding.UTF8,
  ): void {
    const normalizedPath = this.normalize(filePath);

    try {
      this.validate(normalizedPath, "filePath");

      if (content === undefined || content === null) {
        const error = new Error(`No content provided for file: ${keyName}`);
        logger.warn(error.message);
        throw error;
      }

      const dirPath = path.dirname(normalizedPath);
      this.ensureDirectoryExists(dirPath);

      fs.writeFileSync(normalizedPath, content, { encoding });

      logger.debug(`Successfully wrote file: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(error, "writeFileSync", `Failed to write file: ${normalizedPath}`);
      throw error;
    }
  }

  /**
   * Creates an empty file with parent directories (synchronous)
   */
  public static createFile(filePath: string): void {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      const dirPath = path.dirname(normalizedPath);
      this.ensureDirectoryExists(dirPath);

      const fd = fs.openSync(normalizedPath, "a");
      fs.closeSync(fd);

      logger.debug(`Created file: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "createFileSync",
        `Failed to create file: ${normalizedPath}`,
      );
      throw error;
    }
  }

  /**
   * Deletes a file (synchronous)
   */
  public static deleteFile(filePath: string): void {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      fs.unlinkSync(normalizedPath);
      logger.debug(`Deleted file: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "deleteFileSync",
        `Failed to delete file: ${normalizedPath}`,
      );
      throw error;
    }
  }

  /**
   * Checks if a file or directory is accessible (synchronous)
   */
  public static checkAccess(filePath: string, mode: number = fs.constants.F_OK): boolean {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      fs.accessSync(normalizedPath, mode);
      return true;
    } catch (error) {
      const modeDescription = this.getAccessModeDescription(mode);
      ErrorHandler.captureError(
        error,
        "checkAccessSync",
        `Access check failed for ${normalizedPath} (${modeDescription})`,
      );
      return false;
    }
  }
}
