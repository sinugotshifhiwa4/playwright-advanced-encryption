import SecretKeyFileManager from "./secretKeyFileManager";
import { SecretKeyRotationEntry, SecretKeyRotationFile } from "./rotation.type";
import { RotationOptions, RotationResult, DecryptedVariable } from "../rotation/rotation.type";
import RotationConstants from "./rotationConstants";
import ConfigurationResolver from "../../../configuration/environment/manager/configurationResolver";
import SecretKeyMetadataManager from "./secretKeyMetadataManager";
import StagesFileManager from "../../../configuration/environment/manager/stagesFileManager";
import { CryptoEngine } from "../../engine/cryptoEngine";
import EnvironmentDetector from "../../../configuration/detector/environmentDetector";
import SecretFilePathResolver from "../../../configuration/environment/manager/filePath/secretFilePathResolver";
import SecretFileManager from "../../../configuration/environment/manager/secretFileManager";
import SecureKeyGenerator from "../../key/secureKeyGenerator";
import KeyExpirationCalculator from "./keyExpirationCalculator";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";
import crypto from "crypto";
import { getCurrentUser } from "./getSystemUser";

export default class SecretKeyRotationManager {
  // ==================== PUBLIC ROTATION OPERATIONS ====================

  /**
   * Performs complete key rotation with decryption and re-encryption.
   */
  public static async rotateKeyWithReEncryption(
    options: RotationOptions = {},
  ): Promise<RotationResult> {
    const startTime = Date.now();
    const {
      rotationReason = "scheduled",
      rotationDays = 90,
      performedBy = getCurrentUser(),
      forceRotation = false,
      dryRun = false,
    } = options;

    const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
    const currentEnv = EnvironmentDetector.getCurrentEnvironmentStage();
    const filePath = ConfigurationResolver.getCurrentEnvFilePath();

    logger.info(`${dryRun ? "[DRY RUN] " : ""}Starting key rotation for "${currentEnvKey}"...`);

    try {
      // Step 1: Validate rotation is needed
      await this.validateRotationNecessary(currentEnvKey, forceRotation);

      // Step 2: Get old key before rotation
      const oldKey = await this.getOldSecretKey(currentEnvKey);
      const oldKeyHash = this.hashKey(oldKey);

      // Step 3: Decrypt all encrypted variables with old key
      const decryptedVariables = await this.decryptAllEnvironmentVariables(
        filePath,
        currentEnvKey,
        oldKey,
      );

      if (dryRun) {
        logger.info(
          `[DRY RUN] Would decrypt and re-encrypt ${decryptedVariables.filter((v) => v.wasEncrypted).length} variables`,
        );
        return this.createDryRunResult(currentEnvKey, currentEnv, decryptedVariables, startTime);
      }

      // Step 4: Generate new key
      const newKey = SecureKeyGenerator.generateBase64SecretKey();
      const newKeyHash = this.hashKey(newKey);

      // Step 5: Store new key
      await this.storeNewSecretKey(currentEnvKey, newKey);

      // Step 6: Re-encrypt all variables with new key
      const { variablesProcessed, variablesFailed } = await this.reEncryptAllVariables(
        filePath,
        decryptedVariables,
        currentEnvKey,
        newKey,
      );

      // Step 7: Update tracking metadata
      await this.updateRotationTracking(
        currentEnvKey,
        currentEnv,
        oldKeyHash,
        newKeyHash,
        rotationReason,
        rotationDays,
        performedBy,
        true,
      );

      const duration = Date.now() - startTime;

      logger.info(
        `✓ Key rotation completed successfully for "${currentEnvKey}" ` +
          `(${variablesProcessed} variables re-encrypted in ${duration}ms)`,
      );

      return {
        success: true,
        keyName: currentEnvKey,
        environment: currentEnv,
        variablesProcessed,
        variablesFailed,
        oldKeyHash,
        newKeyHash,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failed rotation
      await this.updateRotationTracking(
        currentEnvKey,
        currentEnv,
        undefined,
        undefined,
        rotationReason,
        rotationDays,
        performedBy,
        false,
      );

      ErrorHandler.captureError(
        error,
        "rotateKeyWithReEncryption",
        `Failed to rotate key "${currentEnvKey}"`,
      );

      return {
        success: false,
        keyName: currentEnvKey,
        environment: currentEnv,
        variablesProcessed: 0,
        variablesFailed: [],
        duration,
      };
    }
  }

  /**
   * Rotates all expired keys across all environments.
   */
  public static async rotateAllExpiredKeys(
    options: {
      performedBy?: string;
      dryRun?: boolean;
    } = {},
  ): Promise<RotationResult[]> {
    try {
      const { performedBy = getCurrentUser(), dryRun = false } = options;

      logger.info(`${dryRun ? "[DRY RUN] " : ""}Checking for expired keys...`);

      const expiredKeys = await SecretKeyMetadataManager.getKeysNeedingRotation();

      if (expiredKeys.length === 0) {
        logger.info("No expired keys found.");
        return [];
      }

      logger.warn(`Found ${expiredKeys.length} expired key(s) that need rotation`);

      const results: RotationResult[] = [];

      for (const keyMetadata of expiredKeys) {
        logger.info(`Processing expired key: ${keyMetadata.keyName} (${keyMetadata.environment})`);

        const result = await this.rotateKeyWithReEncryption({
          rotationReason: "expired",
          performedBy,
          forceRotation: true,
          dryRun,
        });

        results.push(result);
      }

      const successCount = results.filter((r) => r.success).length;
      logger.info(
        `${dryRun ? "[DRY RUN] " : ""}Batch rotation complete: ${successCount}/${results.length} successful`,
      );

      return results;
    } catch (error) {
      ErrorHandler.captureError(error, "rotateAllExpiredKeys", "Failed to rotate expired keys");
      throw error;
    }
  }

  // ==================== PUBLIC STATUS & AUDIT OPERATIONS ====================

  /**
   * Checks if key rotation is needed and returns recommendation.
   */
  public static async checkRotationStatus(): Promise<{
    needsRotation: boolean;
    recommendation: string;
    details: {
      daysUntilExpiration: number;
      status: string;
      encryptedVariableCount: number;
      metadata?: {
        createdAt: string;
        rotationCount: number;
        lastRotatedAt?: string;
      };
    };
  }> {
    try {
      const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
      const filePath = ConfigurationResolver.getCurrentEnvFilePath();

      // Check expiration status
      const rotationStatus = await SecretKeyMetadataManager.checkKeyRotationStatus(currentEnvKey);
      const metadata = await SecretKeyMetadataManager.getKeyMetadata(currentEnvKey);

      // Count encrypted variables
      const encryptedCount = await this.countEncryptedVariables(filePath);

      let recommendation = "";
      if (rotationStatus.needsRotation) {
        recommendation = `🔴 URGENT: Key expired ${Math.abs(rotationStatus.daysUntilExpiration)} days ago. Rotate immediately.`;
      } else if (rotationStatus.status === "expiring_soon") {
        recommendation = `🟡 WARNING: Key expires in ${rotationStatus.daysUntilExpiration} days. Plan rotation soon.`;
      } else {
        recommendation = `🟢 OK: Key is valid for ${rotationStatus.daysUntilExpiration} more days.`;
      }

      return {
        needsRotation: rotationStatus.needsRotation,
        recommendation,
        details: {
          daysUntilExpiration: rotationStatus.daysUntilExpiration,
          status: rotationStatus.status,
          encryptedVariableCount: encryptedCount,
          metadata: metadata
            ? {
                createdAt: metadata.createdAt,
                rotationCount: metadata.rotationCount,
                lastRotatedAt: metadata.lastRotatedAt,
              }
            : undefined,
        },
      };
    } catch (error) {
      ErrorHandler.captureError(error, "checkRotationStatus", "Failed to check rotation status");
      throw error;
    }
  }

  /**
   * Checks all tracked keys and reports their rotation status.
   */
  public static async auditAllSecretKeys(): Promise<void> {
    try {
      logger.info("=== SECRET KEY ROTATION AUDIT ===");

      const keysNeedingRotation = await SecretKeyMetadataManager.getKeysNeedingRotation();
      const keysExpiringSoon = await SecretKeyMetadataManager.getKeysExpiringSoon();
      const allKeys = await SecretKeyMetadataManager.getAllTrackedKeys();

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

  // ==================== PUBLIC HISTORY OPERATIONS ====================

  /**
   * Gets rotation history for the current secret key.
   */
  public static async getRotationHistory(limit: number = 10): Promise<
    {
      keyName: string;
      rotationDate: string;
      rotationReason: string;
      performedBy?: string;
      success: boolean;
    }[]
  > {
    try {
      const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
      const history = await this.getKeyRotationHistory(currentEnvKey, limit);

      return history.map((entry) => ({
        keyName: entry.keyName,
        rotationDate: entry.rotationDate,
        rotationReason: entry.rotationReason,
        performedBy: entry.performedBy,
        success: entry.success,
      }));
    } catch (error) {
      ErrorHandler.captureError(error, "getRotationHistory", "Failed to get rotation history");
      throw error;
    }
  }

  /**
   * Gets rotation history for a specific key.
   */
  public static async getKeyRotationHistory(
    keyName: string,
    limit?: number,
  ): Promise<SecretKeyRotationEntry[]> {
    try {
      const rotationFile = await this.loadRotationHistory();
      const keyRotations = rotationFile.rotations.filter((r) => r.keyName === keyName);

      return limit ? keyRotations.slice(0, limit) : keyRotations;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getKeyRotationHistory",
        `Failed to get rotation history for key "${keyName}"`,
      );
      return [];
    }
  }

  /**
   * Records a key rotation event in the rotation history.
   */
  public static async recordRotation(
    keyName: string,
    environment: string,
    options: {
      rotationReason?: "scheduled" | "manual" | "compromised" | "expired";
      previousKeyHash?: string;
      newKeyHash?: string;
      performedBy?: string;
      success?: boolean;
    } = {},
  ): Promise<void> {
    try {
      const {
        rotationReason = "scheduled",
        previousKeyHash,
        newKeyHash,
        performedBy = getCurrentUser(),
        success = true,
      } = options;

      const rotationFile = await this.loadRotationHistory();
      const now = new Date().toISOString();

      const rotationEntry: SecretKeyRotationEntry = {
        keyName,
        environment,
        rotationDate: now,
        previousKeyHash,
        newKeyHash,
        rotationReason,
        performedBy,
        success,
      };

      rotationFile.rotations.unshift(rotationEntry);
      rotationFile.lastRotation = now;

      await this.saveRotationHistory(rotationFile);

      logger.info(
        `Rotation recorded for key "${keyName}" - Reason: ${rotationReason}, Success: ${success}`,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "recordRotation",
        `Failed to record rotation for key "${keyName}"`,
      );
      throw error;
    }
  }

  // ==================== PRIVATE VALIDATION ====================

  /**
   * Validates that rotation is necessary or forced.
   */
  private static async validateRotationNecessary(keyName: string, force: boolean): Promise<void> {
    if (force) {
      logger.info("Force rotation enabled - skipping validation");
      return;
    }

    const rotationStatus = await SecretKeyMetadataManager.checkKeyRotationStatus(keyName);

    if (!rotationStatus.needsRotation && rotationStatus.status === "active") {
      const daysRemaining = rotationStatus.daysUntilExpiration;
      throw new Error(
        `Key "${keyName}" does not need rotation yet (${daysRemaining} days remaining). ` +
          `Use forceRotation: true to rotate anyway.`,
      );
    }
  }

  // ==================== PRIVATE KEY OPERATIONS ====================

  /**
   * Retrieves the current/old secret key before rotation.
   */
  private static async getOldSecretKey(keyName: string): Promise<string> {
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
   * Stores the newly generated secret key.
   */
  private static async storeNewSecretKey(keyName: string, newKey: string): Promise<void> {
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
  private static hashKey(key: string): string {
    try {
      return crypto.createHash("sha256").update(key, "utf8").digest("hex").substring(0, 16);
    } catch (error) {
      ErrorHandler.captureError(error, "hashKey", "Failed to hash key for audit purposes");
      throw error;
    }
  }

  // ==================== PRIVATE DECRYPTION/ENCRYPTION ====================

  /**
   * Decrypts all encrypted environment variables using the old key.
   */
  private static async decryptAllEnvironmentVariables(
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
  private static async reEncryptAllVariables(
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
  private static async decryptWithKey(encryptedData: string, secretKey: string): Promise<string> {
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
  private static async encryptWithKey(value: string, secretKey: string): Promise<string> {
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

  // ==================== PRIVATE TRACKING & UTILITIES ====================

  /**
   * Updates rotation tracking metadata.
   */
  private static async updateRotationTracking(
    keyName: string,
    environment: string,
    oldKeyHash: string | undefined,
    newKeyHash: string | undefined,
    rotationReason: "scheduled" | "manual" | "compromised" | "expired",
    rotationDays: number,
    performedBy: string,
    success: boolean,
  ): Promise<void> {
    try {
      await SecretKeyMetadataManager.trackSecretKey(keyName, environment, {
        rotationDays,
        isRotation: true,
        algorithm: "base64",
        keyLength: 256,
        performedBy,
      });

      await this.recordRotation(keyName, environment, {
        rotationReason,
        previousKeyHash: oldKeyHash,
        newKeyHash,
        performedBy,
        success,
      });

      logger.debug(`Rotation tracking updated for "${keyName}"`);
    } catch (error) {
      logger.error(`Failed to update rotation tracking: ${error}`);
      // Don't throw - tracking failure shouldn't break the rotation
    }
  }

  /**
   * Counts encrypted variables in the environment file.
   */
  private static async countEncryptedVariables(filePath: string): Promise<number> {
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
  private static createDryRunResult(
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

  // ==================== PRIVATE FILE OPERATIONS ====================

  private static async loadRotationHistory(): Promise<SecretKeyRotationFile> {
    const filePath = SecretKeyFileManager.getFilePath(RotationConstants.ROTATION_FILE);
    return SecretKeyFileManager.loadJsonFile<SecretKeyRotationFile>(filePath, {
      rotations: [],
      lastRotation: new Date().toISOString(),
    });
  }

  private static async saveRotationHistory(data: SecretKeyRotationFile): Promise<void> {
    const filePath = SecretKeyFileManager.getFilePath(RotationConstants.ROTATION_FILE);
    await SecretKeyFileManager.saveJsonFile(filePath, data);
  }
}
