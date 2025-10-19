import { EnvironmentFileEncryptor } from "../manager/environmentFileEncryptor";
import ConfigurationResolver from "../../configuration/environment/manager/configurationResolver";
import SecretFileManager from "../../configuration/environment/manager/secretFileManager";
import SecureKeyGenerator from "../key/secureKeyGenerator";
import ErrorHandler from "../../utils/errorHandling/errorHandler";
import SecretKeyTracker from "../../cryptography/key/rotation/secretKeyTracker";
import EnvironmentDetector from "../../configuration/detector/environmentDetector";
import { SecretKeyRotationManager } from "../key/rotation/secretKeyRotationManager";
import logger from "../../utils/logger/loggerManager";

/**
 * CryptoCoordinator - Simplified coordinator for basic crypto operations
 *
 * Responsibilities:
 * - Generate and store new secret keys
 * - Encrypt environment variables
 *
 * For key rotation, audits, and advanced operations, use SecretKeyRotationManager
 */
export class CryptoCoordinator {
  private environmentFileEncryptor: EnvironmentFileEncryptor;
  private secretKeyRotationManager: SecretKeyRotationManager;
  private readonly currentEnvironmentStage = EnvironmentDetector.getCurrentEnvironmentStage();

  constructor(
    environmentFileEncryptor: EnvironmentFileEncryptor,
    secretKeyRotationManager: SecretKeyRotationManager,
  ) {
    this.environmentFileEncryptor = environmentFileEncryptor;
    this.secretKeyRotationManager = secretKeyRotationManager;
  }

  /**
   * Generates and stores a new secret key with tracking
   * @param options - Optional parameters
   * @param options.rotationDays - Number of days before key rotation (default: 90)
   * @param options.performedBy - Who performed the operation (default: "system")
   * @returns The generated secret key
   */
  public async generateAndStoreSecretKey(
    options: {
      rotationDays?: number;
      performedBy?: string;
    } = {},
  ): Promise<string> {
    try {
      const { rotationDays = 90, performedBy = "system" } = options;
      const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
      const currentEnv = this.currentEnvironmentStage;

      // Check if key already exists and if rotation is needed
      const existingMetadata = await SecretKeyTracker.getKeyMetadata(currentEnvKey);
      if (existingMetadata) {
        const rotationStatus = await SecretKeyTracker.checkKeyRotationStatus(currentEnvKey);

        if (rotationStatus.needsRotation) {
          logger.warn(
            `Existing key "${currentEnvKey}" has expired ${Math.abs(rotationStatus.daysUntilExpiration)} days ago. ` +
              `Consider using SecretKeyRotationManager.rotateKeyWithReEncryption() instead.`,
          );
        } else {
          logger.info(
            `Key "${currentEnvKey}" already exists and is valid for ${rotationStatus.daysUntilExpiration} more days. ` +
              `Skipping generation due to skipIfExists option.`,
          );
        }
      }

      const generatedSecretKey = SecureKeyGenerator.generateBase64SecretKey();

      await SecretFileManager.storeEnvironmentKey(currentEnvKey, generatedSecretKey, {
        skipIfExists: true,
      });

      await SecretFileManager.ensureSecretKeyExists(currentEnvKey);

      // Track the secret key creation (only if it was actually created)
      if (!existingMetadata) {
        await SecretKeyTracker.trackSecretKey(currentEnvKey, currentEnv, {
          rotationDays,
          isRotation: false,
          algorithm: "base64",
          keyLength: 256,
          performedBy,
        });

        logger.info(`Secret key "${currentEnvKey}" generated and tracked successfully`);
      }

      return generatedSecretKey;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "generateSecretKey",
        `Failed to generate secret key "${ConfigurationResolver.getCurrentEnvSecretKey()}"`,
      );
      throw error;
    }
  }

  /**
   * Encrypts environment variables with tracking
   * @param envVariables - Optional array of specific variables to encrypt
   */
  public async encryptEnvironmentVariables(envVariables?: string[]): Promise<void> {
    try {
      const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();

      // Verify key exists and is valid before encrypting
      const rotationStatus = await SecretKeyTracker.checkKeyRotationStatus(currentEnvKey);

      if (rotationStatus.status === "expired") {
        logger.warn(
          `Warning: Secret key "${currentEnvKey}" has expired. ` +
            `Consider rotating the key using SecretKeyRotationManager.rotateKeyWithReEncryption() before encrypting sensitive data.`,
        );
      } else if (rotationStatus.status === "expiring_soon") {
        logger.info(
          `Notice: Secret key "${currentEnvKey}" expires in ${rotationStatus.daysUntilExpiration} days.`,
        );
      }

      await this.environmentFileEncryptor.encryptEnvironmentVariables(envVariables);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "encryptEnvironmentVariables",
        "Failed to encrypt environment variables",
      );
      throw error;
    }
  }
}

