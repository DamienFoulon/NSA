export type PresenceState = 'playing' | 'online' | 'offline';
export type Platform = 'switch' | 'switch2';

export interface Game {
  name: string;
  imageUrl: string | null;
}

/** What a presence source reports on each successful poll. */
export interface PresenceSnapshot {
  state: PresenceState;
  game: Game | null;
  platform: Platform | null;
  /** When Nintendo last updated the presence (ms since epoch). */
  reportedAt: number;
}

export interface PresenceSource {
  fetch(): Promise<PresenceSnapshot>;
}

/** Body of GET /presence. */
export interface PresenceResponse {
  state: PresenceState;
  game: Game | null;
  platform: Platform | null;
  since: string | null;
  updatedAt: string;
  stale: boolean;
}

export const STALE_AFTER_MS = 3 * 60 * 1000;

export class PresenceStore {
  private snapshot: PresenceSnapshot | null = null;
  private since: number | null = null;
  private lastSuccessAt: number | null = null;

  constructor(private readonly startedAt = Date.now()) {}

  update(next: PresenceSnapshot, now = Date.now()): void {
    const previousGame = this.snapshot?.state === 'playing' ? this.snapshot.game?.name : undefined;

    if (next.state !== 'playing' || !next.game) {
      this.since = null;
    } else if (next.game.name !== previousGame || this.since === null) {
      // Nintendo gives no start time: use the presence update time, which
      // matches the moment the game was launched when we notice it quickly.
      this.since = Math.min(next.reportedAt, now);
    }

    this.snapshot = next;
    this.lastSuccessAt = now;
  }

  toResponse(now = Date.now()): PresenceResponse {
    const snapshot = this.snapshot;
    const updatedAt = this.lastSuccessAt ?? this.startedAt;
    return {
      state: snapshot?.state ?? 'offline',
      game: snapshot?.game ?? null,
      platform: snapshot?.platform ?? null,
      since: this.since === null ? null : new Date(this.since).toISOString(),
      updatedAt: new Date(updatedAt).toISOString(),
      stale: this.lastSuccessAt === null || now - this.lastSuccessAt > STALE_AFTER_MS,
    };
  }
}
