import { AsyncFileManager } from "../../../utils/fileManager/asyncFileManager";
import { CRYPTO_CONSTANTS } from "../../../cryptography/types/crypto.config";
import { FileEncoding } from "../../../utils/fileManager/internal/file-encoding.enum";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";

export default class StagesFileManager {
  /**
   * Reads the environment file and returns its content as an array of lines.
   * @param filePath - Path to the environment file
   * @returns Promise resolving to array of lines
   */
  public static async readEnvironmentFileAsLines(filePath: string): Promise<string[]> {
    try {
      const exists = await this.doesEnvironmentFileExist(filePath);
      if (!exists) {
        throw new Error(`Environment file not found: ${filePath}`);
      }

      const content = await AsyncFileManager.readFile(filePath, FileEncoding.UTF8);
      return this.parseFileContentToLines(content, filePath);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "readEnvironmentFileAsLines",
        `Failed to read environment file: ${filePath}`,
      );
      throw error;
    }
  }

  public static async writeEnvironmentFileLines(
    filePath: string,
    lines: string[],
    affectedVariableCount?: number,
  ): Promise<void> {
    try {
      const content = this.linesToFileContent(lines);
      await AsyncFileManager.writeFile(filePath, content, FileEncoding.UTF8);

      if (affectedVariableCount !== undefined) {
        logger.debug(
          `Successfully wrote file with ${affectedVariableCount} modified environment variables to ${filePath}`,
        );
      } else {
        const totalEnvVarCount = this.countActualEnvironmentVariables(lines);
        logger.debug(
          `Successfully wrote file with ${totalEnvVarCount} total environment variables to ${filePath}`,
        );
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "writeEnvironmentFileLines",
        `Failed to write environment file: ${filePath}`,
      );
      throw error;
    }
  }

  /**
   * Counts the actual environment variable lines (excluding comments, empty lines, etc.)
   * @param lines - Array of file lines
   * @returns Number of actual environment variable lines
   */
  public static countActualEnvironmentVariables(lines: string[]): number {
    let count = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Count only lines that contain actual environment variables
      if (trimmedLine && !trimmedLine.startsWith("#") && trimmedLine.includes("=")) {
        const equalIndex = trimmedLine.indexOf("=");
        const key = trimmedLine.substring(0, equalIndex).trim();

        // Validate key format before counting
        if (key && CRYPTO_CONSTANTS.VALIDATION.ENV_VAR_KEY_PATTERN.test(key)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Reads and parses environment variables from a file
   * @param filePath - Path to the environment file
   * @returns Promise resolving to environment variables object
   */
  public static async readEnvironmentVariables(filePath: string): Promise<Record<string, string>> {
    const lines = await this.readEnvironmentFileAsLines(filePath);
    return this.extractEnvironmentVariables(lines);
  }

  /**
   * Updates a single environment variable in a file
   * @param filePath - Path to the environment file
   * @param envVariable - Environment variable name
   * @param value - New value for the variable
   */
  public static async updateEnvironmentVariable(
    filePath: string,
    envVariable: string,
    value: string,
  ): Promise<void> {
    // Refactored to use updateEnvironmentVariables internally
    await this.updateEnvironmentVariables(filePath, { [envVariable]: value });
  }

  /**
   * Updates multiple environment variables in a file
   * @param filePath - Path to the environment file
   * @param variables - Object containing variable names and values to update
   */
  public static async updateEnvironmentVariables(
    filePath: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const lines = await this.readEnvironmentFileAsLines(filePath);
    const updatedLines = this.updateMultipleEnvironmentVariables(lines, variables);

    // Pass the actual count of variables that were processed/encrypted
    await this.writeEnvironmentFileLines(filePath, updatedLines, Object.keys(variables).length);
  }

  /**
   * Checks if an environment-specific file exists
   * @param filePath - Path to check
   * @returns Promise resolving to boolean indicating file existence
   */
  public static async doesEnvironmentFileExist(filePath: string): Promise<boolean> {
    return AsyncFileManager.doesFileExist(filePath);
  }

  /**
   * Logs appropriate message when environment file is not found
   * @param filePath - Path that was not found
   * @param environmentStage - Stage name for logging context
   */
  public static logEnvironmentFileNotFound(filePath: string, environmentStage: string): void {
    logger.warn(
      `Environment '${environmentStage}' was specified but its configuration file could not be found at ${filePath}.`,
    );
  }

  /**
   * Converts file content string to array of lines
   * @param content - Raw file content
   * @param filePath - File path for logging (optional)
   * @returns Array of lines
   */
  public static parseFileContentToLines(content: string, filePath?: string): string[] {
    if (!content) {
      if (filePath) {
        logger.warn(`Environment file is empty: ${filePath}`);
      }
      return [];
    }

    // Handle both Windows (\r\n) and Unix (\n) line endings
    return content.split(/\r?\n/);
  }

  /**
   * Converts array of lines to file content string
   * @param lines - Array of lines
   * @returns File content string
   */
  public static linesToFileContent(lines: string[]): string {
    return lines.join("\n");
  }

  /**
   * Extracts all environment variables from the file lines.
   * @param lines - Array of file lines
   * @returns Object containing environment variables
   */
  public static extractEnvironmentVariables(lines: string[]): Record<string, string> {
    const variables: Record<string, string> = {};
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const parsedVariable = this.parseEnvironmentLine(line, lineNumber);

      if (parsedVariable) {
        const [key, value] = parsedVariable;

        if (Object.prototype.hasOwnProperty.call(variables, key)) {
          logger.warn(`Duplicate environment variable '${key}' found at line ${lineNumber}`);
        }

        variables[key] = value;
      }
    }

    return variables;
  }

  /**
   * Parses a single environment file line to extract key-value pairs.
   * @param line - The line to parse
   * @param lineNumber - Optional line number for error reporting
   * @returns Tuple of [key, value] or null if line is invalid
   */
  public static parseEnvironmentLine(line: string, lineNumber?: number): [string, string] | null {
    const trimmedLine = line.trim();

    // Skip empty lines, comments, and lines without equals
    if (!trimmedLine || trimmedLine.startsWith("#") || !trimmedLine.includes("=")) {
      return null;
    }

    const equalIndex = trimmedLine.indexOf("=");
    const key = trimmedLine.substring(0, equalIndex).trim();
    const value = trimmedLine.substring(equalIndex + 1);

    // Validate key format
    if (!key || !CRYPTO_CONSTANTS.VALIDATION.ENV_VAR_KEY_PATTERN.test(key)) {
      const lineInfo = lineNumber ? ` at line ${lineNumber}` : "";
      logger.warn(`Invalid environment variable key format: '${key}'${lineInfo}`);
      return null;
    }

    return [key, value];
  }

  /**
   * Updates multiple environment variables in the provided lines
   * Consolidated method that handles both single and multiple variable updates
   * @param existingLines - Current array of file lines
   * @param variables - Object containing variable names and values to update
   * @returns Updated array of lines
   */
  public static updateMultipleEnvironmentVariables(
    existingLines: string[],
    variables: Record<string, string>,
  ): string[] {
    const lines = [...existingLines];
    const updatedKeys = new Set<string>();

    // First pass: update existing variables
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();

      for (const [envVariable, value] of Object.entries(variables)) {
        if (trimmedLine.startsWith(`${envVariable}=`)) {
          lines[i] = `${envVariable}=${value}`;
          updatedKeys.add(envVariable);
          break; // Move to next line once a match is found
        }
      }
    }

    // Second pass: append variables that weren't found
    for (const [envVariable, value] of Object.entries(variables)) {
      if (!updatedKeys.has(envVariable)) {
        lines.push(`${envVariable}=${value}`);
        logger.debug(`Added new environment variable: ${envVariable}`);
      }
    }

    return lines;
  }

  /**
   * Finds an environment variable by key
   * @param allEnvVariables - Object containing all environment variables
   * @param key - Key to search for
   * @returns The value if found, undefined otherwise
   */
  public static findEnvironmentVariableByKey(
    allEnvVariables: Record<string, string>,
    key: string,
  ): string | undefined {
    return allEnvVariables[key];
  }

  /**
   * Finds all environment variables where the value matches the lookup
   * @param allEnvVariables - Object containing all environment variables
   * @param lookupValue - Value to search for
   * @returns Object containing matching variables
   */
  public static findEnvironmentVariablesByValue(
    allEnvVariables: Record<string, string>,
    lookupValue: string,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(allEnvVariables)) {
      if (value === lookupValue) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Finds all environment variables that match a pattern
   * @param allEnvVariables - Object containing all environment variables
   * @param pattern - Regular expression pattern to match against keys
   * @returns Object containing matching variables
   */
  public static findEnvironmentVariablesByPattern(
    allEnvVariables: Record<string, string>,
    pattern: RegExp,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(allEnvVariables)) {
      if (pattern.test(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Checks if an environment variable exists in the provided variables
   * @param allEnvVariables - Object containing all environment variables
   * @param variableName - Name of the variable to check
   * @returns Boolean indicating if variable exists
   */
  public static hasEnvironmentVariable(
    allEnvVariables: Record<string, string>,
    variableName: string,
  ): boolean {
    return Object.prototype.hasOwnProperty.call(allEnvVariables, variableName);
  }

  /**
   * Gets the value of an environment variable
   * @param allEnvVariables - Object containing all environment variables
   * @param variableName - Name of the variable to get
   * @param defaultValue - Default value if variable doesn't exist
   * @returns Variable value or default value
   */
  public static getEnvironmentVariable(
    allEnvVariables: Record<string, string>,
    variableName: string,
    defaultValue?: string,
  ): string | undefined {
    return allEnvVariables[variableName] ?? defaultValue;
  }
}
