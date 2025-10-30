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
