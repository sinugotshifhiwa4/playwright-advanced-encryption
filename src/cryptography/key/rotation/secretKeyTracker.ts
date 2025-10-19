import { AsyncFileManager } from "../../../utils/fileManager/asyncFileManager";
import { FileEncoding } from "../../../utils/fileManager/internal/file-encoding.enum";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";
import * as path from "path";

// ==================== INTERFACES ====================

interface SecretKeyMetadata {
  keyName: string;
  environment: string;
  createdAt: string;
  expiresAt: string;
  rotationDays: number;
  lastRotatedAt?: string;
  rotationCount: number;
  status: "active" | "expired" | "expiring_soon";
  algorithm?: string;
  keyLength?: number;
}

interface KeyMetadataFile {
  keys: Record<string, SecretKeyMetadata>;
  lastUpdated: string;
}

interface SecretKeyRotationEntry {
  keyName: string;
  environment: string;
  rotationDate: string;
  previousKeyHash?: string;
  newKeyHash?: string;
  rotationReason: "scheduled" | "manual" | "compromised" | "expired";
  performedBy?: string;
  success: boolean;
}

interface SecretKeyRotationFile {
  rotations: SecretKeyRotationEntry[];
  lastRotation: string;
}

interface AuditLogEntry {
  timestamp: string;
  action: "create" | "rotate" | "read" | "delete" | "verify" | "expire_check";
  keyName: string;
  environment: string;
  status: "success" | "failure" | "warning";
  details: string;
  metadata?: Record<string, string | number | boolean>;
  performedBy?: string;
}

interface AuditLogFile {
  logs: AuditLogEntry[];
  totalEntries: number;
  lastAudit: string;
}

// ==================== MAIN CLASS ====================

export default class SecretKeyTracker {
  private static readonly TRACKING_DIR = "cryptoTracking"; // to cryptoAudit
  private static readonly METADATA_FILE = "keyMetadata.json";
  private static readonly ROTATION_FILE = "secretKeyRotations.json";
  private static readonly AUDIT_FILE = "auditLog.json";

  private static readonly DEFAULT_ROTATION_DAYS = 90;
  private static readonly EXPIRING_SOON_THRESHOLD_DAYS = 7;
  //private static readonly DATA_VERSION = "1.0.0";

  // ==================== PUBLIC TRACKING METHODS ====================

