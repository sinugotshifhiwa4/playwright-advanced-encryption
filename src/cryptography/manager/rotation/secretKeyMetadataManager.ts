import { AsyncFileManager } from "../../../utils/fileManager/asyncFileManager";
import SecretKeyFileManager from "./secretKeyFileManager";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";
import * as path from "path";
import KeyExpirationCalculator from "./keyExpirationCalculator";
import { SecretKeyMetadata, KeyMetadataFile } from "./rotation.type";
import SecretKeyAuditManager from "./secretKeyAuditManager";
import RotationConstants from "./rotationConstants";
import { getCurrentUser } from "./getSystemUser";

export default class SecretKeyMetadataManager {
  public static async trackSecretKey(
    keyName: string,
    environment: string,
    options: {
      rotationDays?: number;
      isRotation?: boolean;
      algorithm?: string;
      keyLength?: number;
      performedBy?: string;
    } = {},
  ): Promise<void> {
    try {
      const {
        rotationDays = RotationConstants.DEFAULT_ROTATION_DAYS,
        isRotation = false,
        algorithm = "base64",
        keyLength = 256,
        performedBy = getCurrentUser(),
      } = options;

      await this.ensureTrackingDirectoryExists();
      const metadataFile = await this.loadKeyMetadata();

      const now = new Date().toISOString();
      const expiresAt = KeyExpirationCalculator.calculateExpirationDate(rotationDays);

      const existingMetadata = metadataFile.keys[keyName];
      const rotationCount = isRotation && existingMetadata ? existingMetadata.rotationCount + 1 : 0;

      const metadata: SecretKeyMetadata = {
        keyName,
        environment,
        createdAt: isRotation && existingMetadata ? existingMetadata.createdAt : now,
        expiresAt,
        rotationDays,
        lastRotatedAt: isRotation ? now : undefined,
        rotationCount,
        status: "active",
        algorithm,
        keyLength,
        performedBy,
      };

      metadataFile.keys[keyName] = metadata;
      metadataFile.lastUpdated = now;
      await this.saveKeyMetadata(metadataFile);

      await SecretKeyAuditManager.logAudit({
        action: isRotation ? "rotate" : "create",
        keyName,
        environment,
        status: "success",
        details: isRotation ? "Key rotated successfully" : "Key created and tracked",
        performedBy,
      });

      logger.info(
        `Secret key "${keyName}" tracked successfully for environment "${environment}" by ${performedBy}` +
          (isRotation ? ` (Rotation #${rotationCount})` : ""),
      );
    } catch (error) {
      ErrorHandler.captureError(error, "trackSecretKey", `Failed to track secret key "${keyName}"`);
      throw error;
    }
  }

  /**
   * Gets metadata for a specific secret key.
   */
  public static async getKeyMetadata(keyName: string): Promise<SecretKeyMetadata | undefined> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      const metadata = metadataFile.keys[keyName];

      if (metadata) {
        metadata.status = KeyExpirationCalculator.determineKeyStatus(metadata.expiresAt);
      }

