import type { PresenceResponse } from './api.js';
import type { Activity } from './discord-ipc.js';

/** The Rich Presence to show, or null to clear it. */
export function toActivity(presence: PresenceResponse | null, fallbackImage: string): Activity | null {
  if (!presence || presence.stale || !presence.linked || presence.state !== 'playing' || !presence.game) {
    return null;
  }

  const { game, since, platform } = presence;
  const start = since ? Date.parse(since) : NaN;
  return {
    details: game.name,
    state: platform === 'switch2' ? 'Nintendo Switch 2' : undefined,
    timestamps: Number.isNaN(start) ? undefined : { start },
    assets: { large_image: game.imageUrl ?? fallbackImage, large_text: game.name },
  };
}
