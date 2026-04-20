/**
 * AETHER Logger — The Voice of the System
 * 
 * Provides structured logging with levels and colorized output.
 * Built for Bun-native performance.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  static setGlobalLevel(level: LogLevel) {
    this.level = level;
  }

  private format(level: string, color: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const prefix = `${color}[${level}]${this.reset()} [${timestamp}] [${this.bold()}${this.context}${this.reset()}]`;
    
    if (data !== undefined) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  debug(message: string, data?: any) {
    if (Logger.level <= LogLevel.DEBUG) {
      this.format('DEBUG', this.gray(), message, data);
    }
  }

  info(message: string, data?: any) {
    if (Logger.level <= LogLevel.INFO) {
      this.format('INFO', this.cyan(), message, data);
    }
  }

  warn(message: string, data?: any) {
    if (Logger.level <= LogLevel.WARN) {
      this.format('WARN', this.yellow(), message, data);
    }
  }

  error(message: string, error?: any) {
    if (Logger.level <= LogLevel.ERROR) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';
      this.format('ERROR', this.red(), `${message}: ${errMsg}`);
      if (stack) console.error(this.gray() + stack + this.reset());
    }
  }

  // ANSI Colors
  private reset() { return '\x1b[0m'; }
  private bold() { return '\x1b[1m'; }
  private gray() { return '\x1b[90m'; }
  private red() { return '\x1b[31m'; }
  private yellow() { return '\x1b[33m'; }
  private cyan() { return '\x1b[36m'; }
}

export const createLogger = (context: string) => new Logger(context);
