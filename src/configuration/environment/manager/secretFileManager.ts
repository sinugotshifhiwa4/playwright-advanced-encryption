import { AsyncFileManager } from "../../../utils/fileManager/asyncFileManager";
import SecretFilePathResolver from "./filePath/secretFilePathResolver";
import { FileEncoding } from "../../../utils/fileManager/internal/file-encoding.enum";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";

export default class SecretFileManager {
  // File lock registry to track ongoing operations
  private static readonly fileLocks = new Map<string, Promise<void>>();

  /**
   * Stores or updates an environment key-value pair in the base environment file
   * @param keyName - The name of the environment key
   * @param value - The value to store for the key
   * @param options - Optional parameters to control behavior
   * @param options.skipIfExists - If true, skips storing if key already exists (default: false)
   * @returns Promise resolving to boolean indicating if the key was actually stored/updated
   */
  public static async storeEnvironmentKey(
    keyName: string,
    value: string,
    options: { skipIfExists?: boolean } = {},
  ): Promise<boolean> {
    return this.storeKeyInFile(SecretFilePathResolver.getSecretFilePath(), keyName, value, options);
  }

  /**
   * Stores or updates an environment key-value pair in any environment file
   * @param filePath - Path to the environment file
   * @param keyName - The name of the environment key
   * @param value - The value to store for the key
   * @param options - Optional parameters to control behavior
   * @param options.skipIfExists - If true, skips storing if key already exists (default: false)
   * @returns Promise resolving to boolean indicating if the key was actually stored/updated
   */
  public static async storeKeyInFile(
    filePath: string,
    keyName: string,
    value: string,
    options: { skipIfExists?: boolean } = {},
  ): Promise<boolean> {
    return this.executeWithFileLock(filePath, async () => {
      try {
        const fileContent = await this.readEnvFileContent(filePath);

        if (this.shouldSkipExistingKey(fileContent, keyName, options.skipIfExists)) {
          return false;
        }

        const updatedContent = this.updateEnvironmentKey(fileContent, keyName, value);
        await this.writeUpdatedEnvironmentFile(filePath, updatedContent, keyName);

        return true;
      } catch (error) {
        ErrorHandler.captureError(
          error,
          "storeKeyInFile",
          `Failed to store key "${keyName}" value in "${filePath}"`,
        );
        throw error;
      }
    });
  }

