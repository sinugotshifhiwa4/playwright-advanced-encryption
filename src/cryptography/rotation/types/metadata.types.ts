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
