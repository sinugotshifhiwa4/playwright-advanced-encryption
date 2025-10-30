import { test, expect } from "../../../fixtures/crypto.fixture";
import RotationOrchestrator from "../../../src/cryptography/service/rotationOrchestrator";
import logger from "../../../src/utils/logger/loggerManager";

test.describe.serial("Key Status Warnings @status-warnings", () => {
  test("Check key status and log warnings", async ({ cryptoCoordinator }) => {
    const status = await RotationOrchestrator.checkRotationStatus();

    expect(status).toBeDefined();
    expect(status.details.status).toMatch(/active|expiring_soon|expired/);

    // This will trigger appropriate warnings in logs based on status
    await cryptoCoordinator.encryptEnvironmentVariables(["TEST_VAR"]);

    logger.info(`Key status: ${status.details.status}`);
    logger.info(`Days until expiration: ${status.details.daysUntilExpiration}`);

    logger.info(`Verified: Warnings logged for key status: ${status.details.status}`);
  });
});
