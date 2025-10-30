// import { test } from "../../fixtures/crypto.fixture";
// import { expect } from "@playwright/test";

// test.describe("Error Handling @error-handling", () => {
//   test("Should prevent rotation without force flag on valid key", async ({ secretKeyRotationManager }) => {
//     await expect(
//       secretKeyRotationManager.rotateKeyWithReEncryption({
//         rotationReason: "manual",
//         performedBy: "test-suite",
//         forceRotation: false,
//       }),
//     ).rejects.toThrow(/does not need rotation yet/);
//   });

//   test("Should allow rotation with force flag", async ({ secretKeyRotationManager }) => {
//     const result = await secretKeyRotationManager.rotateKeyWithReEncryption({
//       rotationReason: "manual",
//       performedBy: "test-suite",
//       forceRotation: true,
//     });

//     expect(result.success).toBe(true);
//   });
// });
