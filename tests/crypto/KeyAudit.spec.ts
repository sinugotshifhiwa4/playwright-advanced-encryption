// import { test } from "../../fixtures/crypto.fixture";
// import { expect } from "@playwright/test";

// test.describe.serial("Key Audit and Monitoring @key-audit", () => {
//   test("Audit all secret keys", async ({ secretKeyRotationManager }) => {
//     await expect(secretKeyRotationManager.auditAllSecretKeys()).resolves.not.toThrow();
//   });

//   test("Get rotation history - verify structure", async ({ secretKeyRotationManager }) => {
//     const history = await secretKeyRotationManager.getRotationHistory(10);

//     expect(Array.isArray(history)).toBe(true);
//     expect(history.length).toBeGreaterThan(0);

//     const lastRotation = history[0];
//     expect(lastRotation).toHaveProperty("keyName");
//     expect(lastRotation).toHaveProperty("rotationDate");
//     expect(lastRotation).toHaveProperty("rotationReason");
//     expect(lastRotation).toHaveProperty("success");
//     expect(typeof lastRotation.keyName).toBe("string");
//     expect(typeof lastRotation.rotationDate).toBe("string");
//     expect(typeof lastRotation.success).toBe("boolean");

//     console.log(`Last rotation: ${lastRotation.rotationDate} (${lastRotation.rotationReason})`);
//   });

//   test("Get audit logs - verify structure", async ({ secretKeyRotationManager }) => {
//     const logs = await secretKeyRotationManager.getAuditLogs(20);

//     expect(Array.isArray(logs)).toBe(true);
//     expect(logs.length).toBeGreaterThan(0);

//     const lastLog = logs[0];
//     expect(lastLog).toHaveProperty("timestamp");
//     expect(lastLog).toHaveProperty("action");
//     expect(lastLog).toHaveProperty("keyName");
//     expect(lastLog).toHaveProperty("status");
//     expect(typeof lastLog.timestamp).toBe("string");
//     expect(typeof lastLog.action).toBe("string");
//     expect(typeof lastLog.keyName).toBe("string");
//     expect(typeof lastLog.status).toBe("string");

//     console.log(`Recent logs: ${logs.length} entries found`);
//   });

//   test("Get filtered audit logs - rotation only", async ({ secretKeyRotationManager }) => {
//     const logs = await secretKeyRotationManager.getAuditLogs(10, {
//       action: "rotate",
//       status: "success",
//     });

//     expect(Array.isArray(logs)).toBe(true);

//     logs.forEach((log) => {
//       expect(log.action).toBe("rotate");
//       expect(log.status).toBe("success");
//     });

//     console.log(`Successful rotations: ${logs.length}`);
//   });
// });
