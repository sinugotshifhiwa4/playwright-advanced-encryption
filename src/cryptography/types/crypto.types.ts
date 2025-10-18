/**
 * Output format options for cryptographic value generation
 */
export type OutputFormat = "base64" | "hex" | "buffer";

/**
 * Types of cryptographic values that can be generated
 */
export type CryptoType = "salt" | "secretKey" | "iv" | "random";

export type NodeCryptoKey = import("crypto").webcrypto.CryptoKey;

/**
 * Options interface for unified cryptographic value generation
 */
export interface CryptoGenerationOptions {
  type: CryptoType;
  outputFormat: OutputFormat;
  length?: number;
}

export type CryptoGenerationResult = string | Buffer;

export interface CryptoByteLengths {
  IV: number;
  WEB_CRYPTO_IV: number;
  SALT: number;
  SECRET_KEY: number;
  HMAC_KEY_LENGTH: number;
}

export interface Argon2Config {
  MEMORY_COST: number;
  TIME_COST: number;
  PARALLELISM: number;
}

export interface ValidationLimits {
  MAX_REASONABLE_LENGTH: number;
  MIN_SECURE_LENGTH: number;
}

/**
 * Full crypto configuration structure
 */
export interface CryptoConfig {
  BYTE_LENGTHS: CryptoByteLengths;
  ARGON2_PARAMETERS: Argon2Config;
  VALIDATION_LIMITS: ValidationLimits;
}

/**
 * Represents the result of an encryption operation
 */
export interface EncryptionResult {
  salt: string;
  iv: string;
  cipherText: string;
}

export interface EncryptionFormat {
  PREFIX: string;
  SEPARATOR: string;
  EXPECTED_PARTS: number;
  PREFIX_LENGTH: number;
}

export interface CryptoAlgorithm {
  CIPHER: string;
  KEY_USAGE: KeyUsage[];
}

export interface CryptoValidation {
  ENV_VAR_KEY_PATTERN: RegExp;
}
