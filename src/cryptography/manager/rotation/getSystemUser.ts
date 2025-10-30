import * as os from "os";

export function getCurrentUser(): string {
  try {
    return os.userInfo().username;
  } catch {
    return "system";
  }
}
