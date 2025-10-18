/**
 * Checks if browser initialization should be skipped.
 * Controlled by the environment variable: SKIP_BROWSER_INIT
 *
 * @returns True if browser initialization should be skipped.
 */
export function shouldSkipBrowserInit(): boolean {
  return process.env.SKIP_BROWSER_INIT?.toLowerCase() === "true";
}
