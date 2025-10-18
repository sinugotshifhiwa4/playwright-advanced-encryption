import { test } from "../../fixtures/crypto.fixture";

test.describe.serial("Encryption Flow @full-encryption", () => {
  test("Generate secret key", async ({ cryptoCoordinator }) => {
    await cryptoCoordinator.generateAndStoreSecretKey();
  });

  test("Encrypt environment variables", async ({ cryptoCoordinator }) => {
    const variablesToEncrypt = ["PORTAL_USERNAME", "PORTAL_PASSWORD"];

    // Encrypt the variables
    await cryptoCoordinator.encryptEnvironmentVariables(variablesToEncrypt);
  });
});
