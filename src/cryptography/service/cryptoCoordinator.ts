import { EnvironmentFileEncryptor } from "../manager/environmentFileEncryptor";
import ConfigurationResolver from "../../configuration/environment/manager/configurationResolver";
import SecretFileManager from "../../configuration/environment/manager/secretFileManager";
import SecureKeyGenerator from "../key/secureKeyGenerator";
import ErrorHandler from "../../utils/errorHandling/errorHandler";

export class CryptoCoordinator {
  private environmentFileEncryptor: EnvironmentFileEncryptor;

  constructor(environmentFileEncryptor: EnvironmentFileEncryptor) {
    this.environmentFileEncryptor = environmentFileEncryptor;
  }

  public async generateAndStoreSecretKey(): Promise<string> {
    try {
      const currentEnvKey = ConfigurationResolver.getCurrentEnvSecretKey();

      const generatedSecretKey = SecureKeyGenerator.generateBase64SecretKey();

      await SecretFileManager.storeEnvironmentKey(currentEnvKey, generatedSecretKey, {
        skipIfExists: true,
      });

      await SecretFileManager.ensureSecretKeyExists(currentEnvKey);
      return generatedSecretKey;
    } catch (error) {
      ErrorHandler.captureError(
        error,
        "generateSecretKey",
        `Failed to generate secret key "${ConfigurationResolver.getCurrentEnvSecretKey()}"`,
      );
      throw error;
    }
  }

  public async encryptEnvironmentVariables(envVariables?: string[]): Promise<void> {
    await this.environmentFileEncryptor.encryptEnvironmentVariables(envVariables);
  }
}
