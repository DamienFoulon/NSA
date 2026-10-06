type Level = 'info' | 'warn' | 'error';

export function log(level: Level, message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  if (level === 'info') console.log(line);
  else console.error(line);
}

export function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
