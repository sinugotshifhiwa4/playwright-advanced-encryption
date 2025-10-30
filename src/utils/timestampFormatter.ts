export default class TimestampFormatter {
  /**
   * Gets current timestamp in South African Standard Time (SAST).
   * Format: YYYY/MM/DD, HH:mm:ss
   */
  public static getSASTTimestamp(): string {
    return new Date().toLocaleString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  /**
   * Gets current timestamp in UTC (ISO 8601 format).
   * Format: YYYY-MM-DDTHH:mm:ss.sssZ
   */
  public static getUTCTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Converts any Date or ISO string to SAST.
   */
  public static toSAST(date: Date | string): string {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
}