// import { EnvironmentFileEncryptor } from "../manager/environmentFileEncryptor";
// import ConfigurationResolver from "../../configuration/environment/manager/configurationResolver";
// import SecretFileManager from "../../configuration/environment/manager/secretFileManager";
// import SecureKeyGenerator from "../key/secureKeyGenerator";
// import ErrorHandler from "../../utils/errorHandling/errorHandler";
// import SecretKeyTracker from "../../cryptography/key/rotation/secretKeyTracker";
// import EnvironmentDetector from "../../configuration/detector/environmentDetector";
// import logger from "../../utils/logger/loggerManager";
// import * as crypto from "crypto";
// import SecretFilePathResolver from "../../configuration/environment/manager/filePath/secretFilePathResolver";

// export class CryptoCoordinator {
//   private environmentFileEncryptor: EnvironmentFileEncryptor;
//   private readonly currentEnvironmentStage = EnvironmentDetector.getCurrentEnvironmentStage();

//   constructor(environmentFileEncryptor: EnvironmentFileEncryptor) {
//     this.environmentFileEncryptor = environmentFileEncryptor;
//   }

//   /**
//    * Generates and stores a new secret key with tracking
//    * @param options - Optional parameters
//    * @param options.rotationDays - Number of days before key rotation (default: 90)
//    * @param options.performedBy - Who performed the operation (default: "system")
//    * @returns The generated secret key
//    */
//   public async generateAndStoreSecretKey(
//     options: {
//       rotationDays?: number;
//       performedBy?: string;
//     } = {},
//   ): Promise<string> {
//     try {
//       const { rotationDays = 90, performedBy = "system" } = options;
//       const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
//       const currentEnv = this.currentEnvironmentStage;

//       // Check if key already exists and if rotation is needed
//       const existingMetadata = await SecretKeyTracker.getKeyMetadata(currentEnvKey);
//       if (existingMetadata) {
//         const rotationStatus = await SecretKeyTracker.checkKeyRotationStatus(currentEnvKey);

//         if (rotationStatus.needsRotation) {
//           logger.warn(
//             `Existing key "${currentEnvKey}" has expired ${Math.abs(rotationStatus.daysUntilExpiration)} days ago. ` +
//             `Consider using rotateSecretKey() instead.`,
//           );
//         } else {
//           logger.info(
//             `Key "${currentEnvKey}" already exists and is valid for ${rotationStatus.daysUntilExpiration} more days. ` +
//             `Skipping generation due to skipIfExists option.`,
//           );
//         }
//       }

//       const generatedSecretKey = SecureKeyGenerator.generateBase64SecretKey();

//       await SecretFileManager.storeEnvironmentKey(currentEnvKey, generatedSecretKey, {
//         skipIfExists: true,
//       });

//       await SecretFileManager.ensureSecretKeyExists(currentEnvKey);

//       // Track the secret key creation (only if it was actually created)
//       if (!existingMetadata) {
//         await SecretKeyTracker.trackSecretKey(currentEnvKey, currentEnv, {
//           rotationDays,
//           isRotation: false,
//           algorithm: "base64",
//           keyLength: 256,
//           performedBy,
//         });

//         logger.info(`Secret key "${currentEnvKey}" generated and tracked successfully`);
//       }

//       return generatedSecretKey;
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         "generateSecretKey",
//         `Failed to generate secret key "${ConfigurationResolver.getCurrentEnvSecretKey()}"`,
//       );
//       throw error;
//     }
//   }

//   /**
//    * Rotates an existing secret key with full tracking and history
//    * @param options - Optional parameters
//    * @param options.rotationDays - Number of days before next rotation (default: 90)
//    * @param options.rotationReason - Reason for rotation (default: "scheduled")
//    * @param options.performedBy - Who performed the rotation (default: "system")
//    * @returns The new generated secret key
//    */
//   public async rotateSecretKey(
//     options: {
//       rotationDays?: number;
//       rotationReason?: "scheduled" | "manual" | "compromised" | "expired";
//       performedBy?: string;
//     } = {},
//   ): Promise<string> {
//     try {
//       const { rotationDays = 90, rotationReason = "scheduled", performedBy = "system" } = options;
//       const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
//       const currentEnv = EnvironmentDetector.getCurrentEnvironmentStage();

//       logger.info(`Initiating rotation for secret key "${currentEnvKey}"...`);

//       // Get current key metadata and value
//       const existingMetadata = await SecretKeyTracker.getKeyMetadata(currentEnvKey);
//       if (existingMetadata) {
//         logger.info(
//           `Current key: Created ${new Date(existingMetadata.createdAt).toLocaleDateString()}, ` +
//           `Rotated ${existingMetadata.rotationCount} time(s)`,
//         );
//       }

