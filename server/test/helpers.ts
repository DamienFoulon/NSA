import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Friend, NintendoService, NintendoUser, SentFriendRequest } from '../src/nintendo.js';

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'nsa-server-'));
}

/** Nintendo account whose friend list and directory are set by the test. */
export class FakeNintendo implements NintendoService {
  friends: Friend[] = [];
  directory = new Map<string, NintendoUser>();
  sent: SentFriendRequest[] = [];
  deleted: string[] = [];
  cancelled: string[] = [];
  failSend = false;

  async getFriends() { return this.friends; }
  async findUserByFriendCode(code: string) { return this.directory.get(code) ?? null; }
  async sendFriendRequest(nsaId: string) {
    if (this.failSend) throw new Error('refused');
    this.sent.push({ id: `req-${nsaId}`, nsaId, createdAt: Date.now() });
  }
  async listSentFriendRequests() { return this.sent; }
  async cancelFriendRequest(id: string) { this.cancelled.push(id); }
  async deleteFriend(nsaId: string) { this.deleted.push(nsaId); }

  accept(nsaId: string, createdAt = Date.now()) {
    this.friends.push({
      nsaId,
      name: nsaId,
      createdAt,
      presence: { state: 'online', game: null, platform: null, reportedAt: createdAt },
    });
  }
}
