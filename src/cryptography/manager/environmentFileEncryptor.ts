import { CryptoService } from "../service/cryptoService";
import { SyncFileManager } from "../../utils/fileManager/syncFileManager";
import StagesFileManager from "../../configuration/environment/manager/stagesFileManager";
import { CRYPTO_CONSTANTS } from "../types/crypto.config";
import ConfigurationResolver from "../../configuration/environment/manager/configurationResolver";
import ErrorHandler from "../../utils/errorHandling/errorHandler";
import logger from "../../utils/logger/loggerManager";

export class EnvironmentFileEncryptor {
  public async encryptEnvironmentVariables(envVariables?: string[]): Promise<void> {
    return this.handleError(
      async () => {
        const filePath = ConfigurationResolver.getCurrentEnvFilePath();
        const secretKey = ConfigurationResolver.getCurrentEnvSecretKey();
        await this.encryptAndUpdateEnvironmentVariables(filePath, secretKey, envVariables);
      },
      "encryptEnvironmentVariables",
      "Failed to encrypt environment variables",
    );
  }

  private async encryptAndUpdateEnvironmentVariables(
    filePath: string,
    secretKeyVariable: string,
    envVariables?: string[],
  ): Promise<void> {
    const envFileLines = await StagesFileManager.readEnvironmentFileAsLines(filePath);
    const allEnvVariables = StagesFileManager.extractEnvironmentVariables(envFileLines);

    if (Object.keys(allEnvVariables).length === 0) {
      logger.warn(`No environment variables found in ${filePath}`);
      return;
    }

    const variablesToEncrypt = this.resolveVariablesToEncrypt(allEnvVariables, envVariables);

    if (Object.keys(variablesToEncrypt).length === 0) {
      return;
    }

    const { updatedLines, encryptedCount } = await this.encryptVariableValuesInFileLines(
      envFileLines,
      variablesToEncrypt,
      secretKeyVariable,
    );

    if (encryptedCount > 0) {
      await StagesFileManager.writeEnvironmentFileLines(filePath, updatedLines);
    }

    await this.logEncryptionSummary(
      filePath,
      Object.keys(variablesToEncrypt).length,
      encryptedCount,
    );
  }

  /**
   * Determines which environment variables should be encrypted based on the provided filter.
   * Filters out variables with empty values to prevent them from being counted.
   */
  private resolveVariablesToEncrypt(
    allEnvVariables: Record<string, string>,
    envVariables?: string[],
  ): Record<string, string> {
    let candidateVariables: Record<string, string>;

    if (!envVariables?.length) {
      candidateVariables = { ...allEnvVariables };
    } else {
      candidateVariables = {};
      const notFoundVariables: string[] = [];

      for (const lookupValue of envVariables) {
        const trimmedLookupValue = this.getTrimmedValue(lookupValue);
        if (!trimmedLookupValue) {
          continue;
        }

        const foundValue = StagesFileManager.findEnvironmentVariableByKey(
          allEnvVariables,
          trimmedLookupValue,
        );

        if (foundValue === undefined) {
          notFoundVariables.push(trimmedLookupValue);
        } else {
          candidateVariables[trimmedLookupValue] = foundValue;
        }
      }

      this.logIfNotEmpty(notFoundVariables, (vars) =>
        logger.warn(`Environment variables not found: ${this.joinVariables(vars)}`),
      );
    }

    return this.filterEncryptableVariables(candidateVariables);
  }

  /**
   * Filters out variables that cannot or should not be encrypted.
   * This includes variables with empty values and already encrypted values.
   */
  private filterEncryptableVariables(
    candidateVariables: Record<string, string>,
  ): Record<string, string> {
    const variablesToEncrypt: Record<string, string> = {};
    const alreadyEncrypted: string[] = [];
    const emptyValues: string[] = [];

    for (const [key, value] of Object.entries(candidateVariables)) {
      const trimmedValue = this.getTrimmedValue(value);

      if (!trimmedValue) {
        emptyValues.push(key);
        continue;
      }

      if (this.isAlreadyEncrypted(trimmedValue)) {
        alreadyEncrypted.push(key);
        continue;
      }

      variablesToEncrypt[key] = value;
    }

    // Separate logging for different skip reasons
    this.logIfNotEmpty(alreadyEncrypted, (vars) =>
      logger.info(`Variables already encrypted — skipping: ${this.joinVariables(vars)}`),
    );

    this.logIfNotEmpty(emptyValues, (vars) =>
      logger.warn(`Variables with empty values — skipping: ${this.joinVariables(vars)}`),
    );

    // Summary of what will be processed
    this.logIfNotEmpty(Object.keys(variablesToEncrypt), (vars) =>
      logger.info(`Variables ready for encryption: ${this.joinVariables(vars)}`),
    );

    return variablesToEncrypt;
  }

