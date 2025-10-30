import { test, expect } from "../../fixtures/crypto.fixture";
import SecretKeyRotationManager from "../../src/cryptography/manager/rotation/secretKeyRotationManager";
import { getCurrentUser } from "../../src/cryptography/manager/rotation/getSystemUser";

test.describe.serial("Key Rotation Flow @key-rotation", () => {
  test("Check rotation status before rotation", async () => {
    const status = await SecretKeyRotationManager.checkRotationStatus();

    expect(status).toHaveProperty("needsRotation");
    expect(status).toHaveProperty("recommendation");
    expect(status.details).toHaveProperty("daysUntilExpiration");
    expect(status.details).toHaveProperty("encryptedVariableCount");
    expect(typeof status.needsRotation).toBe("boolean");
    expect(typeof status.recommendation).toBe("string");
    expect(typeof status.details.daysUntilExpiration).toBe("number");
    expect(typeof status.details.encryptedVariableCount).toBe("number");

    console.log(`Rotation Status: ${status.recommendation}`);
  });

  test("Rotate secret key with re-encryption", async () => {
    const result = await SecretKeyRotationManager.rotateKeyWithReEncryption({
      rotationReason: "manual",
      rotationDays: 90,
      performedBy: getCurrentUser(),
      forceRotation: true,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(result.keyName).toBeTruthy();
    expect(result.environment).toBeTruthy();
    expect(result.variablesProcessed).toBeGreaterThanOrEqual(0);
    expect(result.variablesFailed).toHaveLength(0);
    expect(result.oldKeyHash).toBeDefined();
    expect(result.newKeyHash).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);

    console.log(`Rotation completed: ${result.variablesProcessed} variables re-encrypted in ${result.duration}ms`);
  });

  test("Verify rotation status after rotation", async () => {
    const status = await SecretKeyRotationManager.checkRotationStatus();

    expect(status.needsRotation).toBe(false);
    expect(status.details.status).toBe("active");
    expect(status.details.metadata).toBeDefined();
    expect(status.details.metadata?.rotationCount).toBeGreaterThan(0);
    expect(status.details.metadata?.createdAt).toBeTruthy();

    console.log(`Key has been rotated ${status.details.metadata?.rotationCount} time(s)`);
  });

  test("Dry run rotation", async () => {
    const result = await SecretKeyRotationManager.rotateKeyWithReEncryption({
      rotationReason: "manual",
      performedBy: getCurrentUser(),
      forceRotation: true,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.variablesProcessed).toBeGreaterThanOrEqual(0);
    expect(result.oldKeyHash).toBeUndefined();
    expect(result.newKeyHash).toBeUndefined();

    console.log(`[DRY RUN] Would process ${result.variablesProcessed} variables`);
  });
});
