import * as argon2 from "argon2";
import * as crypto from "crypto";
import SecureKeyGenerator from "../key/secureKeyGenerator";
import SecretFileManager from "../../configuration/environment/manager/secretFileManager";
import SecretFilePathResolver from "../../configuration/environment/manager/filePath/secretFilePathResolver";
import { CRYPTO_CONSTANTS, CRYPTO_CONFIG } from "../types/crypto.config";
import { FileEncoding } from "../../utils/fileManager/internal/file-encoding.enum";
import ErrorHandler from "../../utils/errorHandling/errorHandler";

export class CryptoEngine {
  // ============================================================================
  // VALIDATION METHODS
  // ============================================================================

  public static isEncrypted(value: string): boolean {
    if (!value || typeof value !== "string") return false;
    if (!value.startsWith(CRYPTO_CONSTANTS.FORMAT.PREFIX)) return false;

    const encryptedPart = value.substring(CRYPTO_CONSTANTS.FORMAT.PREFIX.length);
    const parts = encryptedPart.split(CRYPTO_CONSTANTS.FORMAT.SEPARATOR);

    return (
      parts.length === CRYPTO_CONSTANTS.FORMAT.EXPECTED_PARTS &&
      parts.every((part) => part && this.isValidBase64(part))
    );
  }

  public static isValidBase64(value: string): boolean {
    if (!value || typeof value !== "string") {
      return false;
    }

    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(value) || value.length % 4 !== 0) {
      return false;
    }