  /**
   * Retrieves the value for a specific environment key from any file
   * @param filePath - Path to the environment file
   * @param keyName - The name of the environment key to retrieve
   * @returns Promise resolving to the value of the key, or undefined if not found
   */
  public static async getKeyValue(filePath: string, keyName: string): Promise<string | undefined> {
    // Wait for any ongoing write operations to complete before reading
    await this.waitForFileLock(filePath);

    try {
      const fileContent = await this.readEnvFileContent(filePath);
      return this.extractKeyValue(fileContent, keyName);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getKeyValue",
        `Failed to retrieve value for key "${keyName}" from "${filePath}".`,
      );
      throw error;
    }
  }

  /**
   * Verifies if a secret key exists in the environment file
   * @param secretKeyName - The name of the secret key to verify (e.g., "SECRET_KEY_DEV")
   * @param filePath - Optional path to environment file, defaults to base environment file
   * @returns Promise resolving to boolean indicating if the secret key exists and has a value
   */
  public static async verifySecretKeyExists(
    secretKeyName: string,
    filePath?: string,
  ): Promise<boolean> {
    try {
      const targetFilePath = this.resolveFilePath(filePath);
      const secretKeyValue = await this.getKeyValue(targetFilePath, secretKeyName);

      // Check if key exists and has a non-empty value
      const keyExists = secretKeyValue !== undefined && secretKeyValue.trim() !== "";

      if (keyExists) {
        logger.info(`Secret key "${secretKeyName}" verified successfully`);
      } else {
        logger.warn(`Secret key "${secretKeyName}" not found or empty in environment file`);
      }

      return keyExists;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "verifySecretKeyExists",
        `Failed to verify secret key "${secretKeyName}"`,
      );
      return false;
    }
  }

  public static async ensureEnvFileExists(filePath: string): Promise<void> {
    const fileExists = await AsyncFileManager.doesFileExist(filePath);

    if (!fileExists) {
      logger.warn(`Environment file not found at "${filePath}". Creating new empty file.`);
      await AsyncFileManager.writeFile(filePath, "", "Created empty environment file");
    }
  }

  public static async readEnvFileContent(filePath: string): Promise<string> {
    try {
      await this.ensureEnvFileExists(filePath);
      return await AsyncFileManager.readFile(filePath, FileEncoding.UTF8);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "readEnvFileContent",
        `Failed to read environment file at "${filePath}"`,
      );
      throw error;
    }
  }

  public static handleMissingEnvFile(filePath: string): void {
    const isEncryptionEnabled = (process.env.PLAYWRIGHT_GREP || "").includes("@full-encryption");
    if (isEncryptionEnabled) {
      return;
    }
    this.logMissingFileWarning(filePath);
  }

  /**
   * Ensures secret key exists before proceeding with encryption operations
   * @param secretKeyName - The name of the secret key to verify
   * @param filePath - Optional path to environment file
   * @throws Error if secret key doesn't exist
   */
  public static async ensureSecretKeyExists(
    secretKeyName: string,
    filePath?: string,
  ): Promise<void> {
    const targetFilePath = this.resolveFilePath(filePath);

    // Wait for any ongoing file operations to complete
    await this.waitForFileLock(targetFilePath);

    const keyExists = await this.verifySecretKeyExists(secretKeyName, filePath);

    if (!keyExists) {
      ErrorHandler.logAndThrow(
        "ensureSecretKeyExists",
        `Secret key variable '${secretKeyName}' not found in environment file. ` +
          `Please generate the secret key first before attempting encryption.`,
      );
    }
  }

  // Private methods

  /**
   * Resolves the file path to use, defaulting to secret environment file if not provided
   * @param filePath - Optional file path
   * @returns Resolved file path
   */
  private static resolveFilePath(filePath?: string): string {
    return filePath || SecretFilePathResolver.getSecretFilePath();
  }

  /**
   * Executes a function with file lock protection to prevent race conditions
   * @param filePath - Path to the file being operated on
   * @param operation - The async operation to execute
   * @returns Promise resolving to the operation result
   */
  private static async executeWithFileLock<T>(
    filePath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    // Wait for any existing lock on this file
    await this.waitForFileLock(filePath);

    // Create a new lock for this operation
    const lockPromise = this.createFileLock(filePath, operation);

    try {
      return await lockPromise;
    } finally {
      this.fileLocks.delete(filePath);
    }
  }

  /**
   * Creates a file lock for the given file path
   * @param filePath - Path to the file being locked
   * @param operation - The operation to execute under lock
   * @returns Promise for the locked operation
   */
  private static createFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const lockPromise = operation();
    this.fileLocks.set(
      filePath,
      lockPromise.then(() => undefined).catch(() => undefined),
    );
    return lockPromise;
  }

  /**
   * Waits for any existing file lock to complete
   * @param filePath - Path to the file to wait for
   */
  private static async waitForFileLock(filePath: string): Promise<void> {
    const existingLock = this.fileLocks.get(filePath);
    if (existingLock) {
      logger.debug(`Waiting for file lock on "${filePath}" to complete...`);
      await existingLock;
      logger.debug(`File lock on "${filePath}" released, proceeding...`);
    }
  }

  /**
   * Checks if key should be skipped based on existence and options
   * @param fileContent - The current file content
   * @param keyName - The key name to check
   * @param skipIfExists - Whether to skip if key exists
   * @returns True if key should be skipped, false otherwise
   */
  private static shouldSkipExistingKey(
    fileContent: string,
    keyName: string,
    skipIfExists?: boolean,
  ): boolean {
    if (!skipIfExists) {
      return false;
    }

    const existingValue = this.extractKeyValue(fileContent, keyName);
    if (existingValue !== undefined) {
      logger.info(
        `Secret Key for "${keyName}" already exists in target file — skipping to avoid overwrite`,
      );
      return true;
    }

    return false;
  }

  /**
   * Writes updated content to environment file and logs success
   * @param filePath - Path to the environment file
   * @param updatedContent - The content to write
   * @param keyName - The key name being updated (for logging)
   */
  private static async writeUpdatedEnvironmentFile(
    filePath: string,
    updatedContent: string,
    keyName: string,
  ): Promise<void> {
    await AsyncFileManager.writeFile(filePath, updatedContent, keyName);
    logger.info(`Key "${keyName}" stored successfully`);
  }

  /**
   * Logs warning message for missing environment file
   * @param filePath - Path to the missing file
   */
  private static logMissingFileWarning(filePath: string): void {
    const warningMessage = [
      `Environment file not found at: ${filePath}.`,
      `Expected location based on configuration: ${filePath}.`,
      `You can create environment file by running encryption`,
    ].join("\n");

    logger.warn(warningMessage);
  }

  /**
   * Extracts the value for a specific key from the file content
   * @param fileContent - The content to search in
   * @param keyName - The key name to extract value for
   * @returns The value of the key, or undefined if not found
   */
  private static extractKeyValue(fileContent: string, keyName: string): string | undefined {
    const regex = this.createKeyRegex(keyName, { captureValue: true });
    const match = fileContent.match(regex);
    return match?.[1];
  }

  /**
   * Creates a regex pattern for matching environment keys
   * @param keyName - The key name to create regex for
   * @param options - Configuration options
   * @param options.captureValue - If true, captures the value in a group (default: false)
   * @param options.flags - Regex flags to use (default: "m")
   * @returns Regular expression for matching the key
   */
  private static createKeyRegex(
    keyName: string,
    options: {
      captureValue?: boolean;
      flags?: string;
    } = {},
  ): RegExp {
    const { captureValue = false, flags = "m" } = options;
    const escapedKeyName = this.escapeKeyNameForRegex(keyName);
    const pattern = captureValue ? `^${escapedKeyName}=(.*)$` : `^${escapedKeyName}=.*$`;
    return new RegExp(pattern, flags);
  }

  /**
   * Escapes special regex characters in key name for safe pattern matching
   * @param keyName - The key name to escape
   * @returns Escaped key name safe for regex use
   */
  private static escapeKeyNameForRegex(keyName: string): string {
    return keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Updates an existing environment key or adds a new one to the file content
   * @param fileContent - The current content of the environment file
   * @param keyName - The name of the environment key
   * @param value - The value to set for the key
   * @returns The updated file content
   */
  private static updateEnvironmentKey(fileContent: string, keyName: string, value: string): string {
    if (this.environmentKeyExists(fileContent, keyName)) {
      return this.updateExistingEnvironmentKey(fileContent, keyName, value);
    } else {
      return this.addEnvironmentKey(fileContent, keyName, value);
    }
  }

  /**
   * Checks if an environment key exists in the file content
   * @param fileContent - The content to search in
   * @param keyName - The key name to look for
   * @returns True if the key exists, false otherwise
   */
  private static environmentKeyExists(fileContent: string, keyName: string): boolean {
    const regex = this.createKeyRegex(keyName);
    return regex.test(fileContent);
  }

  /**
   * Updates an existing environment key in the file content
   * @param fileContent - The current file content
   * @param keyName - The key name to update
   * @param value - The new value for the key
   * @returns Updated file content
   */
  private static updateExistingEnvironmentKey(
    fileContent: string,
    keyName: string,
    value: string,
  ): string {
    const regex = this.createKeyRegex(keyName);
    const formattedKeyValue = this.formatEnvironmentKeyValue(keyName, value);
    return fileContent.replace(regex, formattedKeyValue);
  }

  /**
   * Formats a key-value pair for environment file
   * @param keyName - The key name
   * @param value - The value
   * @returns Formatted string "KEY=VALUE"
   */
  private static formatEnvironmentKeyValue(keyName: string, value: string): string {
    return `${keyName}=${value}`;
  }

  /**
   * Adds a new environment key to the file content
   * @param fileContent - The current file content
   * @param keyName - The key name to add
   * @param value - The value for the key
   * @returns Updated file content with new key appended
   */
  private static addEnvironmentKey(fileContent: string, keyName: string, value: string): string {
    const contentWithNewline = this.ensureFileEndsWithNewline(fileContent);
    const formattedKeyValue = this.formatEnvironmentKeyValue(keyName, value);

    logger.warn(`Key "${keyName}" not found, appending to end of file`);
    return contentWithNewline + formattedKeyValue;
  }

  /**
   * Ensures file content ends with a newline before adding new content
   * @param content - The file content to check
   * @returns Content with newline if needed
   */
  private static ensureFileEndsWithNewline(content: string): string {
    if (content && !content.endsWith("\n")) {
      return content + "\n";
    }
    return content;
  }
}
