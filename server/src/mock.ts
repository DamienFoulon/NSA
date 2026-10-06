import { createHash, randomUUID } from 'node:crypto';
import type { Friend, NintendoService, NintendoUser, SentFriendRequest } from './nintendo.js';
import type { PresenceSnapshot } from './presence.js';

const PHASE_MS = 60 * 1000;
const ACCEPT_AFTER_MS = 10 * 1000;

const PHASES: Omit<PresenceSnapshot, 'reportedAt'>[] = [
  { state: 'playing', game: { name: 'Mario Kart World', imageUrl: null }, platform: 'switch2' },
  { state: 'playing', game: { name: 'Mario Kart World', imageUrl: null }, platform: 'switch2' },
  { state: 'online', game: null, platform: null },
  { state: 'playing', game: { name: 'The Legend of Zelda: Tears of the Kingdom', imageUrl: null }, platform: 'switch' },
  { state: 'playing', game: { name: 'The Legend of Zelda: Tears of the Kingdom', imageUrl: null }, platform: 'switch' },
  { state: 'offline', game: null, platform: null },
];

/**
 * Fake shared account for testing without Nintendo: every friend code
 * except 0000-0000-0000 exists, friend requests are accepted after 10 s and
 * the presence of every friend changes every minute.
 */
export class MockNintendo implements NintendoService {
  private readonly friends = new Map<string, { name: string; createdAt: number }>();
  private readonly sent = new Map<string, SentFriendRequest & { name: string }>();

  async getFriends(now = Date.now()): Promise<Friend[]> {
    for (const request of this.sent.values()) {
      if (now - request.createdAt >= ACCEPT_AFTER_MS) {
        this.sent.delete(request.id);
        this.friends.set(request.nsaId, { name: request.name, createdAt: now });
      }
    }
    const phase = Math.floor(now / PHASE_MS);
    return [...this.friends].map(([nsaId, friend]) => ({
      nsaId,
      name: friend.name,
      createdAt: friend.createdAt,
      presence: { ...PHASES[phase % PHASES.length]!, reportedAt: phase * PHASE_MS },
    }));
  }

  async findUserByFriendCode(friendCode: string): Promise<NintendoUser | null> {
    if (friendCode === '0000-0000-0000') return null;
    const nsaId = createHash('sha256').update(friendCode).digest('hex').slice(0, 16);
    return { nsaId, name: `Player ${friendCode.slice(-4)}` };
  }

  async sendFriendRequest(nsaId: string): Promise<void> {
    const name = `Player ${nsaId.slice(0, 4)}`;
    const id = randomUUID();
    this.sent.set(id, { id, nsaId, name, createdAt: Date.now() });
  }

  async listSentFriendRequests(): Promise<SentFriendRequest[]> {
    return [...this.sent.values()];
  }

  async cancelFriendRequest(id: string): Promise<void> {
    this.sent.delete(id);
  }

  async deleteFriend(nsaId: string): Promise<void> {
    this.friends.delete(nsaId);
  }
}
