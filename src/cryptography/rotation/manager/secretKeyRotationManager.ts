import crypto from "crypto";
import SecureKeyGenerator from "../../key/secureKeyGenerator";
import { CryptoEngine } from "../../engine/cryptoEngine";
import SecretMetadataManager from "./secretMetadataManager";
import SecretFilePathResolver from "../../../configuration/environment/manager/filePath/secretFilePathResolver";
import SecretFileManager from "../../../configuration/environment/manager/secretFileManager";
import StagesFileManager from "../../../configuration/environment/manager/stagesFileManager";
import KeyExpirationCalculator from "../utils/keyExpirationCalculator";
import { RotationResult } from "../types/rotation.types";
import { DecryptedVariable } from "../types/decryptedVariable.types";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";

export default class SecretKeyRotationManager {
  // ==================== VALIDATION ====================

  /**
   * Validates that rotation is necessary or forced.
   */
  public static async validateRotationNecessary(keyName: string, force: boolean): Promise<void> {
    if (force) {
      logger.info("Force rotation enabled - skipping validation");
      return;
    }

    const rotationStatus = await SecretMetadataManager.checkKeyRotationStatus(keyName);

    if (!rotationStatus.needsRotation && rotationStatus.status === "active") {
      const daysRemaining = rotationStatus.daysUntilExpiration;
      throw new Error(
        `Key "${keyName}" does not need rotation yet (${daysRemaining} days remaining). ` +
          `Use forceRotation: true to rotate anyway.`,
      );
    }
  }

  // ==================== KEY OPERATIONS ====================

