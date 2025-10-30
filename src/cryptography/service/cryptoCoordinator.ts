import EnvironmentDetector from "../../configuration/detector/environmentDetector";
import SecureKeyGenerator from "../key/secureKeyGenerator";
import { EnvironmentFileEncryptor } from "../manager/environmentFileEncryptor";
import ConfigurationResolver from "../../configuration/environment/manager/configurationResolver";
import SecretFileManager from "../../configuration/environment/manager/secretFileManager";
import SecretMetadataManager from "../rotation/manager/secretMetadataManager";
import ErrorHandler from "../../utils/errorHandling/errorHandler";
import logger from "../../utils/logger/loggerManager";

export class CryptoCoordinator {
  private environmentFileEncryptor: EnvironmentFileEncryptor;
  private readonly currentEnvironmentStage = EnvironmentDetector.getCurrentEnvironmentStage();

  constructor(environmentFileEncryptor: EnvironmentFileEncryptor) {
    this.environmentFileEncryptor = environmentFileEncryptor;
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
      const existingMetadata = await SecretMetadataManager.getKeyMetadata(currentEnvKey);
      if (existingMetadata) {
        const rotationStatus = await SecretMetadataManager.checkKeyRotationStatus(currentEnvKey);

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
        await SecretMetadataManager.trackSecretKey(currentEnvKey, currentEnv, {
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
      const rotationStatus = await SecretMetadataManager.checkKeyRotationStatus(currentEnvKey);

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
