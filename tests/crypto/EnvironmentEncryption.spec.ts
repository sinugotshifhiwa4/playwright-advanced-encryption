// test/crypto/environment-encryption.spec.ts
import { test } from "../../fixtures/crypto.fixture";
test.describe("Environment Variable Encryption @env-encryption", () => {
  test("Encrypt environment variables", async ({ cryptoCoordinator }) => {
    const variablesToEncrypt = ["PORTAL_USERNAME", "PORTAL_PASSWORD"];

    await cryptoCoordinator.encryptEnvironmentVariables(variablesToEncrypt);
  });
});
