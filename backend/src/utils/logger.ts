/*
 * Minimal structured logger for backend
 */
import util from 'node:util';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env;
  return 'info';
}

const MIN_LEVEL = getMinLevel();
const PRETTY = /^true$/i.test(process.env.LOG_PRETTY || '');

function redactValue(value: unknown, key?: string): unknown {
  const suspect = key && /(api[-_]?key|authorization|password|secret|token)/i.test(key);
  if (suspect) return '[REDACTED]';
  return value;
}

function redactDeep(obj: any): any {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactDeep(v));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    Object.keys(obj).forEach((k) => {
      out[k] = redactValue(obj[k], k);
    });
    return out;
  }
  return obj;
}

export class Logger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = { ...context };
  }

  child(extra: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...extra });
  }

  private shouldLog(level: LogLevel): boolean {
    return levelOrder[level] >= levelOrder[MIN_LEVEL];
  }

  private output(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;
    const time = new Date().toISOString();
    const payload = {
      time,
      level,
      message,
      ...this.context,
      ...(meta ? redactDeep(meta) : {}),
    };

    if (PRETTY) {
      const base = `[${time}] ${level.toUpperCase()} ${message}`;
      const ctx = { ...this.context, ...(meta ? redactDeep(meta) : {}) };
      // Avoid noisy empty object prints
      const details = Object.keys(ctx).length > 0 ? ' ' + util.inspect(ctx, { depth: 4, colors: false, breakLength: 120 }) : '';
      // Map level to console method
      const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      method(base + details);
    } else {
      const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      method(JSON.stringify(payload));
    }
  }

  debug(message: string, meta?: Record<string, unknown>) { this.output('debug', message, meta); }
  info(message: string, meta?: Record<string, unknown>) { this.output('info', message, meta); }
  warn(message: string, meta?: Record<string, unknown>) { this.output('warn', message, meta); }
  error(message: string, meta?: Record<string, unknown>) { this.output('error', message, meta); }
}

const logger = new Logger({ component: 'backend' });
export default logger;


