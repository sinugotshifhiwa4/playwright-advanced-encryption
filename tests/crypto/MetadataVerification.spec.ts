// import { test } from "../../fixtures/crypto.fixture";
// import { expect } from "@playwright/test";

// test.describe.serial("Metadata Verification @metadata", () => {
//   test("Verify key metadata after operations", async ({ secretKeyRotationManager }) => {
//     const status = await secretKeyRotationManager.checkRotationStatus();

//     expect(status.details.metadata).toBeDefined();

//     const metadata = status.details.metadata;
//     expect(metadata).not.toBeNull();
//     expect(metadata).not.toBeUndefined();

//     // Type assertion after null check
//     expect(metadata!.createdAt).toBeTruthy();
//     expect(metadata!.rotationCount).toBeGreaterThanOrEqual(0);
//     expect(typeof metadata!.createdAt).toBe("string");
//     expect(typeof metadata!.rotationCount).toBe("number");

//     console.log(`Metadata: Created ${metadata!.createdAt}, Rotated ${metadata!.rotationCount} times`);
//   });

//   test("Verify rotation history contains valid data", async ({ secretKeyRotationManager }) => {
//     const history = await secretKeyRotationManager.getRotationHistory(5);

//     expect(history.length).toBeGreaterThan(0);

//     const firstEntry = history[0];
//     expect(firstEntry.keyName).toBeTruthy();
//     expect(firstEntry.rotationDate).toBeTruthy();
//     expect(firstEntry.rotationReason).toMatch(/scheduled|manual|compromised|expired/);
//     expect(typeof firstEntry.success).toBe("boolean");

//     console.log(`Latest rotation: ${firstEntry.rotationDate} - Reason: ${firstEntry.rotationReason}`);
//   });
// });
