import { test } from "../../../fixtures/crypto.fixture";
import logger from "../../../src/utils/logger/loggerManager";

test.describe("Environment Variable Encryption @env-encryption", () => {
  test("Encrypt environment variables", async ({ cryptoCoordinator }) => {
    const variablesToEncrypt = ["PORTAL_USERNAME", "PORTAL_PASSWORD"];

    await cryptoCoordinator.encryptEnvironmentVariables(variablesToEncrypt);
    logger.info("Verified: Environment variables encrypted successfully");
  });
});
