import { test } from "../../fixtures/crypto.fixture";
import { expect } from "@playwright/test";
import { getCurrentUser } from "../../src/cryptography/manager/rotation/getSystemUser";

test.describe.serial("Encryption Flow @generate-key", () => {
  test("Generate secret key", async ({ cryptoCoordinator }) => {
    const secretKey = await cryptoCoordinator.generateAndStoreSecretKey({
      rotationDays: 90,
      performedBy: getCurrentUser(),
    });

    expect(secretKey).toBeTruthy();
    expect(secretKey.length).toBeGreaterThan(0);
  });
});
