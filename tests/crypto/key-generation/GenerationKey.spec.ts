import { test, expect } from "../../../fixtures/crypto.fixture";
import SystemInfo from "../../../src/utils/systemInfo";
import logger from "../../../src/utils/logger/loggerManager";

test.describe.serial("Encryption Flow @generate-key", () => {
  test("Generate secret key", async ({ cryptoCoordinator }) => {
    const secretKey = await cryptoCoordinator.generateAndStoreSecretKey({
      rotationDays: 90,
      performedBy: SystemInfo.getCurrentUsername(),
    });

    expect(secretKey).toBeTruthy();
    expect(secretKey.length).toBeGreaterThan(0);

    logger.info(`Verified: Secret key: ${secretKey} generated successfully`);
  });
});
