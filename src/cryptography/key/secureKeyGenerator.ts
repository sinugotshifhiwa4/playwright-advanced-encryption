import * as crypto from "crypto";
import { CRYPTO_CONFIG, CRYPTO_TYPE, OUTPUT_FORMAT } from "../types/crypto.config";
import { CryptoGenerationOptions } from "../types/crypto.types";
import { FileEncoding } from "../../utils/fileManager/internal/file-encoding.enum";
import ErrorHandler from "../../utils/errorHandling/errorHandler";

export default class SecureKeyGenerator {
  // Set base64 as buffer encoding
  private static readonly BASE_64: BufferEncoding = FileEncoding.BASE64;
  private static readonly IV_LENGTH = CRYPTO_CONFIG.BYTE_LENGTHS.IV;
  private static readonly WEB_CRYPTO_IV_LENGTH = CRYPTO_CONFIG.BYTE_LENGTHS.WEB_CRYPTO_IV;
  private static readonly SALT_LENGTH = CRYPTO_CONFIG.BYTE_LENGTHS.SALT;
  private static readonly SECRET_KEY_LENGTH = CRYPTO_CONFIG.BYTE_LENGTHS.SECRET_KEY;
  private static readonly MIN_VALIDATION_LIMIT = CRYPTO_CONFIG.VALIDATION_LIMITS.MIN_SECURE_LENGTH;
  private static readonly MAX_VALIDATION_LIMIT =
    CRYPTO_CONFIG.VALIDATION_LIMITS.MAX_REASONABLE_LENGTH;

  /**
   * Generates a cryptographically secure initialization vector (IV) as a base64-encoded string.
   * @param length The IV length in bytes. Defaults to the configured IV length.
   * @returns A base64-encoded string containing the IV.
   * @throws {Error} If the length is invalid or IV generation fails.
   */
  public static generateBase64IV(length: number = this.IV_LENGTH): string {
    return this.generate({
      type: CRYPTO_TYPE.IV,
      outputFormat: OUTPUT_FORMAT.BASE64,
      length,
    }) as string;
  }

  /**
   * Generates a cryptographically secure initialization vector (IV) as a Buffer.
   * @param length The IV length in bytes. Defaults to the configured IV length.
   * @returns A Buffer containing the IV.
   * @throws {Error} If the length is invalid or IV generation fails.
   */
  public static generateBufferIV(length: number = this.IV_LENGTH): Buffer {
    return this.generate({
      type: CRYPTO_TYPE.IV,
      outputFormat: OUTPUT_FORMAT.BUFFER,
      length,
    }) as Buffer;
  }

