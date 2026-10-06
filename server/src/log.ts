type Level = 'info' | 'warn' | 'error';

export function log(level: Level, message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  if (level === 'info') console.log(line);
  else console.error(line);
}

/**
 * Describes an error without dumping the whole object: nxapi errors carry the
 * HTTP response, which must never end up in the logs.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const data = (err as { data?: unknown }).data;
    const detail = data && typeof data === 'object' && 'error' in data ? ` (${String(data.error)})` : '';
    return `${err.name}: ${err.message}${detail}`;
  }
  return String(err);
}