  /**
   * Retrieves the current/old secret key before rotation.
   */
  public static async getOldSecretKey(keyName: string): Promise<string> {
    try {
      const secretFilePath = SecretFilePathResolver.getSecretFilePath();
      const oldKey = await SecretFileManager.getKeyValue(secretFilePath, keyName);

      if (!oldKey) {
        throw new Error(`Secret key "${keyName}" not found in secret file`);
      }

      logger.debug(`Retrieved old key for "${keyName}"`);
      return oldKey;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getOldSecretKey",
        `Failed to retrieve old key "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Generates a new secret key.
   */
  public static async generateNewSecretKey(): Promise<string> {
    try {
      return SecureKeyGenerator.generateBase64SecretKey();
    } catch (error) {
      ErrorHandler.captureError(error, "generateNewSecretKey", "Failed to generate new secret key");
      throw error;
    }
  }

  /**
   * Stores the newly generated secret key.
   */
  public static async storeNewSecretKey(keyName: string, newKey: string): Promise<void> {
    try {
      const secretFilePath = SecretFilePathResolver.getSecretFilePath();

      await SecretFileManager.storeKeyInFile(secretFilePath, keyName, newKey, {
        skipIfExists: false, // Force overwrite
      });

      await SecretFileManager.ensureSecretKeyExists(keyName);

      logger.info(`New key stored successfully for "${keyName}"`);
    } catch (error) {
      ErrorHandler.captureError(error, "storeNewSecretKey", `Failed to store new key "${keyName}"`);
      throw error;
    }
  }

  /**
   * Creates SHA-256 hash of a key for audit purposes.
   */
  public static hashKey(key: string): string {
    try {
      return crypto.createHash("sha256").update(key, "utf8").digest("hex").substring(0, 16);
    } catch (error) {
      ErrorHandler.captureError(error, "hashKey", "Failed to hash key for audit purposes");
      throw error;
    }
  }

  // ==================== DECRYPTION/ENCRYPTION ====================

  /**
   * Decrypts all encrypted environment variables using the old key.
   */
  public static async decryptAllEnvironmentVariables(
    filePath: string,
    keyName: string,
    oldKey: string,
  ): Promise<DecryptedVariable[]> {
    try {
      logger.info(`Decrypting variables from "${filePath}" with old key...`);

      const envFileLines = await StagesFileManager.readEnvironmentFileAsLines(filePath);
      const allVariables = StagesFileManager.extractEnvironmentVariables(envFileLines);

      const decryptedVariables: DecryptedVariable[] = [];
      const encryptedVars: string[] = [];
      const failedVars: string[] = [];

      for (const [key, value] of Object.entries(allVariables)) {
        const trimmedValue = value.trim();

        if (!trimmedValue || !CryptoEngine.isEncrypted(trimmedValue)) {
          // Not encrypted - keep as is
          decryptedVariables.push({
            key,
            originalValue: value,
            decryptedValue: value,
            wasEncrypted: false,
          });
          continue;
        }

        try {
          encryptedVars.push(key);
          const decryptedValue = await this.decryptWithKey(trimmedValue, oldKey);

          decryptedVariables.push({
            key,
            originalValue: value,
            decryptedValue,
            wasEncrypted: true,
          });

          logger.debug(`✓ Decrypted: ${key}`);
        } catch (decryptError) {
          failedVars.push(key);
          logger.error(`✗ Failed to decrypt "${key}": ${decryptError}`);
          throw new Error(`Failed to decrypt variable "${key}". Cannot proceed with rotation.`);
        }
      }

      logger.info(
        `Decryption complete: ${encryptedVars.length} encrypted variables processed, ` +
          `${failedVars.length} failed`,
      );

      if (failedVars.length > 0) {
        throw new Error(
          `Failed to decrypt ${failedVars.length} variable(s): ${failedVars.join(", ")}`,
        );
      }

      return decryptedVariables;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "decryptAllEnvironmentVariables",
        "Failed to decrypt environment variables",
      );
      throw error;
    }
  }

  /**
   * Re-encrypts all variables with the new key and updates the file.
   */
  public static async reEncryptAllVariables(
    filePath: string,
    decryptedVariables: DecryptedVariable[],
    keyName: string,
    newKey: string,
  ): Promise<{ variablesProcessed: number; variablesFailed: string[] }> {
    try {
      logger.info(`Re-encrypting variables with new key...`);

      const variablesToEncrypt = decryptedVariables.filter((v) => v.wasEncrypted);
      const encryptedVariables: Record<string, string> = {};
      const failedVariables: string[] = [];

      for (const variable of variablesToEncrypt) {
        try {
          const encryptedValue = await this.encryptWithKey(variable.decryptedValue, newKey);

          encryptedVariables[variable.key] = encryptedValue;
          logger.debug(`✓ Re-encrypted: ${variable.key}`);
        } catch (encryptError) {
          failedVariables.push(variable.key);
          logger.error(`✗ Failed to re-encrypt "${variable.key}": ${encryptError}`);
        }
      }

      if (failedVariables.length > 0) {
        throw new Error(
          `Failed to re-encrypt ${failedVariables.length} variable(s): ${failedVariables.join(", ")}`,
        );
      }

      // Update all re-encrypted variables in the file
      const envFileLines = await StagesFileManager.readEnvironmentFileAsLines(filePath);
      const updatedLines = StagesFileManager.updateMultipleEnvironmentVariables(
        envFileLines,
        encryptedVariables,
      );

      await StagesFileManager.writeEnvironmentFileLines(filePath, updatedLines);

      logger.info(
        `Re-encryption complete: ${Object.keys(encryptedVariables).length} variables processed`,
      );

      return {
        variablesProcessed: Object.keys(encryptedVariables).length,
        variablesFailed: failedVariables,
      };
    } catch (error) {
      ErrorHandler.captureError(error, "reEncryptAllVariables", "Failed to re-encrypt variables");
      throw error;
    }
  }

  /**
   * Decrypts a value using a provided key (bypasses environment lookup).
   */
  public static async decryptWithKey(encryptedData: string, secretKey: string): Promise<string> {
    try {
      CryptoEngine.validateSecretKey(secretKey);
      CryptoEngine.validateInputs(encryptedData, secretKey, "decrypt");

      const { salt, iv, cipherText, receivedHmac } = CryptoEngine.parseEncryptedData(encryptedData);
      const { encryptionKey, hmacKey } = await CryptoEngine.deriveKeysWithArgon2(secretKey, salt);

      await CryptoEngine.verifyHMAC(salt, iv, cipherText, receivedHmac, hmacKey);

      const decryptedBuffer = await CryptoEngine.performDecryption(iv, encryptionKey, cipherText);

      return new TextDecoder().decode(new Uint8Array(decryptedBuffer));
    } catch (error) {
      ErrorHandler.captureError(error, "decryptWithKey", "Failed to decrypt with provided key");
      throw error;
    }
  }

  /**
   * Encrypts a value using a provided key (bypasses environment lookup).
   */
  public static async encryptWithKey(value: string, secretKey: string): Promise<string> {
    try {
      CryptoEngine.validateSecretKey(secretKey);
      CryptoEngine.validateInputs(value, secretKey, "encrypt");

      const { salt, iv, encryptionKey, hmacKey } =
        await CryptoEngine.generateEncryptionComponents(secretKey);

      return await CryptoEngine.createEncryptedPayload(value, salt, iv, encryptionKey, hmacKey);
    } catch (error) {
      ErrorHandler.captureError(error, "encryptWithKey", "Failed to encrypt with provided key");
      throw error;
    }
  }

  // ==================== TRACKING & UTILITIES ====================

  /**
   * Counts encrypted variables in the environment file.
   */
  public static async countEncryptedVariables(filePath: string): Promise<number> {
    try {
      const envFileLines = await StagesFileManager.readEnvironmentFileAsLines(filePath);
      const allVariables = StagesFileManager.extractEnvironmentVariables(envFileLines);

      return Object.values(allVariables).filter((value) => CryptoEngine.isEncrypted(value.trim()))
        .length;
    } catch (error) {
      logger.error(`Failed to count encrypted variables: ${error}`);
      return 0;
    }
  }

  /**
   * Creates dry run result without performing actual rotation.
   */
  public static createDryRunResult(
    keyName: string,
    environment: string,
    decryptedVariables: DecryptedVariable[],
    startTime: number,
  ): RotationResult {
    const encryptedCount = decryptedVariables.filter((v) => v.wasEncrypted).length;

    return {
      success: true,
      keyName,
      environment,
      variablesProcessed: encryptedCount,
      variablesFailed: [],
      duration: Date.now() - startTime,
    };
  }

  // ==================== AUDIT OPERATIONS ====================

  /**
   * Checks all tracked keys and reports their rotation status.
   */
  public static async auditAllSecretKeys(): Promise<void> {
    try {
      logger.info("=== SECRET KEY ROTATION AUDIT ===");

      const keysNeedingRotation = await SecretMetadataManager.getKeysNeedingRotation();
      const keysExpiringSoon = await SecretMetadataManager.getKeysExpiringSoon();
      const allKeys = await SecretMetadataManager.getAllTrackedKeys();

      if (keysNeedingRotation.length > 0) {
        logger.warn(`\n🔴 EXPIRED KEYS (${keysNeedingRotation.length}):`);
        for (const key of keysNeedingRotation) {
          const daysExpired = Math.abs(
            KeyExpirationCalculator.calculateDaysUntilExpiration(key.expiresAt),
          );
          logger.warn(`  - ${key.keyName} (${key.environment}): EXPIRED ${daysExpired} days ago`);
        }
      }

      if (keysExpiringSoon.length > 0) {
        logger.info(`\n🟡 EXPIRING SOON (${keysExpiringSoon.length}):`);
        for (const key of keysExpiringSoon) {
          const daysRemaining = KeyExpirationCalculator.calculateDaysUntilExpiration(key.expiresAt);
          logger.info(`  - ${key.keyName} (${key.environment}): ${daysRemaining} days remaining`);
        }
      }

      const activeKeys = allKeys.filter((k) => k.status === "active");
      if (activeKeys.length > 0) {
        logger.info(`\n🟢 ACTIVE KEYS (${activeKeys.length}):`);
        for (const key of activeKeys) {
          const daysRemaining = KeyExpirationCalculator.calculateDaysUntilExpiration(key.expiresAt);
          logger.info(
            `  - ${key.keyName} (${key.environment}): ${daysRemaining} days remaining ` +
              `(Rotated ${key.rotationCount} time(s))`,
          );
        }
      }

      if (allKeys.length === 0) {
        logger.info("\nNo secret keys are currently tracked.");
      } else {
        logger.info(`\nTotal tracked keys: ${allKeys.length}`);
      }
    } catch (error) {
      ErrorHandler.captureError(error, "auditAllSecretKeys", "Failed to audit secret keys");
      throw error;
    }
  }
}
