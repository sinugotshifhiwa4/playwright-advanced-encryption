// import { test } from "../../fixtures/crypto.fixture";
// import { expect } from "@playwright/test";

// test.describe.serial("Key Status Warnings @status-warnings", () => {
//   test("Check key status and log warnings", async ({ cryptoCoordinator, secretKeyRotationManager }) => {
//     const status = await secretKeyRotationManager.checkRotationStatus();

//     expect(status).toBeDefined();
//     expect(status.details.status).toMatch(/active|expiring_soon|expired/);

//     // This will trigger appropriate warnings in logs based on status
//     await cryptoCoordinator.encryptEnvironmentVariables(["TEST_VAR"]);

//     console.log(`Key status: ${status.details.status}`);
//     console.log(`Days until expiration: ${status.details.daysUntilExpiration}`);
//   });
// });
