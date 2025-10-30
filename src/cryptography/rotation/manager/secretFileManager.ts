import { AsyncFileManager } from "../../../utils/fileManager/asyncFileManager";
import * as path from "path";
import CryptoConstants from "../types/cryptoConstants";
import { FileEncoding } from "../../../utils/fileManager/internal/file-encoding.enum";
import logger from "../../../utils/logger/loggerManager";

export default class SecretFileManager {
  /**
   * Gets the full file path for a tracking file.
   */
  public static getFilePath(filename: string): string {
    return path.join(process.cwd(), CryptoConstants.TRACKING_DIR, filename);
  }

  /**
   * Loads a JSON file with a default value fallback.
   */
  public static async loadJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    const fileExists = await AsyncFileManager.doesFileExist(filePath);

    if (!fileExists) {
      logger.info(`No file found at "${filePath}", creating with default data`);
      return defaultValue;
    }

    try {
      const fileContent = await AsyncFileManager.readFile(filePath, FileEncoding.UTF8);
      return JSON.parse(fileContent) as T;
    } catch (error) {
      logger.error(`Failed to parse JSON file at "${filePath}": ${error}`);
      return defaultValue;
    }
  }

  /**
   * Saves data to a JSON file.
   */
  public static async saveJsonFile<T>(filePath: string, data: T): Promise<void> {
    const jsonContent = JSON.stringify(data, null, 2);
    await AsyncFileManager.writeFile(filePath, jsonContent, `Updated ${path.basename(filePath)}`);
  }

  /**
   * Ensures the tracking directory exists.
   */
  public static async ensureTrackingDirectoryExists(): Promise<void> {
    const dirPath = path.join(process.cwd(), CryptoConstants.TRACKING_DIR);
    const dirExists = await AsyncFileManager.doesFileExist(dirPath);

    if (!dirExists) {
      logger.info(`Creating tracking directory at "${dirPath}"`);
      await AsyncFileManager.createDirectory(dirPath);
    }
  }
}
