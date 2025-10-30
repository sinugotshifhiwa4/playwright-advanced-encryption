export interface RotationResult {
  success: boolean;
  keyName: string;
  environment: string;
  variablesProcessed: number;
  variablesFailed: string[];
  oldKeyHash?: string;
  newKeyHash?: string;
  duration: number;
}

export interface RotationOptions {
  rotationReason?: "scheduled" | "manual" | "compromised" | "expired";
  rotationDays?: number;
  performedBy?: string;
  forceRotation?: boolean;
  dryRun?: boolean;
}

export interface DecryptedVariable {
  key: string;
  originalValue: string;
  decryptedValue: string;
  wasEncrypted: boolean;
}

export interface SecretKeyMetadata {
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
  performedBy?: string;
}
export interface KeyMetadataFile {
  keys: Record<string, SecretKeyMetadata>;
  lastUpdated: string;
}
export interface SecretKeyRotationEntry {
  keyName: string;
  environment: string;
  rotationDate: string;
  previousKeyHash?: string;
  newKeyHash?: string;
  rotationReason: "scheduled" | "manual" | "compromised" | "expired";
  performedBy?: string;
  success: boolean;
}

export interface SecretKeyRotationFile {
  rotations: SecretKeyRotationEntry[];
  lastRotation: string;
}
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

export interface EncryptionEntry {
  timestamp: string;
  keyName: string;
  environment: string;
  variablesEncrypted: string[];
  totalVariables: number;
  skippedVariables: string[];
  alreadyEncrypted: string[];
  emptyVariables: string[];
  performedBy?: string;
  durationMs: number;
}

export interface EncryptionTrackingFile {
  encryptions: EncryptionEntry[];
  totalEncryptions: number;
  lastEncryption: string;
}
