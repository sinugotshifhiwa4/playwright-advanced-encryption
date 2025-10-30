import os from "os";

export default class SystemInfo {
  /**
   * Gets the current system user's username.
   * @returns Username or "system" if unavailable
   */
  public static getCurrentUsername(): string {
    try {
      return os.userInfo().username;
    } catch {
      return "system";
    }
  }
}
