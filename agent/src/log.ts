import { appendFileSync } from 'node:fs';

type Level = 'info' | 'warn' | 'error';

let logFile: string | null = null;

/** Sends log lines to a file instead of the console (hidden autostart on Windows). */
export function setLogFile(path: string): void {
  logFile = path;
}

export function log(level: Level, message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  if (logFile) appendFileSync(logFile, line + '\n');
  else if (level === 'info') console.log(line);
  else console.error(line);
}

export function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
