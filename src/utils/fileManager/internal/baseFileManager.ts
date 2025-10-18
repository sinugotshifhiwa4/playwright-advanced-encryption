import path from "path";
import fs from "fs";
import ErrorHandler from "../../errorHandling/errorHandler";

export default abstract class BaseFileManager {
  /**
   * Normalizes and secures a file path
   */
  protected static normalize(inputPath: string): string {
    if (!inputPath) {
      throw new Error("Path cannot be empty");
    }

    if (inputPath.includes("\0")) {
      throw new Error("Path contains null bytes");
    }

    // Just normalize and resolve - let the OS handle the rest
    return path.resolve(path.normalize(inputPath));
  }

  /**
   * Validates a file or directory path
   */
  protected static validate(filePath: string, paramName = "path"): void {
    if (!filePath) {
      ErrorHandler.logAndThrow(
        "FileManager.validate",
        `Invalid argument: '${paramName}' is required.`,
      );
    }

    if (paramName === "filePath" && /[\/\\]$/.test(filePath)) {
      ErrorHandler.logAndThrow(
        "FileManager.validate",
        `Invalid file path: '${filePath}' cannot end with a directory separator.`,
      );
    }
  }

  /**
   * Helper method to get human-readable access mode description
   */
  protected static getAccessModeDescription(mode: number): string {
    const modes: string[] = [];

    if (mode & fs.constants.F_OK) modes.push("exists");
    if (mode & fs.constants.R_OK) modes.push("readable");
    if (mode & fs.constants.W_OK) modes.push("writable");
    if (mode & fs.constants.X_OK) modes.push("executable");

    return modes.length > 0 ? modes.join(", ") : "unknown";
  }

  public static resolve(fileName: string): string {
    return path.resolve(fileName);
  }

  public static join(...segments: string[]): string {
    if (segments.length === 0) {
      throw new Error("At least one path segment is required");
    }

    const joinedPath = path.join(...segments);
    return this.normalize(joinedPath);
  }

  public static getBaseName(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }

  public static getBaseNameWithExtension(filePath: string): string {
    return path.basename(filePath);
  }

  public static getExtension(filePath: string): string {
    return path.extname(filePath);
  }
}
