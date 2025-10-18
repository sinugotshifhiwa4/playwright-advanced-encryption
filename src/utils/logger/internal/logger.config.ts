import path from "path";

/**
 * Logger configuration types and constants
 */

export interface LoggerConfig {
  readonly logFileLimit: number;
  readonly timeZone: string;
  readonly dateFormat: string;
  readonly logLevels: LogLevels;
  readonly logFilePaths: LogFilePaths;
  readonly logDirectory: string;
}

export interface LogLevels {
  readonly debug: "debug";
  readonly info: "info";
  readonly error: "error";
  readonly warn: "warn";
}

export interface LogFilePaths {
  readonly debug: "debug.log";
  readonly info: "info.log";
  readonly error: "error.log";
  readonly warn: "warn.log";
}

/**
 * Winston logger configuration
 * All settings are centralized here for easy management
 */
export const winstonLoggerConfig: LoggerConfig = {
  logFileLimit: 10 * 1024 * 1024, // 10MB
  timeZone: "Africa/Johannesburg",
  dateFormat: "YYYY-MM-DDTHH:mm:ssZ",
  logLevels: {
    debug: "debug",
    info: "info",
    error: "error",
    warn: "warn",
  },
  logFilePaths: {
    debug: "debug.log",
    info: "info.log",
    error: "error.log",
    warn: "warn.log",
  },
  logDirectory: path.resolve(process.cwd(), "logs"),
} as const;

export type LogLevel = LogLevels[keyof LogLevels];

export type LogFilePath = LogFilePaths[keyof LogFilePaths];
