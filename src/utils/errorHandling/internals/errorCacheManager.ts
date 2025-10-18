import { RegexPatterns } from "./regexPatterns";

export class ErrorCacheManager {
  private static readonly sanitizedMessages = new Map<string, string>();
  private static readonly loggedErrors = new Set<string>();
  private static readonly MAX_CACHE_SIZE = 5000;
  private static readonly EVICTION_RATIO = 0.4;

  public static getSanitizedMessage(originalMessage: string): string {
    if (!originalMessage) return "";

    const cached = this.sanitizedMessages.get(originalMessage);
    if (cached !== undefined) return cached;

    const sanitized = originalMessage
      .replace(RegexPatterns.ANSI_ESCAPE, "")
      .replace(RegexPatterns.SANITIZE_CHARS, "")
      .replace(RegexPatterns.ERROR_PREFIX, "")
      .trim()
      .split("\n")[0]
      .substring(0, 500);

    if (this.sanitizedMessages.size < this.MAX_CACHE_SIZE) {
      this.sanitizedMessages.set(originalMessage, sanitized);
    }

    return sanitized;
  }

  public static shouldLogError(error: unknown): boolean {
    const errorKey = this.generateErrorKey(error);

    if (this.loggedErrors.has(errorKey)) return false;

    if (this.loggedErrors.size >= this.MAX_CACHE_SIZE) {
      this.evictOldEntries();
    }

    this.loggedErrors.add(errorKey);
    return true;
  }

  private static evictOldEntries(): void {
    const entriesToRemove = Math.floor(this.loggedErrors.size * this.EVICTION_RATIO);
    const iterator = this.loggedErrors.values();

    for (let i = 0; i < entriesToRemove; i++) {
      const entry = iterator.next();
      if (!entry.done) {
        this.loggedErrors.delete(entry.value);
      }
    }
  }

  private static generateErrorKey(error: unknown): string {
    if (error instanceof Error) {
      return this.hashString(error.stack || `${error.name}:${error.message}`);
    }

    const errorString = typeof error === "string" ? error : JSON.stringify(error);
    return this.hashString(errorString);
  }

  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return hash.toString();
  }

  public static clearAll(): void {
    this.sanitizedMessages.clear();
    this.loggedErrors.clear();
  }
}
