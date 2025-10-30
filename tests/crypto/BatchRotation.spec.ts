// import { test } from "../../fixtures/crypto.fixture";
// import { expect } from "@playwright/test";

// test.describe.serial("Batch Key Rotation @batch-rotation", () => {
//   test("Check for expired keys with dry run", async ({ secretKeyRotationManager }) => {
//     const results = await secretKeyRotationManager.rotateAllExpiredKeys({
//       performedBy: "test-suite",
//       dryRun: true,
//     });

//     expect(Array.isArray(results)).toBe(true);

//     console.log(`Found ${results.length} expired key(s)`);
//   });

//   test("Rotate all expired keys", async ({ secretKeyRotationManager }) => {
//     const results = await secretKeyRotationManager.rotateAllExpiredKeys({
//       performedBy: "test-suite",
//       dryRun: false,
//     });

//     expect(Array.isArray(results)).toBe(true);

//     const successCount = results.filter((r) => r.success).length;
//     const failureCount = results.length - successCount;

//     expect(successCount).toBeGreaterThanOrEqual(0);
//     expect(failureCount).toBeGreaterThanOrEqual(0);

//     console.log(`Batch rotation: ${successCount}/${results.length} successful`);
//   });
// });
