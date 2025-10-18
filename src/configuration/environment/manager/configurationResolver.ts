import EnvironmentDetector from "../../detector/environmentDetector";
import { CryptoService } from "../../../cryptography/service/cryptoService";
import DataSanitizer from "../../../utils/sanitization/dataSanitizer";
import { Credentials } from "../../../utils/auth/storage/internal/credentials.types";
import SecretFilePathResolver from "./filePath/secretFilePathResolver";
import StagesFilePathResolver from "./filePath/stagesFilePathResolver";
import { EnvironmentStage } from "../../environment/constants/environment.constants";
import ErrorHandler from "../../../utils/errorHandling/errorHandler";

export default class ConfigurationResolver {
  public static async getEnvironmentVariable<T>(
    getValue: () => T,
    variableName: string,
    methodName: string,
    errorMessage: string,
  ): Promise<T> {
    try {
      const value = getValue();
      this.validateEnvironmentVariable(String(value), variableName);

      const shouldSanitize = EnvironmentDetector.isCI();

      if (typeof value === "string") {
        return shouldSanitize ? (DataSanitizer.sanitizeString(value) as T) : value;
      }

      return value;
    } catch (error) {
      ErrorHandler.captureError(error, methodName, errorMessage);
      throw error;
    }
  }

  /**
   * Decrypts credentials using the provided secret key
   */
  public static async decryptCredentials(
    username: string,
    password: string,
    secretKey: string,
  ): Promise<Credentials> {
    try {
      const decryptedCredentials = await CryptoService.decryptMultiple(
        [username, password],
        secretKey,
      );

      return {
        username: decryptedCredentials[0],
        password: decryptedCredentials[1],
      };
    } catch (error) {
      ErrorHandler.captureError(error, "decryptCredentials", "Failed to decrypt credentials");
      throw error;
    }
  }

  /**
   * Verifies that the provided credentials contain both a username and password
   */
  public static verifyCredentials(credentials: Credentials): void {
    if (!credentials.username || !credentials.password) {
      ErrorHandler.logAndThrow(
        "FetchLocalEnvironmentVariables",
        "Invalid credentials: Missing username or password.",
      );
    }
  }

  /**
   * Validates that an environment variable is not empty
   */
  public static validateEnvironmentVariable(value: string, variableName: string): void {
    if (!value || value.trim() === "") {
      ErrorHandler.logAndThrow(
        "FetchLocalEnvironmentVariables",
        `Environment variable ${variableName} is not set or is empty`,
      );
    }
  }

  public static getCurrentEnvSecretKey(): string {
    return this.getCurrentEnvValue(
      SecretFilePathResolver.getSecretVariables(),
      "getSecretKeyVariable",
      "secret key",
    );
  }

  public static getCurrentEnvFilePath(): string {
    return this.getCurrentEnvValue(
      StagesFilePathResolver.getEnvironmentStages(),
      "getEnvironmentStageFilePath",
      "environment file",
    );
  }

  /**
   * Generic helper to get environment-specific values
   */
  private static getCurrentEnvValue(
    source: Record<string, string>,
    methodName: string,
    resourceType: string,
  ): string {
    const currentEnvironment = EnvironmentDetector.getCurrentEnvironmentStage();
    return this.getEnvValue(
      source,
      currentEnvironment,
      methodName,
      `Failed to select ${resourceType}. Invalid environment: ${currentEnvironment}. Must be 'dev', 'qa', 'uat', 'preprod' or 'prod'`,
    );
  }

  private static getEnvValue<T extends Record<string, string>>(
    source: T,
    environment: EnvironmentStage,
    methodName: string,
    errorMessage: string,
  ): string {
    if (source[environment]) {
      return source[environment];
    }

    ErrorHandler.logAndThrow(methodName, errorMessage);
  }
}
