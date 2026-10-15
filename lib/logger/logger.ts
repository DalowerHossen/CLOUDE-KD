// path: lib/logger/logger.ts
import { redact } from './redact';
import { writeLine } from './sink';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId: string;
  companyId?: string | null;
  actorId?: string | null;
}

let contextProvider: () => LogContext | undefined = () => undefined;

/** Server code registers the request context reader (lib/logger/correlation.ts); browsers log without it. */
export function setLogContextProvider(provider: () => LogContext | undefined): void {
  contextProvider = provider;
}
export type LogFields = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function activeLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  return configured === 'debug' ||
    configured === 'info' ||
    configured === 'warn' ||
    configured === 'error'
    ? configured
    : 'info';
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

/** Structured JSON logger. Fields are redacted before output; request context is attached automatically. */
export function createLogger(bindings: LogFields = {}): Logger {
  const emit = (level: LogLevel, message: string, fields?: LogFields): void => {
    if (ORDER[level] < ORDER[activeLevel()]) return;
    const context = contextProvider();
    const record = redact({
      ts: new Date().toISOString(),
      level,
      msg: message,
      correlation_id: context?.correlationId,
      company_id: context?.companyId ?? undefined,
      actor_id: context?.actorId ?? undefined,
      ...bindings,
      ...fields,
    });
    writeLine(level, JSON.stringify(record));
  };
  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (more) => createLogger({ ...bindings, ...more }),
  };
}

export const logger: Logger = createLogger();
