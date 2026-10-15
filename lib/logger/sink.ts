// path: lib/logger/sink.ts
// The only file allowed to touch the console. The Edge runtime has no process.stdout,
// so one JSON line per event is written through the console here.
import type { LogLevel } from './logger';

export function writeLine(level: LogLevel, line: string): void {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
