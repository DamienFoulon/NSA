import type { Activity } from './discord-ipc.js';

/** Body of GET /presence, see server/src/presence.ts. */
export interface PresenceResponse {
  state: 'playing' | 'online' | 'offline';
  game: { name: string; imageUrl: string | null } | null;
  platform?: 'switch' | 'switch2' | null;
  since: string | null;
  updatedAt: string;
  stale: boolean;
}

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchPresence(url: URL, token: string): Promise<PresenceResponse> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Presence server answered HTTP ${res.status}`);
  return await res.json() as PresenceResponse;
}

/** The Rich Presence to show, or null to clear it. */
export function toActivity(presence: PresenceResponse | null, fallbackImage: string): Activity | null {
  if (!presence || presence.stale || presence.state !== 'playing' || !presence.game) return null;

  const { game, since, platform } = presence;
  const start = since ? Date.parse(since) : NaN;
  return {
    details: game.name,
    state: platform === 'switch2' ? 'Nintendo Switch 2' : undefined,
    timestamps: Number.isNaN(start) ? undefined : { start },
    assets: { large_image: game.imageUrl ?? fallbackImage, large_text: game.name },
  };
}
