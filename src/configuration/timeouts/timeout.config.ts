import TimeoutManager from "./timeoutManager";

export const TIMEOUTS = {
  test: TimeoutManager.timeout(45_000),
  expect: TimeoutManager.timeout(40_000),

  api: {
    standard: TimeoutManager.timeout(10_000),
    upload: TimeoutManager.timeout(60_000),
    download: TimeoutManager.timeout(90_000),
    healthCheck: TimeoutManager.timeout(3_000),
    connection: TimeoutManager.timeout(8_000),
  },

  db: {
    query: TimeoutManager.timeout(15_000),
    transaction: TimeoutManager.timeout(30_000),
    migration: TimeoutManager.timeout(120_000),
    connection: TimeoutManager.timeout(10_000),
    request: TimeoutManager.timeout(10_000),
    poolAcquisition: TimeoutManager.timeout(10_000),
    idle: TimeoutManager.timeout(10_000),
  },
} as const;

export const {
  test: TEST_TIMEOUT,
  expect: EXPECT_TIMEOUT,
  api: API_TIMEOUT,
  db: DB_TIMEOUT,
} = TIMEOUTS;
