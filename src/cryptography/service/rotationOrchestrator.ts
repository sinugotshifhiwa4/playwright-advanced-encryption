import EnvironmentDetector from "../../configuration/detector/environmentDetector";
import SecretFileManager from "../rotation/manager/secretFileManager";
import ConfigurationResolver from "../../configuration/environment/manager/configurationResolver";
import SecretMetadataManager from "../rotation/manager/secretMetadataManager";
import SecretKeyRotationManager from "../rotation/manager/secretKeyRotationManager";
import SystemInfo from "../../utils/systemInfo";
import CryptoConstants from "../rotation/types/cryptoConstants";
import {
  RotationOptions,
  RotationResult,
  SecretKeyRotationEntry,
  SecretKeyRotationFile,
} from "../rotation/types/rotation.types";
import ErrorHandler from "../../utils/errorHandling/errorHandler";
import logger from "../../utils/logger/loggerManager";

export default class RotationOrchestrator {
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
      performedBy = SystemInfo.getCurrentUsername(),
      forceRotation = false,
      dryRun = false,
    } = options;

    const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
    const currentEnv = EnvironmentDetector.getCurrentEnvironmentStage();
    const filePath = ConfigurationResolver.getCurrentEnvFilePath();

    logger.info(`${dryRun ? "[DRY RUN] " : ""}Starting key rotation for "${currentEnvKey}"...`);

    try {
      // Step 1: Validate rotation is needed
      await SecretKeyRotationManager.validateRotationNecessary(currentEnvKey, forceRotation);

      // Step 2: Get old key before rotation
      const oldKey = await SecretKeyRotationManager.getOldSecretKey(currentEnvKey);
      const oldKeyHash = SecretKeyRotationManager.hashKey(oldKey);

      // Step 3: Decrypt all encrypted variables with old key
      const decryptedVariables = await SecretKeyRotationManager.decryptAllEnvironmentVariables(
        filePath,
        currentEnvKey,
        oldKey,
      );

      if (dryRun) {
        logger.info(
          `[DRY RUN] Would decrypt and re-encrypt ${decryptedVariables.filter((v) => v.wasEncrypted).length} variables`,
        );
        return SecretKeyRotationManager.createDryRunResult(
          currentEnvKey,
          currentEnv,
          decryptedVariables,
          startTime,
        );
      }

      // Step 4: Generate new key
      const newKey = await SecretKeyRotationManager.generateNewSecretKey();
      const newKeyHash = SecretKeyRotationManager.hashKey(newKey);

      // Step 5: Store new key
      await SecretKeyRotationManager.storeNewSecretKey(currentEnvKey, newKey);

      // Step 6: Re-encrypt all variables with new key
      const { variablesProcessed, variablesFailed } =
        await SecretKeyRotationManager.reEncryptAllVariables(
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
      const { performedBy = SystemInfo.getCurrentUsername(), dryRun = false } = options;

      logger.info(`${dryRun ? "[DRY RUN] " : ""}Checking for expired keys...`);

      const expiredKeys = await SecretMetadataManager.getKeysNeedingRotation();

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
      const rotationStatus = await SecretMetadataManager.checkKeyRotationStatus(currentEnvKey);
      const metadata = await SecretMetadataManager.getKeyMetadata(currentEnvKey);

      // Count encrypted variables
      const encryptedCount = await SecretKeyRotationManager.countEncryptedVariables(filePath);

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
      await SecretKeyRotationManager.auditAllSecretKeys();
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
        performedBy = SystemInfo.getCurrentUsername(),
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

  // ==================== PRIVATE TRACKING ====================

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
      await SecretMetadataManager.trackSecretKey(keyName, environment, {
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

  // ==================== PRIVATE FILE OPERATIONS ====================

  private static async loadRotationHistory(): Promise<SecretKeyRotationFile> {
    const filePath = SecretFileManager.getFilePath(CryptoConstants.ROTATION_FILE);
    return SecretFileManager.loadJsonFile<SecretKeyRotationFile>(filePath, {
      rotations: [],
      lastRotation: new Date().toISOString(),
    });
  }

  private static async saveRotationHistory(data: SecretKeyRotationFile): Promise<void> {
    const filePath = SecretFileManager.getFilePath(CryptoConstants.ROTATION_FILE);
    await SecretFileManager.saveJsonFile(filePath, data);
  }
}
