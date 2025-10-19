// import { test } from "../../fixtures/crypto.fixture";

// test.describe.serial("Encryption Flow @full-encryption", () => {
//   test("Generate secret key", async ({ cryptoCoordinator }) => {
//     await cryptoCoordinator.generateAndStoreSecretKey();
//   });

//   test("Encrypt environment variables", async ({ cryptoCoordinator }) => {
//     const variablesToEncrypt = ["PORTAL_USERNAME", "PORTAL_PASSWORD"];

//     // Encrypt the variables
//     await cryptoCoordinator.encryptEnvironmentVariables(variablesToEncrypt);
//   });
// });

import { test } from "../../fixtures/crypto.fixture";
import { expect } from "@playwright/test";

test.describe.serial("Encryption Flow @full-encryption", () => {
  test("Generate secret key", async ({ cryptoCoordinator }) => {
    const secretKey = await cryptoCoordinator.generateAndStoreSecretKey({
      rotationDays: 90,
      performedBy: "test-suite",
    });

    expect(secretKey).toBeTruthy();
    expect(secretKey.length).toBeGreaterThan(0);
  });

  test("Encrypt environment variables", async ({ cryptoCoordinator }) => {
    const variablesToEncrypt = ["PORTAL_USERNAME", "PORTAL_PASSWORD"];

    // Encrypt the variables
    await cryptoCoordinator.encryptEnvironmentVariables(variablesToEncrypt);
  });
});

