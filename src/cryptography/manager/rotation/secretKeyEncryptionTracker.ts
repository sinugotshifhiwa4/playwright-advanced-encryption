// secretKeyEncryptionTracker.ts - NEW FILE
import SecretKeyFileManager from "./secretKeyFileManager";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";
import RotationConstants from "./rotationConstants";
import { EncryptionEntry, EncryptionTrackingFile } from "./rotation.type";
import SecretKeyAuditManager from "./secretKeyAuditManager";
import { getCurrentUser } from "./getSystemUser";

export default class SecretKeyEncryptionTracker {
  /**
   * Records an encryption operation.
   */
  public static async trackEncryption(
    keyName: string,
    environment: string,
    options: {
      variablesEncrypted: string[];
      skippedVariables?: string[];
      alreadyEncrypted?: string[];
      emptyVariables?: string[];
      performedBy?: string;
      durationMs: number;
    },
  ): Promise<void> {
    try {
      const {
        variablesEncrypted,
        skippedVariables = [],
        alreadyEncrypted = [],
        emptyVariables = [],
        performedBy = getCurrentUser(),
        durationMs,
      } = options;

      const encryptionFile = await this.loadEncryptionTracking();
      const now = new Date().toISOString();

      const encryptionEntry: EncryptionEntry = {
        timestamp: now,
        keyName,
        environment,
        variablesEncrypted,
        totalVariables: variablesEncrypted.length,
        skippedVariables,
        alreadyEncrypted,
        emptyVariables,
        performedBy,
        durationMs,
      };

      encryptionFile.encryptions.unshift(encryptionEntry);
      encryptionFile.totalEncryptions++;
      encryptionFile.lastEncryption = now;

      // Keep only last 10000 entries
      if (encryptionFile.encryptions.length > RotationConstants.MAX_AUDIT_ENTRIES) {
        encryptionFile.encryptions = encryptionFile.encryptions.slice(
          0,
          RotationConstants.MAX_AUDIT_ENTRIES,
        );
      }

      await this.saveEncryptionTracking(encryptionFile);

      // Also log to audit
      await SecretKeyAuditManager.logAudit({
        action: "encrypt",
        keyName,
        environment,
        status: "success",
        details: `Encrypted ${variablesEncrypted.length} variable(s)`,
        metadata: {
          totalVariables: variablesEncrypted.length,
          skippedCount: skippedVariables.length + alreadyEncrypted.length + emptyVariables.length,
          durationMs,
        },
        performedBy,
      });

      logger.info(
        `Encryption tracked: ${variablesEncrypted.length} variable(s) encrypted by ${performedBy}`,
      );
    } catch (error) {
      ErrorHandler.captureError(error, "trackEncryption", "Failed to track encryption operation");
      // Don't throw - tracking failure shouldn't block encryption
      logger.error(`Failed to track encryption: ${error}`);
    }
  }

  /**
   * Gets recent encryption history.
   */
  public static async getEncryptionHistory(
    limit?: number,
    filters?: { keyName?: string; environment?: string; performedBy?: string },
  ): Promise<EncryptionEntry[]> {
    try {
      const encryptionFile = await this.loadEncryptionTracking();
      let encryptions = encryptionFile.encryptions;

      // Apply filters
      if (filters) {
        if (filters.keyName) {
          encryptions = encryptions.filter((e) => e.keyName === filters.keyName);
        }
        if (filters.environment) {
          encryptions = encryptions.filter((e) => e.environment === filters.environment);
        }
        if (filters.performedBy) {
          encryptions = encryptions.filter((e) => e.performedBy === filters.performedBy);
        }
      }

      return limit ? encryptions.slice(0, limit) : encryptions;
    } catch (error) {
      ErrorHandler.captureError(error, "getEncryptionHistory", "Failed to get encryption history");
      return [];
    }
  }

  /**
   * Gets encryption statistics for a specific key.
   */
  public static async getEncryptionStats(keyName: string): Promise<{
    totalEncryptions: number;
    totalVariablesEncrypted: number;
    lastEncryption?: string;
    mostRecentVariables?: string[];
  }> {
    try {
      const history = await this.getEncryptionHistory(undefined, { keyName });

      if (history.length === 0) {
        return {
          totalEncryptions: 0,
          totalVariablesEncrypted: 0,
        };
      }

      const totalVariablesEncrypted = history.reduce((sum, entry) => sum + entry.totalVariables, 0);

      return {
        totalEncryptions: history.length,
        totalVariablesEncrypted,
        lastEncryption: history[0].timestamp,
        mostRecentVariables: history[0].variablesEncrypted,
      };
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getEncryptionStats",
        `Failed to get encryption stats for key "${keyName}"`,
      );
      return {
        totalEncryptions: 0,
        totalVariablesEncrypted: 0,
      };
    }
  }

  // Private file operations
  private static async loadEncryptionTracking(): Promise<EncryptionTrackingFile> {
    const filePath = SecretKeyFileManager.getFilePath(RotationConstants.ENCRYPTION_FILE);
    return SecretKeyFileManager.loadJsonFile<EncryptionTrackingFile>(filePath, {
      encryptions: [],
      totalEncryptions: 0,
      lastEncryption: new Date().toISOString(),
    });
  }

  private static async saveEncryptionTracking(data: EncryptionTrackingFile): Promise<void> {
    const filePath = SecretKeyFileManager.getFilePath(RotationConstants.ENCRYPTION_FILE);
    await SecretKeyFileManager.saveJsonFile(filePath, data);
  }
}
