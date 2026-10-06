export const MIN_POLL_INTERVAL_SECONDS = 30;
const DEFAULT_POLL_INTERVAL_SECONDS = 45;
const MIN_PRESENCE_TOKEN_LENGTH = 32;

export interface NintendoConfig {
  sessionToken: string;
  friendNsaId: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  presenceToken: string;
  pollIntervalSeconds: number;
  /** null in mock mode */
  nintendo: NintendoConfig | null;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Missing environment variable ${name}`);
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const presenceToken = required(env, 'PRESENCE_TOKEN');
  if (presenceToken.length < MIN_PRESENCE_TOKEN_LENGTH) {
    throw new ConfigError(`PRESENCE_TOKEN must be at least ${MIN_PRESENCE_TOKEN_LENGTH} characters long`);
  }

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ConfigError(`Invalid PORT: ${env.PORT}`);
  }

  const interval = Number(env.POLL_INTERVAL_SECONDS ?? DEFAULT_POLL_INTERVAL_SECONDS);
  if (!Number.isFinite(interval)) {
    throw new ConfigError(`Invalid POLL_INTERVAL_SECONDS: ${env.POLL_INTERVAL_SECONDS}`);
  }

  const mock = env.MOCK === '1';
  let nintendo: NintendoConfig | null = null;
  if (!mock) {
    // Read by nxapi itself, checked here so a missing value fails fast.
    required(env, 'NXAPI_ZNCA_API_CLIENT_ID');
    nintendo = {
      sessionToken: required(env, 'NSO_SESSION_TOKEN'),
      friendNsaId: required(env, 'NSO_FRIEND_NSA_ID'),
    };
  }

  return {
    // Alwaysdata provides IP (or HOST) and PORT for Node.js sites.
    host: env.IP ?? env.HOST ?? '127.0.0.1',
    port,
    presenceToken,
    pollIntervalSeconds: Math.max(interval, MIN_POLL_INTERVAL_SECONDS),
    nintendo,
  };
}
