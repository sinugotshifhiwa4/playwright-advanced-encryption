import { defineConfig, devices } from "@playwright/test";
import { OrtoniReportConfig } from "ortoni-report";
import * as os from "os";
import { TIMEOUTS } from "./src/configuration/timeouts/timeout.config";
import EnvironmentDetector from "./src/configuration/detector/environmentDetector";
import { shouldSkipBrowserInit } from "./src/configuration/playwrightFlags/skipBrowserInitFlag";
import WorkerAllocator from "./src/configuration/allocator/workerAllocator";

const isCI = EnvironmentDetector.isCI();
const skipBrowserInit = shouldSkipBrowserInit();

const reportConfig: OrtoniReportConfig = {
  open: process.env.CI ? "never" : "always",
  folderPath: "ortoni-report",
  filename: "index.html",
  title: "Advanced Encryption Test Report",
  showProject: false,
  projectName: "playwright-advanced-encryption",
  testType: "e2e",
  authorName: os.userInfo().username,
  base64Image: false,
  stdIO: false,
  meta: {
    description: "A secure encryption and key rotation system for Playwright automation",
    platform: os.type(),
  },
};

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/configuration/environment/manager/global/globalSetup.ts",
  timeout: TIMEOUTS.test,
  expect: {
    timeout: TIMEOUTS.expect,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: WorkerAllocator.getOptimalWorkerCount("25-percent"),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: isCI
    ? [["blob", { outputDir: "blob-report", alwaysReport: true }]]
    : [
        ["html", { open: "never" }],
        ["ortoni-report", reportConfig],
        ["junit", { outputFile: "results.xml" }],
        ["dot"],
      ],
  grep:
    typeof process.env.PLAYWRIGHT_GREP === "string"
      ? new RegExp(process.env.PLAYWRIGHT_GREP)
      : process.env.PLAYWRIGHT_GREP || /.*/,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /**
     * Test artifacts & browser mode.
     * - In CI: optimize for performance and smaller artifacts.
     * - In local dev: maximize visibility for debugging.
     */
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "on",
    headless: isCI ? true : false,

    launchOptions: {
      args: isCI
        ? [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--enable-features=VaapiVideoDecoder",
            "--enable-gpu-rasterization",
            "--enable-zero-copy",
            "--ignore-gpu-blocklist",
            "--use-gl=egl",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-extensions",
            "--disable-plugins",
            "--no-first-run",
            "--disable-default-apps",
            "--disable-translate",
          ]
        : [],
    },
  },

  /* Configure projects for major browsers */
  projects: [
    ...(!skipBrowserInit
      ? [
          {
            name: "setup",
            use: { ...devices["Desktop Chrome"] },
            testMatch: /.*\.setup\.ts/,
          },
        ]
      : []),
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: undefined,
      },
      dependencies: skipBrowserInit ? [] : ["setup"],
    },
    // {
    //   name: "chromium",
    //   use: { ...devices["Desktop Chrome"] },
    // },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
