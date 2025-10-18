import EnvironmentDetector from "../detector/environmentDetector";

export default class TimeoutManager {
  private static CI_MULTIPLIER = 2;

  public static timeout(
    timeoutInMs: number,
    ciMultiplier: number = TimeoutManager.CI_MULTIPLIER,
  ): number {
    return EnvironmentDetector.isCI() ? timeoutInMs * ciMultiplier : timeoutInMs;
  }
}
