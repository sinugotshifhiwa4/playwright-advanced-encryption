// import { test } from "../../fixtures/crypto.fixture";
// import { expect } from "@playwright/test";

// test.describe.serial("Integration Test @integration", () => {
//   test("Complete lifecycle: Generate → Encrypt → Rotate → Verify", async ({
//     cryptoCoordinator,
//     secretKeyRotationManager,
//   }) => {
//     // Step 1: Generate key
//     console.log("Step 1: Generating key...");
//     const secretKey = await cryptoCoordinator.generateAndStoreSecretKey({
//       rotationDays: 1,
//       performedBy: "integration-test",
//     });
//     expect(secretKey).toBeTruthy();
//     expect(secretKey.length).toBeGreaterThan(0);

//     // Step 2: Encrypt variables
//     console.log("Step 2: Encrypting variables...");
//     await cryptoCoordinator.encryptEnvironmentVariables(["PORTAL_USERNAME", "PORTAL_PASSWORD"]);

//     // Step 3: Check initial status
//     console.log("Step 3: Checking status...");
//     const initialStatus = await secretKeyRotationManager.checkRotationStatus();
//     expect(initialStatus.details.encryptedVariableCount).toBeGreaterThan(0);
//     console.log(`Found ${initialStatus.details.encryptedVariableCount} encrypted variables`);

//     // Step 4: Rotate key
//     console.log("Step 4: Rotating key...");
//     const rotationResult = await secretKeyRotationManager.rotateKeyWithReEncryption({
//       rotationReason: "manual",
//       rotationDays: 90,
//       performedBy: "integration-test",
//       forceRotation: true,
//     });
//     expect(rotationResult.success).toBe(true);
//     expect(rotationResult.variablesProcessed).toBeGreaterThan(0);
//     expect(rotationResult.variablesFailed).toHaveLength(0);

//     // Step 5: Verify after rotation
//     console.log("Step 5: Verifying rotation...");
//     const finalStatus = await secretKeyRotationManager.checkRotationStatus();
//     expect(finalStatus.needsRotation).toBe(false);
//     expect(finalStatus.details.status).toBe("active");

//     // Step 6: Get history
//     console.log("Step 6: Checking history...");
//     const history = await secretKeyRotationManager.getRotationHistory(5);
//     expect(history.length).toBeGreaterThan(0);
//     expect(history[0].success).toBe(true);

//     console.log("✅ Complete lifecycle test passed!");
//   });
// });
