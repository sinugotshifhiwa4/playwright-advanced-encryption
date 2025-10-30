import { test, expect } from "../../../fixtures/crypto.fixture";
import RotationOrchestrator from "../../../src/cryptography/service/rotationOrchestrator";
import logger from "../../../src/utils/logger/loggerManager";

test.describe("Error Handling @error-handling", () => {
  test("Should prevent rotation without force flag on valid key", async () => {
    await expect(
      RotationOrchestrator.rotateKeyWithReEncryption({
        rotationReason: "manual",
        performedBy: "test-suite",
        forceRotation: false,
      }),
    ).rejects.toThrow(/does not need rotation yet/);
  });

  test("Should allow rotation with force flag", async () => {
    const result = await RotationOrchestrator.rotateKeyWithReEncryption({
      rotationReason: "manual",
      performedBy: "test-suite",
      forceRotation: true,
    });

    expect(result.success).toBe(true);

    logger.info(`Verified: Rotation completed: ${result.variablesProcessed} variables re-encrypted`);
  });
});
