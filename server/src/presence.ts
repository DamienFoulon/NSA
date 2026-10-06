export type PresenceState = 'playing' | 'online' | 'offline';
export type Platform = 'switch' | 'switch2';

export interface Game {
  name: string;
  imageUrl: string | null;
}

/** Presence of one friend, as reported by Nintendo. */
export interface PresenceSnapshot {
  state: PresenceState;
  game: Game | null;
  platform: Platform | null;
  /** When Nintendo last updated the presence (ms since epoch). */
  reportedAt: number;
}

/** Body of GET /presence. */
export interface PresenceResponse {
  state: PresenceState;
  game: Game | null;
  platform: Platform | null;
  since: string | null;
  updatedAt: string;
  stale: boolean;
  /** false when the user is no longer friends with the shared account */
  linked: boolean;
}

export const STALE_AFTER_MS = 3 * 60 * 1000;

interface Entry {
  snapshot: PresenceSnapshot;
  since: number | null;
}

function nextSince(previous: Entry | undefined, next: PresenceSnapshot, now: number): number | null {
  if (next.state !== 'playing' || !next.game) return null;
  const previousGame = previous?.snapshot.state === 'playing' ? previous.snapshot.game?.name : undefined;
  if (next.game.name === previousGame && previous?.since != null) return previous.since;
  // Nintendo gives no start time: use the presence update time, which
  // matches the moment the game was launched when we notice it quickly.
  return Math.min(next.reportedAt, now);
}

/** Presence of every friend of the shared account, from the last successful poll. */
export class PresenceTracker {
  private entries = new Map<string, Entry>();
  private lastSuccessAt: number | null = null;

  constructor(private readonly startedAt = Date.now()) {}

  update(friends: ReadonlyMap<string, PresenceSnapshot>, now = Date.now()): void {
    const entries = new Map<string, Entry>();
    for (const [nsaId, snapshot] of friends) {
      entries.set(nsaId, { snapshot, since: nextSince(this.entries.get(nsaId), snapshot, now) });
    }
    this.entries = entries;
    this.lastSuccessAt = now;
  }

  get(nsaId: string, now = Date.now()): PresenceResponse {
    const entry = this.entries.get(nsaId);
    return {
      state: entry?.snapshot.state ?? 'offline',
      game: entry?.snapshot.game ?? null,
      platform: entry?.snapshot.platform ?? null,
      since: entry?.since == null ? null : new Date(entry.since).toISOString(),
      updatedAt: new Date(this.lastSuccessAt ?? this.startedAt).toISOString(),
      stale: this.lastSuccessAt === null || now - this.lastSuccessAt > STALE_AFTER_MS,
      // Unknown before the first poll: assume linked rather than alarm the user.
      linked: this.lastSuccessAt === null || entry !== undefined,
    };
  }
}
