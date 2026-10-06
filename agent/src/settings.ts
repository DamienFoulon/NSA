import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_DISCORD_CLIENT_ID, DEFAULT_SERVER_URL } from './build-info.js';

const MIN_POLL_INTERVAL_SECONDS = 15;
const DEFAULT_POLL_INTERVAL_SECONDS = 20;

/** Saved in config.json, in the user's configuration directory. */
export interface StoredSettings {
  serverUrl?: string;
  token?: string;
}

export interface Settings {
  /** Base URL of the server, always ending with a slash */
  serverUrl: URL;
  token: string | undefined;
  discordClientId: string;
  pollIntervalSeconds: number;
  fallbackImage: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function configDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === 'win32') return join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'nsa-agent');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'nsa-agent');
}

export async function loadSettings(dir = configDir()): Promise<StoredSettings> {
  try {
    return JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')) as StoredSettings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveSettings(settings: StoredSettings, dir = configDir()): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'config.json');
  await writeFile(`${path}.tmp`, JSON.stringify(settings, null, 2), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

/** Environment variables override the saved settings, which override the built-in defaults. */
export function resolveSettings(stored: StoredSettings, env: NodeJS.ProcessEnv = process.env): Settings {
  const server = env.NSA_SERVER_URL?.trim() || stored.serverUrl || DEFAULT_SERVER_URL;
  if (!server) throw new ConfigError('No server configured: set NSA_SERVER_URL');
  let serverUrl: URL;
  try {
    serverUrl = new URL(server.endsWith('/') ? server : `${server}/`);
  } catch {
    throw new ConfigError(`Invalid server URL: ${server}`);
  }

  const discordClientId = env.DISCORD_CLIENT_ID?.trim() || DEFAULT_DISCORD_CLIENT_ID;
  if (!discordClientId) throw new ConfigError('No Discord application configured: set DISCORD_CLIENT_ID');
  if (!/^\d+$/.test(discordClientId)) throw new ConfigError('DISCORD_CLIENT_ID must be a numeric application ID');

  const interval = Number(env.POLL_INTERVAL_SECONDS ?? DEFAULT_POLL_INTERVAL_SECONDS);
  if (!Number.isFinite(interval)) throw new ConfigError('POLL_INTERVAL_SECONDS must be a number');

  return {
    serverUrl,
    token: stored.token,
    discordClientId,
    pollIntervalSeconds: Math.max(interval, MIN_POLL_INTERVAL_SECONDS),
    fallbackImage: env.DISCORD_FALLBACK_IMAGE?.trim() || 'switch',
  };
}

const TRANSFER_PREFIX = 'nsa1.';

/** Packs the server URL and token to move a pairing to another computer. */
export function encodeTransferCode(serverUrl: string, token: string): string {
  return TRANSFER_PREFIX + Buffer.from(JSON.stringify({ s: serverUrl, t: token })).toString('base64url');
}

export function decodeTransferCode(code: string): { serverUrl: string; token: string } {
  const trimmed = code.trim();
  if (trimmed.startsWith(TRANSFER_PREFIX)) {
    try {
      const { s, t } = JSON.parse(Buffer.from(trimmed.slice(TRANSFER_PREFIX.length), 'base64url').toString('utf8'));
      if (typeof s === 'string' && typeof t === 'string') return { serverUrl: s, token: t };
    } catch {
      // handled below
    }
  }
  throw new ConfigError('Invalid transfer code');
}