//       // Get hash of previous key (for audit purposes)
//       const previousKey = await SecretFileManager.getKeyValue(
//         SecretFilePathResolver.getSecretFilePath(),
//         currentEnvKey,
//       );
//       const previousKeyHash = previousKey ? this.hashKey(previousKey) : undefined;

//       // Generate new key
//       const newSecretKey = SecureKeyGenerator.generateBase64SecretKey();
//       const newKeyHash = this.hashKey(newSecretKey);

//       // Store new key (force overwrite on rotation)
//       await SecretFileManager.storeKeyInFile(
//         SecretFilePathResolver.getSecretFilePath(),
//         currentEnvKey,
//         newSecretKey,
//         { skipIfExists: false }, // Allow overwrite
//       );

//       await SecretFileManager.ensureSecretKeyExists(currentEnvKey);

//       // Track the rotation in metadata
//       await SecretKeyTracker.trackSecretKey(currentEnvKey, currentEnv, {
//         rotationDays,
//         isRotation: true,
//         algorithm: "base64",
//         keyLength: 256,
//         performedBy,
//       });

//       // Record rotation in history
//       await SecretKeyTracker.recordRotation(currentEnvKey, currentEnv, {
//         rotationReason,
//         previousKeyHash,
//         newKeyHash,
//         performedBy,
//         success: true,
//       });

//       logger.info(
//         `Secret key "${currentEnvKey}" rotated successfully. Reason: ${rotationReason}`,
//       );

//       return newSecretKey;
//     } catch (error) {
//       // Record failed rotation
//       const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
//       const currentEnv = EnvironmentDetector.getCurrentEnvironmentStage();

//       await SecretKeyTracker.recordRotation(currentEnvKey, currentEnv, {
//         rotationReason: options.rotationReason || "scheduled",
//         performedBy: options.performedBy || "system",
//         success: false,
//       });

//       ErrorHandler.captureError(
//         error,
//         "rotateSecretKey",
//         `Failed to rotate secret key "${currentEnvKey}"`,
//       );
//       throw error;
//     }
//   }

//   /**
//    * Checks rotation status for the current secret key
//    * @returns Rotation status information
//    */
//   public async checkSecretKeyRotationStatus(): Promise<{
//     needsRotation: boolean;
//     daysUntilExpiration: number;
//     status: string;
//     metadata?: {
//       createdAt: string;
//       rotationCount: number;
//       lastRotatedAt?: string;
//     };
//   }> {
//     try {
//       const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
//       const rotationStatus = await SecretKeyTracker.checkKeyRotationStatus(currentEnvKey);
//       const metadata = await SecretKeyTracker.getKeyMetadata(currentEnvKey);

//       return {
//         ...rotationStatus,
//         metadata: metadata
//           ? {
//               createdAt: metadata.createdAt,
//               rotationCount: metadata.rotationCount,
//               lastRotatedAt: metadata.lastRotatedAt,
//             }
//           : undefined,
//       };
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         "checkSecretKeyRotationStatus",
//         "Failed to check secret key rotation status",
//       );
//       throw error;
//     }
//   }

//   /**
//    * Checks all tracked keys and reports their rotation status
//    */
//   public async auditAllSecretKeys(): Promise<void> {
//     try {
//       logger.info("=== SECRET KEY ROTATION AUDIT ===");

//       const keysNeedingRotation = await SecretKeyTracker.getKeysNeedingRotation();
//       const keysExpiringSoon = await SecretKeyTracker.getKeysExpiringSoon();
//       const allKeys = await SecretKeyTracker.getAllTrackedKeys();

//       if (keysNeedingRotation.length > 0) {
//         logger.warn(`\n🔴 EXPIRED KEYS (${keysNeedingRotation.length}):`);
//         for (const key of keysNeedingRotation) {
//           const daysExpired = Math.abs(
//             this.calculateDaysUntilExpiration(key.expiresAt),
//           );
//           logger.warn(
//             `  - ${key.keyName} (${key.environment}): EXPIRED ${daysExpired} days ago`,
//           );
//         }
//       }

//       if (keysExpiringSoon.length > 0) {
//         logger.info(`\n🟡 EXPIRING SOON (${keysExpiringSoon.length}):`);
//         for (const key of keysExpiringSoon) {
//           const daysRemaining = this.calculateDaysUntilExpiration(key.expiresAt);
//           logger.info(
//             `  - ${key.keyName} (${key.environment}): ${daysRemaining} days remaining`,
//           );
//         }
//       }

