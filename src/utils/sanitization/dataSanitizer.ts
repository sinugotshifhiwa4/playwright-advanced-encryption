import {
  SanitizationParams,
  DEFAULTMASKED_FIELDS,
  KEY_PATTERNS,
  MASK_PLACEHOLDER,
} from "./internals/sanitization.config";

export default class DataSanitizer {
  private static defaultParams: SanitizationParams = {
    sensitiveKeys: DEFAULTMASKED_FIELDS,
    maskValue: MASK_PLACEHOLDER,
    enablePatternDetection: true,
    maxDepth: 10,
  };

  /**
   * Sanitizes the given data object by recursively iterating over all its
   * properties and applying transformations for sensitive data masking.
   */
  public static sanitize<T>(data: T, config?: Partial<SanitizationParams>): T {
    const finalConfig = this.mergeConfig(config);
    return this.processValue(data, finalConfig);
  }

  /**
   * Sanitizes a specific field value based on field name sensitivity.
   */
  public static sanitizeFieldValue(
    fieldName: string,
    value: string,
    config?: Partial<SanitizationParams>,
  ): { displayValue: string; isSensitive: boolean } {
    const finalConfig = this.mergeConfig(config);
    const isSensitive = this.isSensitiveKey(fieldName, finalConfig.sensitiveKeys);

    return {
      displayValue: isSensitive ? finalConfig.maskValue : value,
      isSensitive,
    };
  }

  /**
   * Sanitizes an error object by removing sensitive data and stack traces.
   */
  public static sanitizeErrorObject(obj: Record<string, unknown>): Record<string, unknown> {
    if (!obj) return {};

    const { stack: _stack, ...objWithoutStack } = obj;
    return this.sanitize(objWithoutStack, { enablePatternDetection: false });
  }

  /**
   * Sanitizes a string by removing ANSI escape sequences and special characters.
   */
  public static sanitizeString(value: string): string {
    if (!this.isValidString(value)) return "";

    return value
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/["'\\<>]/g, "")
      .trim();
  }

  // Private helper methods

  private static mergeConfig(config?: Partial<SanitizationParams>): SanitizationParams {
    return { ...this.defaultParams, ...config };
  }

  private static isValidString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
  }

  private static processPrimitive<T>(data: T, config: SanitizationParams): T {
    if (!this.isValidString(data)) return data;

    // Pattern detection for sensitive data
    if (config.enablePatternDetection && this.containsSensitivePattern(data)) {
      return config.maskValue as unknown as T;
    }

    return data;
  }

  private static processValue<T>(
    data: T,
    config: SanitizationParams,
    depth: number = 0,
    seen: WeakSet<object> = new WeakSet(),
    path: string = "",
  ): T {
    // Depth and circular reference checks
    if (depth > config.maxDepth) return data;
    if (data === null || data === undefined || typeof data !== "object") {
      return this.processPrimitive(data, config);
    }
    if (seen.has(data as object)) {
      return "[Circular]" as unknown as T;
    }

    seen.add(data as object);

    // Handle arrays and objects
    if (Array.isArray(data)) {
      return this.processArray(data, config, depth, seen, path);
    }
    return this.processObject(data, config, depth, seen, path);
  }

  private static processArray<T>(
    data: T,
    config: SanitizationParams,
    depth: number,
    seen: WeakSet<object>,
    path: string,
  ): T {
    const array = data as unknown[];
    const sanitizedArray = array.map((item, i) => {
      const itemPath = `${path}[${i}]`;
      return this.processValue(item, config, depth + 1, seen, itemPath);
    });

    return sanitizedArray as unknown as T;
  }

  private static processObject<T>(
    data: T,
    config: SanitizationParams,
    depth: number,
    seen: WeakSet<object>,
    path: string,
  ): T {
    const result = { ...(data as object) } as Record<string, unknown>;

    for (const [key, value] of Object.entries(result)) {
      const keyPath = path ? `${path}.${key}` : key;

      if (this.isSensitiveKey(key, config.sensitiveKeys)) {
        result[key] = config.maskValue;
      } else {
        result[key] = this.processValue(value, config, depth + 1, seen, keyPath);
      }
    }

    return result as T;
  }

  private static isSensitiveKey(key: string, sensitiveKeys: string[]): boolean {
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some((sensitiveKey) => lowerKey.includes(sensitiveKey.toLowerCase()));
  }

  private static containsSensitivePattern(value: string): boolean {
    return KEY_PATTERNS.some((pattern) => pattern.test(value));
  }
}
