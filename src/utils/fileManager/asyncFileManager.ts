import BaseFileManager from "./internal/baseFileManager";
import path from "path";
import fs from "fs";
import { FileEncoding } from "./internal/file-encoding.enum";
import ErrorHandler from "../errorHandling/errorHandler";
import logger from "../logger/loggerManager";

export class AsyncFileManager extends BaseFileManager {
  /**
   * Checks if a path exists (file or directory)
   */
  public static async pathExists(targetPath: string): Promise<boolean> {
    const normalizedPath = this.normalize(targetPath);
    this.validate(normalizedPath, "targetPath");

    try {
      await fs.promises.access(normalizedPath, fs.constants.F_OK);
      return true;
    } catch {
      logger.debug(`Path does not exist: ${this.resolve(normalizedPath)}`);
      return false;
    }
  }

  /**
   * Creates directory structure recursively
   */
  public static async createDirectory(dirPath: string): Promise<void> {
    const normalizedPath = this.normalize(dirPath);
    this.validate(normalizedPath, "dirPath");

    try {
      await fs.promises.mkdir(normalizedPath, { recursive: true });
      logger.debug(`Created directory: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "createDirectory",
        `Failed to create directory: ${normalizedPath}`,
      );
      throw error;
    }
  }

  /**
   * Creates an empty file with parent directories
   */
  public static async createFile(filePath: string): Promise<void> {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      const dirPath = path.dirname(normalizedPath);
      await this.createDirectory(dirPath);

      const fileHandle = await fs.promises.open(normalizedPath, "a");
      await fileHandle.close();

      logger.debug(`Created file: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(error, "createFile", `Failed to create file: ${normalizedPath}`);
      throw error;
    }
  }

  /**
   * Checks if a directory exists
   */
  public static async doesDirectoryExist(dirPath: string): Promise<boolean> {
    const normalizedPath = this.normalize(dirPath);
    this.validate(normalizedPath, "dirPath");

    try {
      const stats = await fs.promises.stat(normalizedPath);
      return stats.isDirectory();
    } catch {
      logger.debug(`Directory does not exist: ${this.resolve(normalizedPath)}`);
      return false;
    }
  }

  /**
   * Checks if a file exists
   */
  public static async doesFileExist(filePath: string): Promise<boolean> {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      const stats = await fs.promises.stat(normalizedPath);
      return stats.isFile();
    } catch {
      logger.debug(`File does not exist: ${path.basename(normalizedPath)}`);
      return false;
    }
  }

  /**
   * Writes content to a file with improved error handling
   */
  public static async writeFile(
    filePath: string,
    content: string,
    keyName: string,
    encoding: FileEncoding = FileEncoding.UTF8,
  ): Promise<void> {
    const normalizedPath = this.normalize(filePath);

    try {
      this.validate(normalizedPath, "filePath");

      if (content === undefined || content === null) {
        const error = new Error(`No content provided for file: ${keyName}`);
        logger.warn(error.message);
        throw error;
      }

      const dirPath = path.dirname(normalizedPath);
      await this.createDirectory(dirPath);

      await fs.promises.writeFile(normalizedPath, content, { encoding });

      logger.debug(`Successfully wrote file: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(error, "writeFile", `Failed to write file: ${normalizedPath}`);
      throw error;
    }
  }

  /**
   * Reads content from a file
   */
  public static async readFile(
    filePath: string,
    encoding: FileEncoding = FileEncoding.UTF8,
  ): Promise<string> {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      const content = await fs.promises.readFile(normalizedPath, { encoding });
      //logger.debug(`Successfully loaded file: ${this.resolve(normalizedPath)}`);
      return content.toString();
    } catch (error) {
      ErrorHandler.captureError(error, "readFile", `Failed to read file: ${normalizedPath}`);
      throw error;
    }
  }

  /**
   * Deletes a file
   */
  public static async deleteFile(filePath: string): Promise<void> {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      await fs.promises.unlink(normalizedPath);
      logger.debug(`Deleted file: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(error, "deleteFile", `Failed to delete file: ${normalizedPath}`);
      throw error;
    }
  }

  /**
   * Deletes a directory recursively
   */
  public static async deleteDirectory(dirPath: string): Promise<void> {
    const normalizedPath = this.normalize(dirPath);
    this.validate(normalizedPath, "dirPath");

    try {
      await fs.promises.rm(normalizedPath, { recursive: true, force: true });
      logger.debug(`Deleted directory: ${this.resolve(normalizedPath)}`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "deleteDirectory",
        `Failed to delete directory: ${normalizedPath}`,
      );
      throw error;
    }
  }

  /**
   * Ensures directory exists (creates if it doesn't)
   */
  public static async ensureDirectory(dirPath: string): Promise<void> {
    if (!(await this.doesDirectoryExist(dirPath))) {
      await this.createDirectory(dirPath);
    }
  }

  /**
   * Ensures file exists (creates empty if it doesn't)
   */
  public static async ensureFile(filePath: string): Promise<void> {
    if (!(await this.doesFileExist(filePath))) {
      await this.createFile(filePath);
    }
  }

  /**
   * Checks if a file or directory is accessible
   */
  public static async checkAccess(
    filePath: string,
    mode: number = fs.constants.F_OK,
  ): Promise<boolean> {
    const normalizedPath = this.normalize(filePath);
    this.validate(normalizedPath, "filePath");

    try {
      await fs.promises.access(normalizedPath, mode);
      return true;
    } catch (error) {
      const modeDescription = this.getAccessModeDescription(mode);
      ErrorHandler.captureError(
        error,
        "checkAccess",
        `Access check failed for ${normalizedPath} (${modeDescription})`,
      );
      return false;
    }
  }
}