  /**
   * Generates a cryptographically secure IV as Uint8Array for Web Crypto API.
   * This is the preferred method for Web Crypto API operations.
   * @param length The IV length in bytes. Defaults to the configured Web Crypto IV length.
   * @returns A Uint8Array containing the secure IV.
   * @throws {Error} If the length is invalid or IV generation fails.
   */
  public static generateWebCryptoIV(length: number = this.WEB_CRYPTO_IV_LENGTH): Uint8Array {
    this.validateLength(length, "generateWebCryptoIV");

    try {
      return this.generateSecureUint8Array(length);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "generateWebCryptoIV",
        `Failed to generate Web Crypto IV of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Unified method to generate cryptographically secure random values with flexible options.
   * @param options Configuration object specifying type, format, and optional length
   * @returns Generated value in the specified format (string or Buffer)
   * @throws {Error} If the options are invalid or generation fails
   */
  public static generate(options: CryptoGenerationOptions): string | Buffer {
    const { type, outputFormat, length } = options;

    // Determine default length based on type
    let defaultLength: number;
    switch (type) {
      case CRYPTO_TYPE.SALT:
        defaultLength = this.SALT_LENGTH;
        break;
      case CRYPTO_TYPE.SECRET_KEY:
        defaultLength = this.SECRET_KEY_LENGTH;
        break;
      case CRYPTO_TYPE.IV:
        defaultLength = this.IV_LENGTH;
        break;
      case CRYPTO_TYPE.RANDOM:
        defaultLength = 32;
        break;
      default:
        throw new Error(`Invalid crypto type: ${type}`);
    }

    const finalLength = length ?? defaultLength;
    const methodName = `generate_${type}_${outputFormat}`;

    // Generate the secure bytes
    const buffer = this.generateSecureBytes(finalLength, methodName);

    // Return in the requested format
    switch (outputFormat) {
      case OUTPUT_FORMAT.BASE64:
        return buffer.toString(this.BASE_64);
      case OUTPUT_FORMAT.HEX:
        return buffer.toString(FileEncoding.HEX);
      case OUTPUT_FORMAT.BUFFER:
        return buffer;
      default:
        throw new Error(`Invalid output format: ${outputFormat}`);
    }
  }

  /**
   * Generates a cryptographically secure random salt as a base64 string.
   * @param length The salt length in bytes. Defaults to the configured salt length.
   * @returns A base64-encoded string containing the salt.
   * @throws {Error} If the length is invalid or salt generation fails.
   */
  public static generateBase64Salt(length: number = this.SALT_LENGTH): string {
    return this.generate({
      type: CRYPTO_TYPE.SALT,
      outputFormat: OUTPUT_FORMAT.BASE64,
      length,
    }) as string;
  }

  /**
   * Generates a cryptographically secure random salt as a Buffer.
   * @param length The salt length in bytes. Defaults to the configured salt length.
   * @returns A Buffer containing the salt.
   * @throws {Error} If the length is invalid or salt generation fails.
   */
  public static generateBufferSalt(length: number = this.SALT_LENGTH): Buffer {
    return this.generate({
      type: CRYPTO_TYPE.SALT,
      outputFormat: OUTPUT_FORMAT.BUFFER,
      length,
    }) as Buffer;
  }

  /**
   * Generates a cryptographically secure random secret key as a base64 string.
   * @param length The length of the secret key in bytes. Defaults to the configured secret key length.
   * @returns A base64-encoded string containing the secret key.
   * @throws {Error} If the length is invalid or key generation fails.
   */
  public static generateBase64SecretKey(length: number = this.SECRET_KEY_LENGTH): string {
    return this.generate({
      type: CRYPTO_TYPE.SECRET_KEY,
      outputFormat: OUTPUT_FORMAT.BASE64,
      length,
    }) as string;
  }

  /**
   * Generates a cryptographically secure random secret key as a Buffer.
   * @param length The length of the secret key in bytes. Defaults to the configured secret key length.
   * @returns A Buffer containing the secret key.
   * @throws {Error} If the length is invalid or key generation fails.
   */
  public static generateBufferSecretKey(length: number = this.SECRET_KEY_LENGTH): Buffer {
    return this.generate({
      type: CRYPTO_TYPE.SECRET_KEY,
      outputFormat: OUTPUT_FORMAT.BUFFER,
      length,
    }) as Buffer;
  }

  /**
   * Generates a hex-encoded cryptographically secure random value.
   * @param length The length in bytes. Defaults to 32 bytes.
   * @returns A hex-encoded string.
   * @throws {Error} If the length is invalid or generation fails.
   */
  public static generateHexString(length: number = 32): string {
    return this.generate({
      type: CRYPTO_TYPE.RANDOM,
      outputFormat: OUTPUT_FORMAT.HEX,
      length,
    }) as string;
  }

  /**
   * Securely wipes a Buffer by filling it with random data, then setting all bytes to 0.
   * This is a simple, but reasonable approach to securely erasing sensitive data.
   * @param buffer The Buffer to wipe
   */
  public static secureWipe(buffer: Buffer): void {
    if (buffer && buffer.length > 0) {
      crypto.randomFillSync(buffer);
      buffer.fill(0);
    }
  }

  // PRIVATE METHODS

  /**
   * Core method to generate cryptographically secure random bytes with validation and error handling
   * @param length The length in bytes
   * @param methodName The calling method name for error context
   * @returns A Buffer containing cryptographically secure random bytes
   * @throws {Error} If the length is invalid or generation fails
   */
  private static generateSecureBytes(length: number, methodName: string): Buffer {
    this.validateLength(length, methodName);

    try {
      return crypto.randomBytes(length);
    } catch (error) {
      ErrorHandler.captureError(
        error,
        methodName,
        `Failed to generate secure bytes of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Checks if Web Crypto API is available in the current environment.
   * @returns {boolean} True if Web Crypto API is available, false otherwise.
   */
  private static isWebCryptoAvailable(): boolean {
    return (
      typeof globalThis !== "undefined" &&
      typeof globalThis?.crypto !== "undefined" &&
      typeof globalThis.crypto?.subtle !== "undefined" &&
      typeof globalThis.crypto.getRandomValues === "function"
    );
  }

  /**
   * Generates a cryptographically secure Uint8Array using Web Crypto API or Node.js crypto.
   * This method ensures compatibility with Web Crypto API operations.
   * @param length The length in bytes for the Uint8Array.
   * @returns A Uint8Array containing cryptographically secure random values.
   * @throws {Error} If the length is invalid or generation fails.
   */
  private static generateSecureUint8Array(length: number): Uint8Array {
    this.validateLength(length, "generateSecureUint8Array");

    try {
      if (this.isWebCryptoAvailable()) {
        const array = new Uint8Array(length);
        globalThis.crypto.getRandomValues(array);
        return array;
      } else {
        // Fallback to Node.js crypto for environments without Web Crypto
        return new Uint8Array(crypto.randomBytes(length));
      }
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "generateSecureUint8Array",
        `Failed to generate secure Uint8Array of length ${length}`,
      );
      throw error;
    }
  }

  /**
   * Validates that generated values meet minimum entropy requirements.
   * This is a basic check - for production, consider more sophisticated entropy analysis.
   * @param buffer The buffer to validate
   * @returns True if the buffer appears to have sufficient entropy
   */
  private static hasMinimumEntropy(buffer: Buffer): boolean {
    if (buffer.length === 0) return false;

    // Simple entropy check: ensure not all bytes are the same
    const firstByte = buffer[0];
    return !buffer.every((byte) => byte === firstByte);
  }

  /**
   * Validates that a length parameter is within secure bounds
   * @param length The length to validate
   * @param methodName The calling method name for error context
   * @throws {Error} If the length is invalid
   */
  private static validateLength(length: number, methodName: string): void {
    if (!Number.isInteger(length)) {
      ErrorHandler.logAndThrow(methodName, `Length must be an integer, got ${length}`);
    }

    if (length < this.MIN_VALIDATION_LIMIT) {
      ErrorHandler.logAndThrow(
        methodName,
        `Length must be at least ${this.MIN_VALIDATION_LIMIT} bytes for security, got ${length}`,
      );
    }

    if (length > this.MAX_VALIDATION_LIMIT) {
      ErrorHandler.logAndThrow(
        methodName,
        `Length ${length} exceeds maximum reasonable length of ${this.MAX_VALIDATION_LIMIT} bytes`,
      );
    }
  }
}