  /**
   * Encrypts the values of specified environment variables in the file lines.
   * Now only processes variables that are actually eligible for encryption.
   */
  private async encryptVariableValuesInFileLines(
    envFileLines: string[],
    variablesToEncrypt: Record<string, string>,
    secretKeyVariable: string,
  ): Promise<{ updatedLines: string[]; encryptedCount: number }> {
    return this.handleError(
      async () => {
        let updatedLines = [...envFileLines];
        let encryptedCount = 0;
        const failedVariables: string[] = [];
        const encryptedVariables: Record<string, string> = {};

        for (const [key, value] of Object.entries(variablesToEncrypt)) {
          try {
            const encryptedValue = await CryptoService.encrypt(
              this.getTrimmedValue(value) || value,
              secretKeyVariable,
            );
            encryptedVariables[key] = encryptedValue;
            encryptedCount++;
            logger.debug(`Successfully encrypted variable: ${key}`);
          } catch (encryptionError) {
            failedVariables.push(key);
            logger.error(`Failed to encrypt variable '${key}': ${encryptionError}`);
            throw encryptionError;
          }
        }

        // Update all encrypted variables at once using the consolidated method
        updatedLines = StagesFileManager.updateMultipleEnvironmentVariables(
          updatedLines,
          encryptedVariables,
        );

        this.logIfNotEmpty(failedVariables, (vars) =>
          logger.warn(`Failed to encrypt variables: ${this.joinVariables(vars)}`),
        );

        return { updatedLines, encryptedCount };
      },
      "encryptVariableValuesInFileLines",
      "Failed to encrypt variable values",
    );
  }

  /**
   * Checks if a value is already encrypted by looking for the encryption prefix.
   */
  public isAlreadyEncrypted(value: string): boolean {
    return !!value && value.startsWith(CRYPTO_CONSTANTS.FORMAT.PREFIX);
  }

  /**
   * Logs the summary of the encryption process.
   */
  private async logEncryptionSummary(
    filePath: string,
    totalVariables: number,
    encryptedCount: number,
  ): Promise<void> {
    return this.handleError(
      async () => {
        const skippedCount = totalVariables - encryptedCount;

        if (encryptedCount === 0) {
          logger.info(`No variables needed encryption in ${filePath}`);
        } else {
          const summary = `Encryption completed. ${encryptedCount} variables processed from '${this.getStageFileName(filePath)}'`;
          const details = skippedCount > 0 ? `, ${skippedCount} skipped` : "";
          logger.info(`${summary}${details}`);
        }
      },
      "logEncryptionSummary",
      `Failed to log encryption summary for ${filePath}`,
    );
  }

  // ===== HELPER METHODS (NEW) =====

  /**
   * Centralized error handling wrapper
   */
  private async handleError<T>(
    operation: () => Promise<T>,
    methodName: string,
    errorMessage: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      ErrorHandler.captureError(error, methodName, errorMessage);
      throw error;
    }
  }

  /**
   * Safely trims a value, handling null/undefined
   */
  private getTrimmedValue(value: string | null | undefined): string {
    return value?.trim() || "";
  }

  /**
   * Joins array of variable names with comma separator
   */
  private joinVariables(variables: string[]): string {
    return variables.join(", ");
  }

  /**
   * Logs only if array is not empty
   */
  private logIfNotEmpty(items: string[], logFn: (items: string[]) => void): void {
    if (items.length > 0) {
      logFn(items);
    }
  }

  private getStageFileName(filePath: string): string {
    return SyncFileManager.getBaseNameWithExtension(filePath);
  }
}
