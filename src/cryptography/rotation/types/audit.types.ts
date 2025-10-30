export interface AuditLogEntry {
  timestamp: string;
  action: "create" | "rotate" | "read" | "delete" | "verify" | "expire_check" | "encrypt";
  keyName: string;
  environment: string;
  status: "success" | "failure" | "warning";
  details: string;
  metadata?: Record<string, string | number | boolean>;
  performedBy?: string;
}

export interface AuditLogFile {
  logs: AuditLogEntry[];
  totalEntries: number;
  lastAudit: string;
}
