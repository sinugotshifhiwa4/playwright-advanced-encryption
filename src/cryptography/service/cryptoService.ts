import { CryptoEngine } from "../engine/cryptoEngine";
import ErrorHandler from "../../utils/errorHandling/errorHandler";

export class CryptoService {
  /**
   * Main encrypt method using Web Crypto API throughout
   * All key handling is now consistent with Web Crypto standards
   */
  public static async encrypt(value: string, secretKeyVariable: string): Promise<string> {
    try {
      // Step 1: Validate prerequisites
      const secretKey = await CryptoEngine.validateEncryptionPrerequisites(
        value,
        secretKeyVariable,
      );

      // Step 2: Generate encryption components (returns Web Crypto types)
      const { salt, iv, encryptionKey, hmacKey } =
        await CryptoEngine.generateEncryptionComponents(secretKey);

      // Step 3: Create encrypted payload using Web Crypto API
      return await CryptoEngine.createEncryptedPayload(value, salt, iv, encryptionKey, hmacKey);
    } catch (error) {
      ErrorHandler.captureError(error, "encrypt", "Failed to encrypt with AES-GCM.");
      throw error;
    }
  }

  /**
   * Encrypts multiple values in parallel
   */
  public static async encryptMultiple(
    values: string[],
    secretKeyVariable: string,
  ): Promise<string[]> {
    return Promise.all(values.map((value) => this.encrypt(value, secretKeyVariable)));
  }

  /**
   * Main decrypt method using Web Crypto API throughout
   * All key handling is now consistent with Web Crypto standards
   */
  public static async decrypt(encryptedData: string, secretKeyVariable: string): Promise<string> {
    const resolvedSecretKey = await CryptoEngine.getSecretKeyFromEnvironment(secretKeyVariable);
    CryptoEngine.validateSecretKey(resolvedSecretKey);
    CryptoEngine.validateInputs(encryptedData, resolvedSecretKey, "decrypt");

    try {
      // Parse and validate encrypted data format
      const { salt, iv, cipherText, receivedHmac } = CryptoEngine.parseEncryptedData(encryptedData);

      // Derive keys using Argon2 (returns Web Crypto CryptoKey objects)
      const { encryptionKey, hmacKey } = await CryptoEngine.deriveKeysWithArgon2(
        resolvedSecretKey,
        salt,
      );

      // Verify HMAC integrity using Web Crypto API
      await CryptoEngine.verifyHMAC(salt, iv, cipherText, receivedHmac, hmacKey);

      // Perform decryption using Web Crypto API
      const decryptedBuffer = await CryptoEngine.performDecryption(iv, encryptionKey, cipherText);

      // Decode the decrypted buffer to string
      return new TextDecoder().decode(new Uint8Array(decryptedBuffer));
    } catch (error) {
      ErrorHandler.captureError(error, "decrypt", "Failed to decrypt with AES-GCM.");
      throw error;
    }
  }

  /**
   * Decrypts multiple values in parallel
   */
  public static async decryptMultiple(
    encryptedValues: string[],
    secretKeyVariable: string,
  ): Promise<string[]> {
    if (!Array.isArray(encryptedValues)) {
      ErrorHandler.logAndThrow("decryptMultiple", "encryptedValues must be an array");
    }

    if (encryptedValues.length === 0) {
      return [];
    }

    try {
      return await Promise.all(
        encryptedValues.map((data) => this.decrypt(data, secretKeyVariable)),
      );
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "decryptMultiple",
        "Failed to decrypt multiple values with AES-GCM.",
      );
      throw error;
    }
  }
}
