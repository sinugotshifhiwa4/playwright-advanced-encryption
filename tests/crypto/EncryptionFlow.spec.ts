import { test } from "../../fixtures/crypto.fixture";
import EnvironmentVariables from "../../src/configuration/environment/variables/environmentVariables";

test.describe.serial("Encryption Flow @full-encryption", () => {
  test("Generate secret key", async ({ cryptoCoordinator }) => {
    await cryptoCoordinator.generateAndStoreSecretKey();
  });

  test("Encrypt environment variables", async ({ cryptoCoordinator }) => {
    const variablesToEncrypt = [EnvironmentVariables.PORTAL_USERNAME, EnvironmentVariables.PORTAL_PASSWORD];

    // Encrypt the variables
    await cryptoCoordinator.encryptEnvironmentVariables(variablesToEncrypt);
  });
});
