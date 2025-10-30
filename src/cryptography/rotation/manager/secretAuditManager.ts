import SecretFileManager from "./secretFileManager";
import * as path from "path";
import CryptoConstants from "../types/cryptoConstants";
import { AuditLogEntry, AuditLogFile } from "../types/audit.types";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";
import logger from "../../../utils/logger/loggerManager";

export default class SecretAuditManager {
  /**
   * Logs an audit entry.
   */
  public static async logAudit(entry: Omit<AuditLogEntry, "timestamp">): Promise<void> {
    try {
      const auditFile = await this.loadAuditLog();
      const now = new Date().toISOString();

      // for local time: which is UTC + 2 hours
      //new Date(now).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });

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

  /**
   * Gets recent audit logs.
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

  // Private file operations
  private static getFilePath(filename: string): string {
    return path.join(process.cwd(), CryptoConstants.TRACKING_DIR, filename);
  }

  private static async loadAuditLog(): Promise<AuditLogFile> {
    const filePath = this.getFilePath(CryptoConstants.AUDIT_FILE);
    return SecretFileManager.loadJsonFile<AuditLogFile>(filePath, {
      logs: [],
      totalEntries: 0,
      lastAudit: new Date().toISOString(),
    });
  }

  private static async saveAuditLog(data: AuditLogFile): Promise<void> {
    const filePath = this.getFilePath(CryptoConstants.AUDIT_FILE);
    await SecretFileManager.saveJsonFile(filePath, data);
  }
}
