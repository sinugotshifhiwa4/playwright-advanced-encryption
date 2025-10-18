import winston, { format } from "winston";
import moment from "moment-timezone";
import path from "path";
import * as fs from "fs";
import { winstonLoggerConfig, LogLevel } from "./logger.config";
import type { EnvironmentStage } from "../../../configuration/environment/constants/environment.constants";

export default class LoggerFactory {
  private static directoryEnsured = false;

  public static createLogger(): winston.Logger {
    this.ensureLogDirectoryExists();
    const fileTransports = this.createFileTransports();

    return winston.createLogger({
      level: winstonLoggerConfig.logLevels.debug,
      transports: [
        fileTransports.info,
        fileTransports.warn,
        fileTransports.error,
        fileTransports.debug,
        this.createConsoleTransport(),
      ],
      exceptionHandlers: [this.createCustomHandler("exceptions.log")],
      rejectionHandlers: [this.createCustomHandler("rejections.log")],
    });
  }

  /**
   * Public method to ensure log directory exists
   * Only creates directory once per application lifecycle
   */
  public static ensureLogDirectoryExists(): void {
    if (this.directoryEnsured) {
      return;
    }

    const directory = winstonLoggerConfig.logDirectory;
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    this.directoryEnsured = true;
  }

  private static createFileTransports() {
    const createTransport = this.createTransportFactory(this.createBaseTransportConfig());
    return this.createLogLevelTransports(createTransport);
  }

  private static createBaseTransportConfig() {
    return {
      maxsize: winstonLoggerConfig.logFileLimit,
      timestampFormat: this.customTimestampFormat(),
      customFormat: this.logCustomFormat(),
    };
  }

  private static createTransportFactory(
    baseConfig: ReturnType<typeof this.createBaseTransportConfig>,
  ) {
    return (level: LogLevel, filename: string) =>
      new winston.transports.File({
        maxsize: baseConfig.maxsize,
        filename: this.resolvePath(filename),
        level,
        format: this.createCombinedFormat(level, baseConfig),
      });
  }

  private static createCombinedFormat(
    level: LogLevel,
    baseConfig: ReturnType<typeof this.createBaseTransportConfig>,
  ): winston.Logform.Format {
    return winston.format.combine(
      this.levelFilter(level),
      winston.format.uncolorize(),
      baseConfig.timestampFormat,
      baseConfig.customFormat,
    );
  }

  private static createLogLevelTransports(
    createTransport: (
      level: LogLevel,
      filename: string,
    ) => winston.transports.FileTransportInstance,
  ) {
    return {
      info: createTransport(
        winstonLoggerConfig.logLevels.info,
        winstonLoggerConfig.logFilePaths.info,
      ),
      warn: createTransport(
        winstonLoggerConfig.logLevels.warn,
        winstonLoggerConfig.logFilePaths.warn,
      ),
      error: createTransport(
        winstonLoggerConfig.logLevels.error,
        winstonLoggerConfig.logFilePaths.error,
      ),
      debug: createTransport(
        winstonLoggerConfig.logLevels.debug,
        winstonLoggerConfig.logFilePaths.debug,
      ),
    };
  }

  private static createConsoleTransport(): winston.transports.ConsoleTransportInstance {
    return new winston.transports.Console({
      level: this.getConsoleLogLevel((process.env.ENV as EnvironmentStage) || "dev"),
      format: this.createConsoleFormat(),
    });
  }

  private static createConsoleFormat(): winston.Logform.Format {
    return winston.format.combine(
      this.customTimestampFormat(),
      winston.format.colorize({
        colors: {
          error: "red",
          warn: "yellow",
          info: "green",
          debug: "magenta",
        },
      }),
      this.logCustomFormatColored(),
    );
  }

  private static createCustomHandler(filename: string) {
    return new winston.transports.File({
      filename: this.resolvePath(filename),
      format: this.createUncolorizedFormat(),
    });
  }

  private static createUncolorizedFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.uncolorize(),
      this.customTimestampFormat(),
      this.logCustomFormat(),
    );
  }

  private static getConsoleLogLevel(environment: EnvironmentStage): LogLevel {
    const levelMap: Record<EnvironmentStage, LogLevel> = {
      dev: winstonLoggerConfig.logLevels.debug,
      qa: winstonLoggerConfig.logLevels.debug,
      uat: winstonLoggerConfig.logLevels.info,
      preprod: winstonLoggerConfig.logLevels.warn,
      prod: winstonLoggerConfig.logLevels.error,
    };
    return levelMap[environment] || winstonLoggerConfig.logLevels.debug;
  }

  private static levelFilter(level: LogLevel): winston.Logform.Format {
    return format((info) => (info.level === level ? info : false))();
  }

  private static logCustomFormat(): winston.Logform.Format {
    return winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level}]: ${message}`;
    });
  }

  private static logCustomFormatColored(): winston.Logform.Format {
    return winston.format.printf((info) => {
      return `${info.timestamp} [${info.level}]: ${info.message}`;
    });
  }

  private static customTimestampFormat(): winston.Logform.Format {
    return winston.format.timestamp({
      format: () =>
        moment().tz(winstonLoggerConfig.timeZone).format(winstonLoggerConfig.dateFormat),
    });
  }

  private static resolvePath(fileName: string): string {
    return path.join(winstonLoggerConfig.logDirectory, fileName);
  }
}