    try {
      Buffer.from(value, FileEncoding.BASE64);
      return true;
    } catch (error) {
      ErrorHandler.captureError(error, "isValidBase64", "Failed to validate base64 string");
      return false;
    }
  }

  private static validateBase64String(value: string, fieldName: string): void {
    if (!value || typeof value !== "string") {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateBase64String",
        `${fieldName} must be a non-empty string`,
      );
    }

    if (!this.isValidBase64(value)) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateBase64String",
        `${fieldName} is not a valid base64 string`,
      );
    }
  }

  public static validateSecretKey(secretKey: string): void {
    if (!secretKey || typeof secretKey !== "string") {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateSecretKey",
        "Secret key must be a non-empty string",
      );
    }

    if (secretKey.length < 16) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateSecretKey",
        `Secret key must be at least 16 characters long`,
      );
    }
  }

  public static validateInputs(value: string, secretKey: string, operation: string): void {
    if (!value || typeof value !== "string") {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateInputs",
        `${operation}: Value must be a non-empty string`,
      );
    }
    if (!secretKey || typeof secretKey !== "string") {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateSecretKey",
        `${operation}: Secret key must be a non-empty string`,
      );
    }
  }

  // ============================================================================
  // ENVIRONMENT & KEY MANAGEMENT
  // ============================================================================

  public static async getSecretKeyFromEnvironment(secretKeyVariable: string): Promise<string> {
    try {
      const secretKeyValue = await SecretFileManager.getKeyValue(
        SecretFilePathResolver.getSecretFilePath(),
        secretKeyVariable,
      );

      if (!secretKeyValue) {
        ErrorHandler.logAndThrow(
          "CryptoEngine.getSecretKeyFromEnvironment",
          `Secret key variable '${secretKeyVariable}' not found in environment file`,
        );
      }

      return secretKeyValue;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "getSecretKeyFromEnvironment",
        `Failed to load secret key variable '${secretKeyVariable}`,
      );
      throw error;
    }
  }

  // ============================================================================
  // WEB CRYPTO API OPERATIONS
  // ============================================================================

  /**
   * Computes HMAC using Web Crypto API
   * @param key The CryptoKey for HMAC
   * @param data The data buffer to sign
   * @returns Base64-encoded HMAC signature
   */
  public static async computeHMAC(
    key: crypto.webcrypto.CryptoKey,
    data: Uint8Array,
  ): Promise<string> {
    try {
      const signature = await crypto.webcrypto.subtle.sign("HMAC", key, data);
      return Buffer.from(signature).toString(FileEncoding.BASE64);
    } catch (error) {
      ErrorHandler.captureError(error, "computeHMAC", "Failed to compute HMAC.");
      throw error;
    }
  }

  /**
   * Constant-time comparison to prevent timing attacks
   */
  public static constantTimeCompare(firstValue: string, secondValue: string): boolean {
    if (firstValue.length !== secondValue.length) return false;

    let comparisonResult = 0;
    for (let i = 0; i < firstValue.length; i++) {
      comparisonResult |= firstValue.charCodeAt(i) ^ secondValue.charCodeAt(i);
    }
    return comparisonResult === 0;
  }

  /**
   * Encrypts data using Web Crypto API with AES-GCM
   * @param iv The initialization vector as Uint8Array
   * @param key The CryptoKey for encryption
   * @param value The plaintext string to encrypt
   * @returns Encrypted data as ArrayBuffer
   */
  public static async encryptBuffer(
    iv: Uint8Array,
    key: crypto.webcrypto.CryptoKey,
    value: string,
  ): Promise<ArrayBuffer> {
    try {
      const textEncoder = new TextEncoder();
      return await crypto.webcrypto.subtle.encrypt(
        {
          name: CRYPTO_CONSTANTS.ALGORITHM.CIPHER,
          iv: iv,
        },
        key,
        textEncoder.encode(value),
      );
    } catch (error) {
      ErrorHandler.captureError(error, "encryptBuffer", "Failed to encrypt with AES-GCM.");
      throw error;
    }
  }

  /**
   * Decrypts data using Web Crypto API with AES-GCM
   * @param iv The initialization vector as Uint8Array
   * @param key The CryptoKey for decryption
   * @param cipherBuffer The encrypted data as Uint8Array
   * @returns Decrypted data as ArrayBuffer
   */
  public static async decryptBuffer(
    iv: Uint8Array,
    key: crypto.webcrypto.CryptoKey,
    cipherBuffer: Uint8Array,
  ): Promise<ArrayBuffer> {
    try {
      return await crypto.webcrypto.subtle.decrypt(
        {
          name: CRYPTO_CONSTANTS.ALGORITHM.CIPHER,
          iv: iv,
        },
        key,
        cipherBuffer,
      );
    } catch (error) {
      const errorAsError = error as Error;
      ErrorHandler.captureError(
        error,
        "decryptBuffer",
        `Failed to decrypt with AES-GCM, message: ${errorAsError.message}`,
      );
      throw error;
    }
  }

  // ============================================================================
  // KEY DERIVATION WITH ARGON2
  // ============================================================================

  /**
   * Derives encryption and HMAC keys using Argon2id
   * Returns Web Crypto API compatible CryptoKey objects
   */
  public static async deriveKeysWithArgon2(
    secretKey: string,
    salt: string,
  ): Promise<{
    encryptionKey: crypto.webcrypto.CryptoKey;
    hmacKey: crypto.webcrypto.CryptoKey;
  }> {
    try {
      this.validateBase64String(salt, "salt");

      const saltBuffer = Buffer.from(salt, FileEncoding.BASE64);

      const options: argon2.Options = {
        type: argon2.argon2id,
        hashLength:
          CRYPTO_CONFIG.BYTE_LENGTHS.SECRET_KEY + CRYPTO_CONFIG.BYTE_LENGTHS.HMAC_KEY_LENGTH,
        salt: saltBuffer,
        memoryCost: CRYPTO_CONFIG.ARGON2_PARAMETERS.MEMORY_COST,
        timeCost: CRYPTO_CONFIG.ARGON2_PARAMETERS.TIME_COST,
        parallelism: CRYPTO_CONFIG.ARGON2_PARAMETERS.PARALLELISM,
      };

      const derivedKeyBuffer = await this.argon2Hashing(secretKey, options);

      const encryptionKeyBuffer = derivedKeyBuffer.subarray(
        0,
        CRYPTO_CONFIG.BYTE_LENGTHS.SECRET_KEY,
      );
      const hmacKeyBuffer = derivedKeyBuffer.subarray(CRYPTO_CONFIG.BYTE_LENGTHS.SECRET_KEY);

      const encryptionKey = await this.importKeyForCrypto(Buffer.from(encryptionKeyBuffer));
      const hmacKey = await this.importKeyForHMAC(Buffer.from(hmacKeyBuffer));

      return { encryptionKey, hmacKey };
    } catch (error) {
      ErrorHandler.captureError(error, "deriveKeysWithArgon2", "Failed to derive keys.");
      throw error;
    }
  }

  private static async argon2Hashing(secretKey: string, options: argon2.Options): Promise<Buffer> {
    try {
      return await argon2.hash(secretKey, {
        ...options,
        raw: true,
      });
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "argon2Hashing",
        "Failed to derive key using Argon2 hashing.",
      );
      throw error;
    }
  }

  /**
   * Imports a key for AES-GCM encryption/decryption using Web Crypto API
   */
  private static async importKeyForCrypto(keyBuffer: Buffer): Promise<crypto.webcrypto.CryptoKey> {
    try {
      return await crypto.webcrypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: CRYPTO_CONSTANTS.ALGORITHM.CIPHER },
        false,
        CRYPTO_CONSTANTS.ALGORITHM.KEY_USAGE,
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "importKeyForCrypto",
        "Failed to import key for Web Crypto API.",
      );
      throw error;
    }
  }

  /**
   * Imports a key for HMAC operations using Web Crypto API
   */
  private static async importKeyForHMAC(keyBuffer: Buffer): Promise<crypto.webcrypto.CryptoKey> {
    try {
      return await crypto.webcrypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    } catch (error) {
      ErrorHandler.captureError(error, "importKeyForHMAC", "Failed to import key for HMAC.");
      throw error;
    }
  }

  // ============================================================================
  // HMAC OPERATIONS (CONSOLIDATED)
  // ============================================================================

  /**
   * Consolidated method for preparing HMAC data from components
   * Used by both encryption and decryption operations
   * Returns Uint8Array for Web Crypto API compatibility
   */
  public static prepareHMACData(salt: string, iv: string, cipherText: string): Uint8Array {
    const saltBuffer = Buffer.from(salt, FileEncoding.BASE64);
    const ivBuffer = Buffer.from(iv, FileEncoding.BASE64);
    const cipherBuffer = Buffer.from(cipherText, FileEncoding.BASE64);

    const concatenated = Buffer.concat([saltBuffer, ivBuffer, cipherBuffer]);
    return new Uint8Array(concatenated);
  }

  /**
   * Verify HMAC integrity using Web Crypto API
   */
  public static async verifyHMAC(
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
    hmacKey: crypto.webcrypto.CryptoKey,
  ): Promise<void> {
    try {
      const dataToHmac = this.prepareHMACData(salt, iv, cipherText);
      const computedHmac = await this.computeHMAC(hmacKey, dataToHmac);

      if (!this.constantTimeCompare(computedHmac, receivedHmac)) {
        ErrorHandler.logAndThrow(
          "CryptoEngine.verifyHMAC",
          "Authentication failed: HMAC mismatch - Invalid key or tampered data",
        );
      }
    } catch (error) {
      ErrorHandler.captureError(error, "verifyHMAC", "Failed to verify HMAC.");
      throw error;
    }
  }

  // ============================================================================
  // ENCRYPTION HELPERS
  // ============================================================================

  /**
   * Helper to validate encryption prerequisites
   */
  public static async validateEncryptionPrerequisites(
    value: string,
    secretKeyVariable: string,
  ): Promise<string> {
    const actualSecretKey = await this.getSecretKeyFromEnvironment(secretKeyVariable);
    this.validateSecretKey(actualSecretKey);
    this.validateInputs(value, actualSecretKey, "encrypt");
    return actualSecretKey;
  }

  /**
   * Generates all components needed for encryption
   * Returns Web Crypto API compatible types
   */
  public static async generateEncryptionComponents(secretKey: string): Promise<{
    salt: string;
    iv: Uint8Array;
    encryptionKey: crypto.webcrypto.CryptoKey;
    hmacKey: crypto.webcrypto.CryptoKey;
  }> {
    const salt = SecureKeyGenerator.generateBase64Salt();
    const iv = SecureKeyGenerator.generateWebCryptoIV();

    const { encryptionKey, hmacKey } = await this.deriveKeysWithArgon2(secretKey, salt);

    return {
      salt,
      iv,
      encryptionKey,
      hmacKey,
    };
  }

  private static formatEncryptedPayload(
    salt: string,
    iv: string,
    cipherText: string,
    hmacBase64: string,
  ): string {
    return `${CRYPTO_CONSTANTS.FORMAT.PREFIX}${salt}:${iv}:${cipherText}:${hmacBase64}`;
  }

  /**
   * Helper to create the encrypted payload with HMAC
   * Uses Web Crypto API throughout
   */
  public static async createEncryptedPayload(
    value: string,
    salt: string,
    iv: Uint8Array,
    encryptionKey: crypto.webcrypto.CryptoKey,
    hmacKey: crypto.webcrypto.CryptoKey,
  ): Promise<string> {
    // Encrypt the value
    const encryptedBuffer = await this.encryptBuffer(iv, encryptionKey, value);
    const cipherText = Buffer.from(encryptedBuffer).toString(FileEncoding.BASE64);
    const ivBase64 = Buffer.from(iv).toString(FileEncoding.BASE64);

    // Compute HMAC using consolidated method
    const dataToHmac = this.prepareHMACData(salt, ivBase64, cipherText);
    const hmacBase64 = await this.computeHMAC(hmacKey, dataToHmac);

    return this.formatEncryptedPayload(salt, ivBase64, cipherText, hmacBase64);
  }

  // ============================================================================
  // DECRYPTION HELPERS (CONSOLIDATED VALIDATION)
  // ============================================================================

  /**
   * Consolidated validation for encrypted data components
   * Combines format, part count, required parts, and base64 validation
   */
  private static validateEncryptedComponents(
    encryptedData: string,
    parts: string[],
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
  ): void {
    // Validate format prefix
    if (!encryptedData.startsWith(CRYPTO_CONSTANTS.FORMAT.PREFIX)) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateEncryptedComponents",
        "Invalid encrypted format: Missing prefix",
      );
    }

    // Validate part count
    if (parts.length !== CRYPTO_CONSTANTS.FORMAT.EXPECTED_PARTS) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateEncryptedComponents",
        `Invalid format. Expected ${CRYPTO_CONSTANTS.FORMAT.EXPECTED_PARTS} parts, got ${parts.length}`,
      );
    }

    // Validate required parts are present
    const missingParts = [];
    if (!salt) missingParts.push("salt");
    if (!iv) missingParts.push("iv");
    if (!cipherText) missingParts.push("cipherText");
    if (!receivedHmac) missingParts.push("hmac");

    if (missingParts.length > 0) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateEncryptedComponents",
        `Authentication failed: Missing components - ${missingParts.join(", ")}`,
      );
    }

    // Validate base64 encoding of all components
    const invalidComponents = [];
    if (!this.isValidBase64(salt)) invalidComponents.push("salt");
    if (!this.isValidBase64(iv)) invalidComponents.push("iv");
    if (!this.isValidBase64(cipherText)) invalidComponents.push("cipherText");
    if (!this.isValidBase64(receivedHmac)) invalidComponents.push("hmac");

    if (invalidComponents.length > 0) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateEncryptedComponents",
        `Invalid format for components: ${invalidComponents.join(", ")}`,
      );
    }
  }

  /**
   * Parse and validate encrypted data format (now uses consolidated validation)
   */
  public static parseEncryptedData(encryptedData: string): {
    salt: string;
    iv: string;
    cipherText: string;
    receivedHmac: string;
  } {
    const encryptedPart = encryptedData.substring(CRYPTO_CONSTANTS.FORMAT.PREFIX.length);
    const parts = encryptedPart.split(CRYPTO_CONSTANTS.FORMAT.SEPARATOR);
    const [salt, iv, cipherText, receivedHmac] = parts;

    // Consolidated validation
    this.validateEncryptedComponents(encryptedData, parts, salt, iv, cipherText, receivedHmac);

    return { salt, iv, cipherText, receivedHmac };
  }

  /**
   * Performs decryption using Web Crypto API
   * Converts base64 strings to Uint8Array for Web Crypto compatibility
   */
  public static async performDecryption(
    iv: string,
    encryptionKey: crypto.webcrypto.CryptoKey,
    cipherText: string,
  ): Promise<ArrayBuffer> {
    const ivBuffer = new Uint8Array(Buffer.from(iv, FileEncoding.BASE64));
    const cipherBuffer = new Uint8Array(Buffer.from(cipherText, FileEncoding.BASE64));

    return await this.decryptBuffer(ivBuffer, encryptionKey, cipherBuffer);
  }

  // ============================================================================
  // LEGACY PUBLIC VALIDATION METHODS (kept for backward compatibility)
  // ============================================================================

  public static validatePartCount(parts: string[]): void {
    if (parts.length !== CRYPTO_CONSTANTS.FORMAT.EXPECTED_PARTS) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validatePartCount",
        `Invalid format. Expected ${CRYPTO_CONSTANTS.FORMAT.EXPECTED_PARTS} parts, got ${parts.length}`,
      );
    }
  }

  public static validateRequiredParts(
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
  ): void {
    const missingParts = [];
    if (!salt) missingParts.push("salt");
    if (!iv) missingParts.push("iv");
    if (!cipherText) missingParts.push("cipherText");
    if (!receivedHmac) missingParts.push("hmac");

    if (missingParts.length > 0) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateRequiredParts",
        `Authentication failed: Missing components - ${missingParts.join(", ")}`,
      );
    }
  }

  public static validateBase64Components(
    salt: string,
    iv: string,
    cipherText: string,
    receivedHmac: string,
  ): void {
    if (!this.isValidBase64(salt)) {
      ErrorHandler.logAndThrow("CryptoEngine.validateBase64Components", "Invalid salt format");
    }
    if (!this.isValidBase64(iv)) {
      ErrorHandler.logAndThrow("CryptoEngine.validateBase64Components", "Invalid IV format");
    }
    if (!this.isValidBase64(cipherText)) {
      ErrorHandler.logAndThrow(
        "CryptoEngine.validateBase64Components",
        "Invalid cipherText format",
      );
    }
    if (!this.isValidBase64(receivedHmac)) {
      ErrorHandler.logAndThrow("CryptoEngine.validateBase64Components", "Invalid HMAC format");
    }
  }
}
