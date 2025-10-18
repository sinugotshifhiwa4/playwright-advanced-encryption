import winston from "winston";
import WinstonLoggerFactory from "./internal/loggerFactory";

class LoggerManager {
  private static instance: winston.Logger | null = null;

  public static getLogger(): winston.Logger {
    if (!this.instance) {
      this.initializeLogger();
    }

    if (!this.instance) {
      throw new Error("Logger instance not initialized");
    }

    return this.instance;
  }

  private static initializeLogger(): void {
    this.instance = WinstonLoggerFactory.createLogger();
  }
}

// Export the logger instance
export default LoggerManager.getLogger();