      return metadata;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getKeyMetadata",
        `Failed to get metadata for key "${keyName}"`,
      );
      return undefined;
    }
  }

  /**
   * Checks if a secret key needs rotation.
   */
  public static async checkKeyRotationStatus(
    keyName: string,
  ): Promise<{ needsRotation: boolean; daysUntilExpiration: number; status: string }> {
    try {
      const metadata = await this.getKeyMetadata(keyName);

      if (!metadata) {
        logger.warn(`No tracking data found for key "${keyName}"`);
        return { needsRotation: true, daysUntilExpiration: 0, status: "unknown" };
      }

      const daysUntilExpiration = KeyExpirationCalculator.calculateDaysUntilExpiration(
        metadata.expiresAt,
      );
      const needsRotation = daysUntilExpiration <= 0;
      const status = metadata.status;

      if (needsRotation) {
        logger.warn(
          `Secret key "${keyName}" has expired and needs rotation (expired ${Math.abs(daysUntilExpiration)} days ago)`,
        );
      } else if (status === "expiring_soon") {
        logger.info(
          `Secret key "${keyName}" is expiring soon (${daysUntilExpiration} days remaining)`,
        );
      }

      return { needsRotation, daysUntilExpiration, status };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "checkKeyRotationStatus",
        `Failed to check rotation status for key "${keyName}"`,
      );
      throw error;
    }
  }

  /**
   * Gets all secret keys that need rotation.
   */
  public static async getKeysNeedingRotation(): Promise<SecretKeyMetadata[]> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      const keysNeedingRotation: SecretKeyMetadata[] = [];

      for (const metadata of Object.values(metadataFile.keys)) {
        const daysUntilExpiration = KeyExpirationCalculator.calculateDaysUntilExpiration(
          metadata.expiresAt,
        );
        if (daysUntilExpiration <= 0) {
          metadata.status = "expired";
          keysNeedingRotation.push(metadata);
        }
      }

      if (keysNeedingRotation.length > 0) {
        logger.warn(`Found ${keysNeedingRotation.length} key(s) that need rotation`);
      }

      return keysNeedingRotation;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getKeysNeedingRotation",
        "Failed to get keys needing rotation",
      );
      throw error;
    }
  }

  /**
   * Gets all secret keys that are expiring soon.
   */
  public static async getKeysExpiringSoon(
    thresholdDays: number = KeyExpirationCalculator.EXPIRING_SOON_THRESHOLD_DAYS,
  ): Promise<SecretKeyMetadata[]> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      const keysExpiringSoon: SecretKeyMetadata[] = [];

      for (const metadata of Object.values(metadataFile.keys)) {
        const daysUntilExpiration = KeyExpirationCalculator.calculateDaysUntilExpiration(
          metadata.expiresAt,
        );
        if (daysUntilExpiration > 0 && daysUntilExpiration <= thresholdDays) {
          metadata.status = "expiring_soon";
          keysExpiringSoon.push(metadata);
        }
      }

      return keysExpiringSoon;
    } catch (error) {
      ErrorHandler.captureError(error, "getKeysExpiringSoon", "Failed to get keys expiring soon");
      throw error;
    }
  }

  /**
   * Gets all tracked secret keys.
   */
  public static async getAllTrackedKeys(): Promise<SecretKeyMetadata[]> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      return Object.values(metadataFile.keys).map((metadata) => {
        metadata.status = KeyExpirationCalculator.determineKeyStatus(metadata.expiresAt);
        return metadata;
      });
    } catch (error) {
      ErrorHandler.captureError(error, "getAllTrackedKeys", "Failed to get all tracked keys");
      throw error;
    }
  }

  public static async untrackSecretKey(keyName: string, performedBy: string): Promise<void> {
    try {
      const metadataFile = await this.loadKeyMetadata();

      if (!metadataFile.keys[keyName]) {
        logger.warn(`Key "${keyName}" is not currently tracked (attempted by ${performedBy})`);

        await SecretKeyAuditManager.logAudit({
          action: "delete",
          keyName,
          environment: "unknown",
          status: "warning",
          details: "Attempted to untrack non-existent key",
          performedBy,
        });
        return;
      }

      const deletedKey = metadataFile.keys[keyName];
      delete metadataFile.keys[keyName];
      metadataFile.lastUpdated = new Date().toISOString();
      await this.saveKeyMetadata(metadataFile);

      logger.info(
        `Secret key "${keyName}" removed from tracking by ${performedBy} (Environment: ${deletedKey.environment})`,
      );

      await SecretKeyAuditManager.logAudit({
        action: "delete",
        keyName,
        environment: deletedKey.environment,
        status: "success",
        details: "Key removed from tracking",
        performedBy,
      });
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "untrackSecretKey",
        `Failed to untrack secret key "${keyName}" by ${performedBy}`,
      );

      await SecretKeyAuditManager.logAudit({
        action: "delete",
        keyName,
        environment: "unknown",
        status: "failure",
        details: "Error occurred while untracking key",
        performedBy,
      });
      throw error;
    }
  }

  // Private file operations
  private static async ensureTrackingDirectoryExists(): Promise<void> {
    const dirPath = path.join(process.cwd(), RotationConstants.TRACKING_DIR);
    const dirExists = await AsyncFileManager.doesFileExist(dirPath);

    if (!dirExists) {
      logger.info(`Creating tracking directory at "${dirPath}"`);
      await AsyncFileManager.createDirectory(dirPath);
    }
  }

  private static async loadKeyMetadata(): Promise<KeyMetadataFile> {
    const filePath = SecretKeyFileManager.getFilePath(RotationConstants.METADATA_FILE);
    return SecretKeyFileManager.loadJsonFile<KeyMetadataFile>(filePath, {
      keys: {},
      lastUpdated: new Date().toISOString(),
    });
  }

  private static async saveKeyMetadata(data: KeyMetadataFile): Promise<void> {
    const filePath = SecretKeyFileManager.getFilePath(RotationConstants.METADATA_FILE);
    await SecretKeyFileManager.saveJsonFile(filePath, data);
  }
}