  /**
   * Tracks a newly created or rotated secret key
   * @param keyName - The name of the secret key (e.g., "SECRET_KEY_DEV")
   * @param environment - The environment identifier (e.g., "dev", "prod")
   * @param options - Optional parameters
   */
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
        rotationDays = this.DEFAULT_ROTATION_DAYS,
        isRotation = false,
        algorithm = "base64",
        keyLength = 256,
        performedBy = "system",
      } = options;

      await this.ensureTrackingDirectoryExists();
      const metadataFile = await this.loadKeyMetadata();

      const now = new Date().toISOString();
      const expiresAt = this.calculateExpirationDate(rotationDays);

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
      };

      metadataFile.keys[keyName] = metadata;
      metadataFile.lastUpdated = now;

      await this.saveKeyMetadata(metadataFile);

      // Log to audit
      await this.logAudit({
        action: isRotation ? "rotate" : "create",
        keyName,
        environment,
        status: "success",
        details: isRotation
          ? `Secret key rotated successfully (Rotation #${rotationCount})`
          : "Secret key created and tracked successfully",
        metadata: { rotationDays, algorithm, keyLength },
        performedBy,
      });

      logger.info(
        `Secret key "${keyName}" tracked successfully for environment "${environment}"` +
          (isRotation ? ` (Rotation #${rotationCount})` : ""),
      );
    } catch (error) {
      await this.logAudit({
        action: "create",
        keyName,
        environment,
        status: "failure",
        details: `Failed to track secret key: ${error}`,
        performedBy: options.performedBy || "system",
      });

      ErrorHandler.captureError(error, "trackSecretKey", `Failed to track secret key "${keyName}"`);
      throw error;
    }
  }

  /**
   * Records a key rotation event in the rotation history
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
        performedBy = "system",
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

      rotationFile.rotations.unshift(rotationEntry); // Add to beginning
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

  // ==================== QUERY METHODS ====================

  /**
   * Gets metadata for a specific secret key
   */
  public static async getKeyMetadata(keyName: string): Promise<SecretKeyMetadata | undefined> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      const metadata = metadataFile.keys[keyName];

      if (metadata) {
        metadata.status = this.determineKeyStatus(metadata.expiresAt);
      }

      await this.logAudit({
        action: "read",
        keyName,
        environment: metadata?.environment || "unknown",
        status: metadata ? "success" : "warning",
        details: metadata ? "Key metadata retrieved" : "Key not found in tracking",
      });

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
   * Gets rotation history for a specific key
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
   * Checks if a secret key needs rotation based on its expiration date
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

      const daysUntilExpiration = this.calculateDaysUntilExpiration(metadata.expiresAt);
      const needsRotation = daysUntilExpiration <= 0;
      const status = metadata.status;

      await this.logAudit({
        action: "expire_check",
        keyName,
        environment: metadata.environment,
        status: needsRotation ? "warning" : "success",
        details: `Days until expiration: ${daysUntilExpiration}`,
        metadata: { daysUntilExpiration, needsRotation },
      });

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
   * Gets all secret keys that need rotation
   */
  public static async getKeysNeedingRotation(): Promise<SecretKeyMetadata[]> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      const keysNeedingRotation: SecretKeyMetadata[] = [];

      for (const metadata of Object.values(metadataFile.keys)) {
        const daysUntilExpiration = this.calculateDaysUntilExpiration(metadata.expiresAt);
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
   * Gets all secret keys that are expiring soon
   */
  public static async getKeysExpiringSoon(
    thresholdDays: number = this.EXPIRING_SOON_THRESHOLD_DAYS,
  ): Promise<SecretKeyMetadata[]> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      const keysExpiringSoon: SecretKeyMetadata[] = [];

      for (const metadata of Object.values(metadataFile.keys)) {
        const daysUntilExpiration = this.calculateDaysUntilExpiration(metadata.expiresAt);
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
   * Gets all tracked secret keys
   */
  public static async getAllTrackedKeys(): Promise<SecretKeyMetadata[]> {
    try {
      const metadataFile = await this.loadKeyMetadata();
      return Object.values(metadataFile.keys).map((metadata) => {
        metadata.status = this.determineKeyStatus(metadata.expiresAt);
        return metadata;
      });
    } catch (error) {
      ErrorHandler.captureError(error, "getAllTrackedKeys", "Failed to get all tracked keys");
      throw error;
    }
  }

  /**
   * Gets recent audit logs
   */
  public static async getAuditLogs(
    limit?: number,
    filters?: { action?: string; keyName?: string; status?: string },
  ): Promise<AuditLogEntry[]> {
    try {
      const auditFile = await this.loadAuditLog();
      let logs = auditFile.logs;

      // Apply filters
      if (filters) {
        if (filters.action) {
          logs = logs.filter((log) => log.action === filters.action);
        }
        if (filters.keyName) {
          logs = logs.filter((log) => log.keyName === filters.keyName);
        }
        if (filters.status) {
          logs = logs.filter((log) => log.status === filters.status);
        }
      }

      return limit ? logs.slice(0, limit) : logs;
    } catch (error) {
      ErrorHandler.captureError(error, "getAuditLogs", "Failed to get audit logs");
      return [];
    }
  }

  /**
   * Removes tracking data for a specific key
   */
  public static async untrackSecretKey(
    keyName: string,
    performedBy: string = "system",
  ): Promise<void> {
    try {
      const metadataFile = await this.loadKeyMetadata();

      if (!metadataFile.keys[keyName]) {
        logger.warn(`Key "${keyName}" is not currently tracked`);
        return;
      }

      const environment = metadataFile.keys[keyName].environment;
      delete metadataFile.keys[keyName];
      metadataFile.lastUpdated = new Date().toISOString();

      await this.saveKeyMetadata(metadataFile);

      await this.logAudit({
        action: "delete",
        keyName,
        environment,
        status: "success",
        details: "Secret key removed from tracking",
        performedBy,
      });

      logger.info(`Secret key "${keyName}" removed from tracking`);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "untrackSecretKey",
        `Failed to untrack secret key "${keyName}"`,
      );
      throw error;
    }
  }

  // ==================== PRIVATE FILE OPERATIONS ====================

  private static getFilePath(filename: string): string {
    return path.join(process.cwd(), this.TRACKING_DIR, filename);
  }

  private static async ensureTrackingDirectoryExists(): Promise<void> {
    const dirPath = path.join(process.cwd(), this.TRACKING_DIR);
    const dirExists = await AsyncFileManager.doesFileExist(dirPath);

    if (!dirExists) {
      logger.info(`Creating tracking directory at "${dirPath}"`);
      await AsyncFileManager.createDirectory(dirPath);
    }
  }

  // Key Metadata Operations
  private static async loadKeyMetadata(): Promise<KeyMetadataFile> {
    const filePath = this.getFilePath(this.METADATA_FILE);
    return this.loadJsonFile<KeyMetadataFile>(filePath, {
      keys: {},
      lastUpdated: new Date().toISOString(),
    });
  }

  private static async saveKeyMetadata(data: KeyMetadataFile): Promise<void> {
    const filePath = this.getFilePath(this.METADATA_FILE);
    await this.saveJsonFile(filePath, data);
  }

  // Rotation History Operations
  private static async loadRotationHistory(): Promise<SecretKeyRotationFile> {
    const filePath = this.getFilePath(this.ROTATION_FILE);
    return this.loadJsonFile<SecretKeyRotationFile>(filePath, {
      rotations: [],
      lastRotation: new Date().toISOString(),
    });
  }

  private static async saveRotationHistory(data: SecretKeyRotationFile): Promise<void> {
    const filePath = this.getFilePath(this.ROTATION_FILE);
    await this.saveJsonFile(filePath, data);
  }

  // Audit Log Operations
  private static async loadAuditLog(): Promise<AuditLogFile> {
    const filePath = this.getFilePath(this.AUDIT_FILE);
    return this.loadJsonFile<AuditLogFile>(filePath, {
      logs: [],
      totalEntries: 0,
      lastAudit: new Date().toISOString(),
    });
  }

  private static async saveAuditLog(data: AuditLogFile): Promise<void> {
    const filePath = this.getFilePath(this.AUDIT_FILE);
    await this.saveJsonFile(filePath, data);
  }

  private static async logAudit(entry: Omit<AuditLogEntry, "timestamp">): Promise<void> {
    try {
      const auditFile = await this.loadAuditLog();
      const now = new Date().toISOString();

      const auditEntry: AuditLogEntry = {
        timestamp: now,
        ...entry,
      };

      auditFile.logs.unshift(auditEntry); // Add to beginning
      auditFile.totalEntries++;
      auditFile.lastAudit = now;

      // Keep only last 10000 entries to prevent file bloat
      if (auditFile.logs.length > 10000) {
        auditFile.logs = auditFile.logs.slice(0, 10000);
      }

      await this.saveAuditLog(auditFile);
    } catch (error) {
      // Don't throw on audit log failures to prevent blocking operations
      logger.error(`Failed to write audit log: ${error}`);
    }
  }

  // Generic JSON file operations
  private static async loadJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    const fileExists = await AsyncFileManager.doesFileExist(filePath);

    if (!fileExists) {
      logger.info(`No file found at "${filePath}", creating with default data`);
      return defaultValue;
    }

    try {
      const fileContent = await AsyncFileManager.readFile(filePath, FileEncoding.UTF8);
      return JSON.parse(fileContent) as T;
    } catch (error) {
      logger.error(`Failed to parse JSON file at "${filePath}": ${error}`);
      return defaultValue;
    }
  }

  private static async saveJsonFile<T>(filePath: string, data: T): Promise<void> {
    const jsonContent = JSON.stringify(data, null, 2);
    await AsyncFileManager.writeFile(filePath, jsonContent, `Updated ${path.basename(filePath)}`);
  }

  // ==================== UTILITY METHODS ====================

  private static calculateExpirationDate(rotationDays: number): string {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + rotationDays);
    return expirationDate.toISOString();
  }

  private static calculateDaysUntilExpiration(expiresAt: string): number {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const diffMs = expiration.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  private static determineKeyStatus(expiresAt: string): "active" | "expired" | "expiring_soon" {
    const daysUntilExpiration = this.calculateDaysUntilExpiration(expiresAt);

    if (daysUntilExpiration <= 0) {
      return "expired";
    } else if (daysUntilExpiration <= this.EXPIRING_SOON_THRESHOLD_DAYS) {
      return "expiring_soon";
    } else {
      return "active";
    }
  }
}
