export const MIN_POLL_INTERVAL_SECONDS = 30;

export interface ServerConfig {
  host: string;
  port: number;
  pollIntervalSeconds: number;
  /** Directory holding users.json */
  dataDir: string;
  pairingTtlMinutes: number;
  maxFriendRequestsPerDay: number;
  maxPairingsPerIpPerHour: number;
  /** Session token of the shared Nintendo account, null in mock mode */
  sessionToken: string | null;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Missing environment variable ${name}`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min) {
    throw new ConfigError(`${name} must be an integer greater than or equal to ${min}`);
  }
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const mock = env.MOCK === '1';
  if (!mock) {
    // Read by nxapi itself, checked here so a missing value fails fast.
    required(env, 'NXAPI_ZNCA_API_CLIENT_ID');
  }

  return {
    // Alwaysdata provides IP (or HOST) and PORT for Node.js sites.
    host: env.IP ?? env.HOST ?? '127.0.0.1',
    port: integer(env, 'PORT', 8080, 1),
    pollIntervalSeconds: integer(env, 'POLL_INTERVAL_SECONDS', 45, MIN_POLL_INTERVAL_SECONDS),
    dataDir: env.DATA_DIR?.trim() || 'data',
    pairingTtlMinutes: integer(env, 'PAIRING_TTL_MINUTES', 60, 5),
    maxFriendRequestsPerDay: integer(env, 'MAX_FRIEND_REQUESTS_PER_DAY', 30, 1),
    maxPairingsPerIpPerHour: integer(env, 'MAX_PAIRINGS_PER_IP_PER_HOUR', 5, 1),
    sessionToken: mock ? null : required(env, 'NSO_SESSION_TOKEN'),
  };
}
