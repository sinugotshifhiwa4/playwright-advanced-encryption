import { ErrorDetails } from "./internals/error-handler.types";
import ErrorAnalyzer from "./internals/errorAnalyzer";
import { ErrorCacheManager } from "./internals/errorCacheManager";
import logger from "../logger/loggerManager";

export default class ErrorHandler {
  public static captureError(error: unknown, source: string, context = ""): void {
    if (!error || !ErrorCacheManager.shouldLogError(error)) return;

    try {
      const details = ErrorAnalyzer.createErrorDetails(error, source, context);
      this.logStructuredError(details);
      this.logAdditionalDetails(error, source);
    } catch (loggingError) {
      this.handleLoggingFailure(loggingError, source);
    }
  }

  public static logAndThrow(source: string, message: string): never {
    const error = new Error(message);
    this.captureError(error, source);
    throw error;
  }

  public static log(source: string, message: string): void {
    const error = new Error(message);
    this.captureError(error, source);
  }

  public static clearErrorCache(): void {
    ErrorCacheManager.clearAll();
  }

  private static logStructuredError(details: ErrorDetails): void {
    try {
      logger.error(details);
    } catch {
      console.error("Error:", details);
    }
  }

  private static readonly circularReplacer = (() => {
    const seen = new WeakSet<object>();
    return (key: string, value: unknown) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    };
  })();

  private static logAdditionalDetails(error: unknown, source: string): void {
    const extraDetails = ErrorAnalyzer.extractAdditionalErrorDetails(error);

    // Enhanced: Always include stack trace and error metadata
    const enhancedDetails = {
      ...extraDetails,
      errorType: this.getErrorType(error),
      stack: this.getStackTrace(error),
      rawError: this.getRawErrorInfo(error),
    };

    // Remove undefined/null values
    Object.keys(enhancedDetails).forEach((key) => {
      if (
        enhancedDetails[key as keyof typeof enhancedDetails] === undefined ||
        enhancedDetails[key as keyof typeof enhancedDetails] === null
      ) {
        delete enhancedDetails[key as keyof typeof enhancedDetails];
      }
    });

    if (Object.keys(enhancedDetails).length === 0) return;

    const sanitized = this.deepSanitizeObject(enhancedDetails);
    const logPayload = {
      source,
      type: "Additional Details",
      details: sanitized,
    };

    try {
      logger.error(JSON.stringify(logPayload, this.circularReplacer, 2));
    } catch {
      logger.error("Fallback log:", logPayload);
    }
  }

  private static getErrorType(error: unknown): string | undefined {
    if (error instanceof Error) {
      return error.constructor.name;
    }
    if (typeof error === "object" && error !== null && "name" in error) {
      const name = error.name;
      if (typeof name === "string") return name;
    }
    return typeof error;
  }

  private static getStackTrace(error: unknown): string | undefined {
    if (error instanceof Error && error.stack) {
      return error.stack.substring(0, 2000);
    }
    if (typeof error === "object" && error !== null && "stack" in error) {
      const stack = error.stack;
      if (typeof stack === "string") {
        return stack.substring(0, 2000);
      }
    }
    return undefined;
  }

  private static getRawErrorInfo(error: unknown): Record<string, unknown> | undefined {
    if (typeof error !== "object" || error === null) return undefined;

    const info: Record<string, unknown> = {};
    const errorObj = error as Record<string, unknown>;

    // Capture all enumerable properties
    for (const key of Object.keys(errorObj)) {
      const value = errorObj[key];

      // Skip stack (already captured separately) and functions
      if (key === "stack" || typeof value === "function") continue;

      // Limit string lengths
      if (typeof value === "string") {
        info[key] = value.length > 500 ? value.substring(0, 500) + "..." : value;
      } else if (typeof value === "object" && value !== null) {
        // Shallow copy of nested objects
        try {
          info[key] = JSON.parse(JSON.stringify(value));
        } catch {
          info[key] = "[Complex Object]";
        }
      } else {
        info[key] = value;
      }
    }

    return Object.keys(info).length > 0 ? info : undefined;
  }

  private static deepSanitizeObject(obj: unknown): unknown {
    if (typeof obj === "string") {
      return ErrorCacheManager.getSanitizedMessage(obj);
    }

    if (obj == null || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepSanitizeObject(item));
    }

    const result: Record<string, unknown> = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(obj)) {
      const sanitizedValue = this.deepSanitizeObject(value);
      result[key] = sanitizedValue;
      if (sanitizedValue !== value) hasChanges = true;
    }

    return hasChanges ? result : obj;
  }

  private static handleLoggingFailure(loggingError: unknown, source: string): void {
    const fallbackError = {
      source,
      context: "Error Handler Failure",
      message: ErrorAnalyzer.getErrorMessage(loggingError),
      timestamp: new Date().toISOString(),
      stack: this.getStackTrace(loggingError),
    };

    try {
      logger.error(fallbackError);
    } catch {
      console.error("ErrorHandler failure:", fallbackError);
    }
  }
}
