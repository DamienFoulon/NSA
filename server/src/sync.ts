import { describeError, log } from './log.js';
import type { NintendoService } from './nintendo.js';
import type { PairingManager } from './pairing.js';
import type { PresenceTracker } from './presence.js';
import type { UserStore } from './users.js';

const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

/** One poll of the shared account, plus hourly housekeeping. */
export class Synchronizer {
  private lastMaintenanceAt = 0;

  constructor(
    private readonly nintendo: NintendoService,
    private readonly tracker: PresenceTracker,
    private readonly pairings: PairingManager,
    private readonly users: UserStore,
    private readonly pairingTtlMs: number,
  ) {}

  async run(now = Date.now()): Promise<void> {
    const friends = await this.nintendo.getFriends();
    this.tracker.update(new Map(friends.map(f => [f.nsaId, f.presence])), now);
    await this.pairings.onFriends(new Set(friends.map(f => f.nsaId)), now);

    if (now - this.lastMaintenanceAt >= MAINTENANCE_INTERVAL_MS) {
      this.lastMaintenanceAt = now;
      await this.maintain(friends.map(f => ({ nsaId: f.nsaId, createdAt: f.createdAt })), now)
        .catch(err => log('warn', `Maintenance failed: ${describeError(err)}`));
    }
  }

  /**
   * Cancels friend requests nobody accepted and removes friends that are not
   * linked to an agent (e.g. accepted after the pairing expired), so the
   * friend list stays below Nintendo's 300 friends limit.
   */
  private async maintain(friends: { nsaId: string; createdAt: number }[], now: number): Promise<void> {
    const pending = this.pairings.pendingIds(now);

    for (const request of await this.nintendo.listSentFriendRequests()) {
      if (!pending.has(request.nsaId) && now - request.createdAt > this.pairingTtlMs) {
        await this.nintendo.cancelFriendRequest(request.id);
      }
    }

    for (const friend of friends) {
      if (!this.users.has(friend.nsaId) && !pending.has(friend.nsaId) && now - friend.createdAt > this.pairingTtlMs) {
        await this.nintendo.deleteFriend(friend.nsaId);
        log('info', 'Removed a friend that is not linked to any agent');
      }
    }
  }
}
