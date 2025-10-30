import { test, expect } from "../../../fixtures/crypto.fixture";
import RotationOrchestrator from "../../../src/cryptography/service/rotationOrchestrator";
import SystemInfo from "../../../src/utils/systemInfo";
import logger from "../../../src/utils/logger/loggerManager";

test.describe.serial("Integration Test @integration", () => {
  test("Complete lifecycle: Generate → Encrypt → Rotate → Verify", async ({ cryptoCoordinator }) => {
    // Step 1: Generate key
    logger.info("Step 1: Generating key...");
    const secretKey = await cryptoCoordinator.generateAndStoreSecretKey({
      rotationDays: 1,
      performedBy: "integration-test",
    });
    expect(secretKey).toBeTruthy();
    expect(secretKey.length).toBeGreaterThan(0);

    // Step 2: Encrypt variables
    logger.info("Step 2: Encrypting variables...");
    await cryptoCoordinator.encryptEnvironmentVariables(["PORTAL_USERNAME", "PORTAL_PASSWORD"]);

    // Step 3: Check initial status
    logger.info("Step 3: Checking status...");
    const initialStatus = await RotationOrchestrator.checkRotationStatus();
    expect(initialStatus.details.encryptedVariableCount).toBeGreaterThan(0);
    logger.info(`Verified: Found ${initialStatus.details.encryptedVariableCount} encrypted variables`);

    // Step 4: Rotate key
    logger.info("Step 4: Rotating key...");
    const rotationResult = await RotationOrchestrator.rotateKeyWithReEncryption({
      rotationReason: "manual",
      rotationDays: 90,
      performedBy: SystemInfo.getCurrentUsername(),
      forceRotation: true,
    });
    expect(rotationResult.success).toBe(true);
    expect(rotationResult.variablesProcessed).toBeGreaterThan(0);
    expect(rotationResult.variablesFailed).toHaveLength(0);

    // Step 5: Verify after rotation
    logger.info("Step 5: Verifying rotation...");
    const finalStatus = await RotationOrchestrator.checkRotationStatus();
    expect(finalStatus.needsRotation).toBe(false);
    expect(finalStatus.details.status).toBe("active");

    // Step 6: Get history
    logger.info("Step 6: Checking history...");
    const history = await RotationOrchestrator.getRotationHistory(5);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].success).toBe(true);

    logger.info(`Verified: Complete lifecycle test passed!`);
  });
});
