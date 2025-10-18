import { test as baseTest } from "@playwright/test";

import { EnvironmentFileEncryptor } from "../src/cryptography/manager/environmentFileEncryptor";
import { CryptoEngine } from "../src/cryptography/engine/cryptoEngine";
import { CryptoService } from "../src/cryptography/service/cryptoService";
import { CryptoCoordinator } from "../src/cryptography/service/cryptoCoordinator";

type CryptoFixtures = {
  environmentFileEncryptor: EnvironmentFileEncryptor;
  cryptoEngine: CryptoEngine;
  cryptoService: CryptoService;
  cryptoCoordinator: CryptoCoordinator;
};

export const test = baseTest.extend<CryptoFixtures>({
  environmentFileEncryptor: async ({}, use) => {
    await use(new EnvironmentFileEncryptor());
  },

  cryptoEngine: async ({}, use) => {
    await use(new CryptoEngine());
  },

  cryptoService: async ({}, use) => {
    await use(new CryptoService());
  },

  cryptoCoordinator: async ({ environmentFileEncryptor }, use) => {
    await use(new CryptoCoordinator(environmentFileEncryptor));
  },
});

export const expect = baseTest.expect;
