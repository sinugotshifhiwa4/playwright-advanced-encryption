import { test, expect } from "../../../fixtures/crypto.fixture";
import RotationOrchestrator from "../../../src/cryptography/service/rotationOrchestrator";
import SecretAuditManager from "../../../src/cryptography/rotation/manager/secretAuditManager";
import logger from "../../../src/utils/logger/loggerManager";

test.describe.serial("Key Audit and Monitoring @key-audit", () => {
  test("Audit all secret keys", async () => {
    await expect(RotationOrchestrator.auditAllSecretKeys()).resolves.not.toThrow();
  });

  test("Get rotation history - verify structure", async () => {
    const history = await RotationOrchestrator.getRotationHistory(10);

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

    logger.info(`Verified: Last rotation: ${lastRotation.rotationDate} (${lastRotation.rotationReason})`);
  });

  test("Get audit logs - verify structure", async () => {
    const logs = await SecretAuditManager.getAuditLogs(20);

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

    logger.info(`Verified: Recent logs: ${logs.length} entries found`);
  });

  test("Get filtered audit logs - rotation only", async () => {
    const logs = await SecretAuditManager.getAuditLogs(10, {
      action: "rotate",
      status: "success",
    });

    expect(Array.isArray(logs)).toBe(true);

    logs.forEach((log) => {
      expect(log.action).toBe("rotate");
      expect(log.status).toBe("success");
    });

    logger.info(`Verified: Successful rotations: ${logs.length}`);
  });
});