//       const activeKeys = allKeys.filter((k) => k.status === "active");
//       if (activeKeys.length > 0) {
//         logger.info(`\n🟢 ACTIVE KEYS (${activeKeys.length}):`);
//         for (const key of activeKeys) {
//           const daysRemaining = this.calculateDaysUntilExpiration(key.expiresAt);
//           logger.info(
//             `  - ${key.keyName} (${key.environment}): ${daysRemaining} days remaining ` +
//             `(Rotated ${key.rotationCount} time(s))`,
//           );
//         }
//       }

//       if (allKeys.length === 0) {
//         logger.info("\nNo secret keys are currently tracked.");
//       } else {
//         logger.info(`\nTotal tracked keys: ${allKeys.length}`);
//       }
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         "auditAllSecretKeys",
//         "Failed to audit secret keys",
//       );
//       throw error;
//     }
//   }

//   /**
//    * Gets rotation history for the current secret key
//    * @param limit - Maximum number of history entries to return
//    * @returns Array of rotation history entries
//    */
//   public async getSecretKeyRotationHistory(limit: number = 10): Promise<{
//     keyName: string;
//     rotationDate: string;
//     rotationReason: string;
//     performedBy?: string;
//     success: boolean;
//   }[]> {
//     try {
//       const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();
//       const history = await SecretKeyTracker.getKeyRotationHistory(currentEnvKey, limit);

//       return history.map((entry) => ({
//         keyName: entry.keyName,
//         rotationDate: entry.rotationDate,
//         rotationReason: entry.rotationReason,
//         performedBy: entry.performedBy,
//         success: entry.success,
//       }));
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         "getSecretKeyRotationHistory",
//         "Failed to get secret key rotation history",
//       );
//       throw error;
//     }
//   }

//   /**
//    * Gets recent audit logs for secret key operations
//    * @param limit - Maximum number of log entries to return
//    * @param filters - Optional filters for action, keyName, or status
//    * @returns Array of audit log entries
//    */
//   public async getSecretKeyAuditLogs(
//     limit: number = 50,
//     filters?: {
//       action?: "create" | "rotate" | "read" | "delete" | "verify" | "expire_check";
//       keyName?: string;
//       status?: "success" | "failure" | "warning";
//     },
//   ): Promise<{
//     timestamp: string;
//     action: string;
//     keyName: string;
//     environment: string;
//     status: string;
//     details: string;
//     performedBy?: string;
//   }[]> {
//     try {
//       const logs = await SecretKeyTracker.getAuditLogs(limit, filters);

//       return logs.map((log) => ({
//         timestamp: log.timestamp,
//         action: log.action,
//         keyName: log.keyName,
//         environment: log.environment,
//         status: log.status,
//         details: log.details,
//         performedBy: log.performedBy,
//       }));
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         "getSecretKeyAuditLogs",
//         "Failed to get secret key audit logs",
//       );
//       throw error;
//     }
//   }

//   /**
//    * Encrypts environment variables with tracking
//    * @param envVariables - Optional array of specific variables to encrypt
//    */
//   public async encryptEnvironmentVariables(envVariables?: string[]): Promise<void> {
//     try {
//       const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();

//       // Verify key exists and is valid before encrypting
//       const rotationStatus = await SecretKeyTracker.checkKeyRotationStatus(currentEnvKey);

//       if (rotationStatus.status === "expired") {
//         logger.warn(
//           `Warning: Secret key "${currentEnvKey}" has expired. ` +
//           `Consider rotating the key before encrypting sensitive data.`,
//         );
//       } else if (rotationStatus.status === "expiring_soon") {
//         logger.info(
//           `Notice: Secret key "${currentEnvKey}" expires in ${rotationStatus.daysUntilExpiration} days.`,
//         );
//       }

//       await this.environmentFileEncryptor.encryptEnvironmentVariables(envVariables);
//     } catch (error) {
//       ErrorHandler.captureError(
//         error,
//         "encryptEnvironmentVariables",
//         "Failed to encrypt environment variables",
//       );
//       throw error;
//     }
//   }

//   // Private utility methods

//   /**
//    * Creates a SHA-256 hash of a key (for audit purposes, not security)
//    * @param key - The key to hash
//    * @returns Hex string of the hash
//    */
//   private hashKey(key: string): string {
//     return crypto.createHash("sha256").update(key).digest("hex").substring(0, 16);
//   }

//   /**
//    * Calculates days until expiration
//    * @param expiresAt - ISO string of expiration date
//    * @returns Number of days until expiration (negative if expired)
//    */
//   private calculateDaysUntilExpiration(expiresAt: string): number {
//     const now = new Date();
//     const expiration = new Date(expiresAt);
//     const diffMs = expiration.getTime() - now.getTime();
//     return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
//   }
// }
