// Replaced at bundle time by scripts/build-sea.mjs (esbuild `define`).
declare const __DEFAULT_SERVER_URL__: string | undefined;
declare const __DEFAULT_DISCORD_CLIENT_ID__: string | undefined;
declare const __AGENT_VERSION__: string | undefined;

function defined(value: string | undefined): string | undefined {
  return value || undefined;
}

export const DEFAULT_SERVER_URL =
  typeof __DEFAULT_SERVER_URL__ === 'string' ? defined(__DEFAULT_SERVER_URL__) : undefined;
export const DEFAULT_DISCORD_CLIENT_ID =
  typeof __DEFAULT_DISCORD_CLIENT_ID__ === 'string' ? defined(__DEFAULT_DISCORD_CLIENT_ID__) : undefined;
export const AGENT_VERSION = typeof __AGENT_VERSION__ === 'string' ? __AGENT_VERSION__ : 'dev';