test.describe.serial("Key Rotation Flow @key-rotation", () => {
  test("Check rotation status before rotation", async ({ secretKeyRotationManager }) => {
    const status = await secretKeyRotationManager.checkRotationStatus();

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

  test("Rotate secret key with re-encryption", async ({ secretKeyRotationManager }) => {
    const result = await secretKeyRotationManager.rotateKeyWithReEncryption({
      rotationReason: "manual",
      rotationDays: 90,
      performedBy: "test-suite",
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

  test("Verify rotation status after rotation", async ({ secretKeyRotationManager }) => {
    const status = await secretKeyRotationManager.checkRotationStatus();

    expect(status.needsRotation).toBe(false);
    expect(status.details.status).toBe("active");
    expect(status.details.metadata).toBeDefined();
    expect(status.details.metadata?.rotationCount).toBeGreaterThan(0);
    expect(status.details.metadata?.createdAt).toBeTruthy();

    console.log(`Key has been rotated ${status.details.metadata?.rotationCount} time(s)`);
  });

  test("Dry run rotation", async ({ secretKeyRotationManager }) => {
    const result = await secretKeyRotationManager.rotateKeyWithReEncryption({
      rotationReason: "manual",
      performedBy: "test-suite",
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

test.describe.serial("Key Audit and Monitoring @key-audit", () => {
  test("Audit all secret keys", async ({ secretKeyRotationManager }) => {
    await expect(secretKeyRotationManager.auditAllSecretKeys()).resolves.not.toThrow();
  });

  test("Get rotation history - verify structure", async ({ secretKeyRotationManager }) => {
    const history = await secretKeyRotationManager.getRotationHistory(10);

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);

    const lastRotation = history[0];
    expect(lastRotation).toHaveProperty("keyName");
    expect(lastRotation).toHaveProperty("rotationDate");
    expect(lastRotation).toHaveProperty("rotationReason");
    expect(lastRotation).toHaveProperty("success");
    expect(typeof lastRotation.keyName).toBe("string");
    expect(typeof lastRotation.rotationDate).toBe("string");
    expect(typeof lastRotation.success).toBe("boolean");

    console.log(`Last rotation: ${lastRotation.rotationDate} (${lastRotation.rotationReason})`);
  });

  test("Get audit logs - verify structure", async ({ secretKeyRotationManager }) => {
    const logs = await secretKeyRotationManager.getAuditLogs(20);

    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);

    const lastLog = logs[0];
    expect(lastLog).toHaveProperty("timestamp");
    expect(lastLog).toHaveProperty("action");
    expect(lastLog).toHaveProperty("keyName");
    expect(lastLog).toHaveProperty("status");
    expect(typeof lastLog.timestamp).toBe("string");
    expect(typeof lastLog.action).toBe("string");
    expect(typeof lastLog.keyName).toBe("string");
    expect(typeof lastLog.status).toBe("string");

    console.log(`Recent logs: ${logs.length} entries found`);
  });

  test("Get filtered audit logs - rotation only", async ({ secretKeyRotationManager }) => {
    const logs = await secretKeyRotationManager.getAuditLogs(10, {
      action: "rotate",
      status: "success",
    });

    expect(Array.isArray(logs)).toBe(true);

    logs.forEach((log) => {
      expect(log.action).toBe("rotate");
      expect(log.status).toBe("success");
    });

    console.log(`Successful rotations: ${logs.length}`);
  });
});

test.describe.serial("Batch Key Rotation @batch-rotation", () => {
  test("Check for expired keys with dry run", async ({ secretKeyRotationManager }) => {
    const results = await secretKeyRotationManager.rotateAllExpiredKeys({
      performedBy: "test-suite",
      dryRun: true,
    });

    expect(Array.isArray(results)).toBe(true);

    console.log(`Found ${results.length} expired key(s)`);
  });

  test("Rotate all expired keys", async ({ secretKeyRotationManager }) => {
    const results = await secretKeyRotationManager.rotateAllExpiredKeys({
      performedBy: "test-suite",
      dryRun: false,
    });

    expect(Array.isArray(results)).toBe(true);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    expect(successCount).toBeGreaterThanOrEqual(0);
    expect(failureCount).toBeGreaterThanOrEqual(0);

    console.log(`Batch rotation: ${successCount}/${results.length} successful`);
  });
});

test.describe("Error Handling @error-handling", () => {
  test("Should prevent rotation without force flag on valid key", async ({ secretKeyRotationManager }) => {
    await expect(
      secretKeyRotationManager.rotateKeyWithReEncryption({
        rotationReason: "manual",
        performedBy: "test-suite",
        forceRotation: false,
      }),
    ).rejects.toThrow(/does not need rotation yet/);
  });

  test("Should allow rotation with force flag", async ({ secretKeyRotationManager }) => {
    const result = await secretKeyRotationManager.rotateKeyWithReEncryption({
      rotationReason: "manual",
      performedBy: "test-suite",
      forceRotation: true,
    });

    expect(result.success).toBe(true);
  });
});

test.describe.serial("Key Status Warnings @status-warnings", () => {
  test("Check key status and log warnings", async ({ cryptoCoordinator, secretKeyRotationManager }) => {
    const status = await secretKeyRotationManager.checkRotationStatus();

    expect(status).toBeDefined();
    expect(status.details.status).toMatch(/active|expiring_soon|expired/);

    // This will trigger appropriate warnings in logs based on status
    await cryptoCoordinator.encryptEnvironmentVariables(["TEST_VAR"]);

    console.log(`Key status: ${status.details.status}`);
    console.log(`Days until expiration: ${status.details.daysUntilExpiration}`);
  });
});

test.describe.serial("Integration Test @integration", () => {
  test("Complete lifecycle: Generate → Encrypt → Rotate → Verify", async ({
    cryptoCoordinator,
    secretKeyRotationManager,
  }) => {
    // Step 1: Generate key
    console.log("Step 1: Generating key...");
    const secretKey = await cryptoCoordinator.generateAndStoreSecretKey({
      rotationDays: 1,
      performedBy: "integration-test",
    });
    expect(secretKey).toBeTruthy();
    expect(secretKey.length).toBeGreaterThan(0);

    // Step 2: Encrypt variables
    console.log("Step 2: Encrypting variables...");
    await cryptoCoordinator.encryptEnvironmentVariables(["PORTAL_USERNAME", "PORTAL_PASSWORD"]);

    // Step 3: Check initial status
    console.log("Step 3: Checking status...");
    const initialStatus = await secretKeyRotationManager.checkRotationStatus();
    expect(initialStatus.details.encryptedVariableCount).toBeGreaterThan(0);
    console.log(`Found ${initialStatus.details.encryptedVariableCount} encrypted variables`);

    // Step 4: Rotate key
    console.log("Step 4: Rotating key...");
    const rotationResult = await secretKeyRotationManager.rotateKeyWithReEncryption({
      rotationReason: "manual",
      rotationDays: 90,
      performedBy: "integration-test",
      forceRotation: true,
    });
    expect(rotationResult.success).toBe(true);
    expect(rotationResult.variablesProcessed).toBeGreaterThan(0);
    expect(rotationResult.variablesFailed).toHaveLength(0);

    // Step 5: Verify after rotation
    console.log("Step 5: Verifying rotation...");
    const finalStatus = await secretKeyRotationManager.checkRotationStatus();
    expect(finalStatus.needsRotation).toBe(false);
    expect(finalStatus.details.status).toBe("active");

    // Step 6: Get history
    console.log("Step 6: Checking history...");
    const history = await secretKeyRotationManager.getRotationHistory(5);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].success).toBe(true);

    console.log("✅ Complete lifecycle test passed!");
  });
});

test.describe.serial("Metadata Verification @metadata", () => {
  test("Verify key metadata after operations", async ({ secretKeyRotationManager }) => {
    const status = await secretKeyRotationManager.checkRotationStatus();

    expect(status.details.metadata).toBeDefined();

    const metadata = status.details.metadata;
    expect(metadata).not.toBeNull();
    expect(metadata).not.toBeUndefined();

    // Type assertion after null check
    expect(metadata!.createdAt).toBeTruthy();
    expect(metadata!.rotationCount).toBeGreaterThanOrEqual(0);
    expect(typeof metadata!.createdAt).toBe("string");
    expect(typeof metadata!.rotationCount).toBe("number");

    console.log(`Metadata: Created ${metadata!.createdAt}, Rotated ${metadata!.rotationCount} times`);
  });

  test("Verify rotation history contains valid data", async ({ secretKeyRotationManager }) => {
    const history = await secretKeyRotationManager.getRotationHistory(5);

    expect(history.length).toBeGreaterThan(0);

    const firstEntry = history[0];
    expect(firstEntry.keyName).toBeTruthy();
    expect(firstEntry.rotationDate).toBeTruthy();
    expect(firstEntry.rotationReason).toMatch(/scheduled|manual|compromised|expired/);
    expect(typeof firstEntry.success).toBe("boolean");

    console.log(`Latest rotation: ${firstEntry.rotationDate} - Reason: ${firstEntry.rotationReason}`);
  });
});
