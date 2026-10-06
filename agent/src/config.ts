const MIN_POLL_INTERVAL_SECONDS = 15;
const DEFAULT_POLL_INTERVAL_SECONDS = 20;

export interface AgentConfig {
  presenceUrl: URL;
  presenceToken: string;
  discordClientId: string;
  pollIntervalSeconds: number;
  fallbackImage: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Missing environment variable ${name}`);
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  let presenceUrl: URL;
  try {
    presenceUrl = new URL(required(env, 'PRESENCE_URL'));
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError('PRESENCE_URL is not a valid URL');
  }

  const discordClientId = required(env, 'DISCORD_CLIENT_ID');
  if (!/^\d+$/.test(discordClientId)) throw new ConfigError('DISCORD_CLIENT_ID must be a numeric application ID');

  const interval = Number(env.POLL_INTERVAL_SECONDS ?? DEFAULT_POLL_INTERVAL_SECONDS);
  if (!Number.isFinite(interval)) {
    throw new ConfigError(`Invalid POLL_INTERVAL_SECONDS: ${env.POLL_INTERVAL_SECONDS}`);
  }

  return {
    presenceUrl,
    presenceToken: required(env, 'PRESENCE_TOKEN'),
    discordClientId,
    pollIntervalSeconds: Math.max(interval, MIN_POLL_INTERVAL_SECONDS),
    fallbackImage: env.DISCORD_FALLBACK_IMAGE?.trim() || 'switch',
  };
}
