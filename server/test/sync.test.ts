import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PairingManager } from '../src/pairing.js';
import { PresenceTracker } from '../src/presence.js';
import { Synchronizer } from '../src/sync.js';
import { UserStore } from '../src/users.js';
import { FakeNintendo, tempDir } from './helpers.js';

const TTL = 60 * 60 * 1000;

describe('Synchronizer maintenance', () => {
  it('cancels stale friend requests and removes unlinked friends', async () => {
    const now = Date.now();
    const nintendo = new FakeNintendo();
    const users = await UserStore.open(tempDir());
    await users.link('linked', 'Linked');
    nintendo.accept('linked', now - 2 * TTL);
    nintendo.accept('stranger', now - 2 * TTL);
    nintendo.accept('recent', now - 1000);
    nintendo.sent.push({ id: 'old', nsaId: 'x', createdAt: now - 2 * TTL }, { id: 'new', nsaId: 'y', createdAt: now });

    const pairings = new PairingManager(nintendo, users, { ttlMs: TTL, maxPerIpPerHour: 5, maxFriendRequestsPerDay: 5 });
    await new Synchronizer(nintendo, new PresenceTracker(), pairings, users, TTL).run(now);

    assert.deepEqual(nintendo.cancelled, ['old']);
    assert.deepEqual(nintendo.deleted, ['stranger']);
  });
});
