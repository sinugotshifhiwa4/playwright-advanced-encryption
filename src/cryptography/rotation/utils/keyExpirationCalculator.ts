export default class KeyExpirationCalculator {
  public static readonly EXPIRING_SOON_THRESHOLD_DAYS = 7;

  /**
   * Calculates the expiration date based on rotation days.
   * Uses UTC to avoid timezone issues.
   */
  public static calculateExpirationDate(rotationDays: number): string {
    const expirationDate = new Date();
    expirationDate.setUTCDate(expirationDate.getUTCDate() + rotationDays);
    return expirationDate.toISOString();
  }

  /**
   * Calculates days until expiration (negative if expired).
   * Rounds down to be conservative (0.9 days = 0 days).
   */
  public static calculateDaysUntilExpiration(expiresAt: string): number {
    const now = new Date();
    const expiration = new Date(expiresAt);

    if (isNaN(expiration.getTime())) {
      throw new Error(`Invalid expiration date: ${expiresAt}`);
    }

    const diffMs = expiration.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Determines the key status based on expiration.
   */
  public static determineKeyStatus(
    expiresAt: string,
    thresholdDays: number = this.EXPIRING_SOON_THRESHOLD_DAYS,
  ): "active" | "expired" | "expiring_soon" {
    const daysUntilExpiration = this.calculateDaysUntilExpiration(expiresAt);

    if (daysUntilExpiration < 0) {
      return "expired";
    } else if (daysUntilExpiration <= thresholdDays) {
      return "expiring_soon";
    } else {
      return "active";
    }
  }
}
