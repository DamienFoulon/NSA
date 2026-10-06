import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { normalizeFriendCode, PairingManager } from '../src/pairing.js';
import { UserStore } from '../src/users.js';
import { FakeNintendo, tempDir } from './helpers.js';

const T0 = Date.parse('2026-10-06T12:00:00Z');
const TTL = 60 * 60 * 1000;

describe('normalizeFriendCode', () => {
  it('accepts the usual spellings', () => {
    for (const input of ['SW-1234-5678-9012', 'sw 1234 5678 9012', '123456789012', ' 1234-5678-9012 ']) {
      assert.equal(normalizeFriendCode(input), '1234-5678-9012');
    }
    assert.equal(normalizeFriendCode('1234-5678'), null);
  });
});

describe('PairingManager', () => {
  let nintendo: FakeNintendo;
  let users: UserStore;
  let pairings: PairingManager;

  beforeEach(async () => {
    nintendo = new FakeNintendo();
    nintendo.directory.set('1234-5678-9012', { nsaId: 'abc', name: 'Damien' });
    users = await UserStore.open(tempDir());
    pairings = new PairingManager(nintendo, users, { ttlMs: TTL, maxPerIpPerHour: 3, maxFriendRequestsPerDay: 10 });
    await pairings.onFriends(new Set(), T0);
  });

  it('sends a friend request and links the account once it is accepted', async () => {
    const created = await pairings.create('SW-1234-5678-9012', 'ip', T0);
    assert.equal(created.status, 'pending');
    assert.deepEqual(nintendo.sent.map(r => r.nsaId), ['abc']);
    assert.equal(pairings.get(created.id, T0)?.status, 'pending');

    await pairings.onFriends(new Set(['abc']), T0 + 30_000);
    const linked = pairings.get(created.id, T0 + 30_000);
    assert.equal(linked?.status, 'linked');
    assert.equal(users.findByToken(linked?.status === 'linked' ? linked.token : '')?.nsaId, 'abc');

    // The token is handed out only once
    assert.equal(pairings.get(created.id, T0 + 31_000), undefined);
  });

  it('expires pairings that are not accepted in time', async () => {
    const created = await pairings.create('1234-5678-9012', 'ip', T0);
    await pairings.onFriends(new Set(), T0 + TTL + 1);
    assert.deepEqual(pairings.get(created.id, T0 + TTL + 1), { status: 'expired' });
    assert.equal(users.has('abc'), false);
  });

  it('rejects invalid, unknown, duplicate and already-friend requests', async () => {
    await assert.rejects(pairings.create('nope', 'ip', T0), { code: 'invalid_friend_code' });
    await assert.rejects(pairings.create('0000-0000-0000', 'ip', T0), { code: 'friend_code_not_found' });
    await pairings.create('1234-5678-9012', 'ip2', T0);
    await assert.rejects(pairings.create('1234-5678-9012', 'ip2', T0), { code: 'pairing_in_progress' });

    nintendo.directory.set('1111-1111-1111', { nsaId: 'friend', name: 'Friend' });
    await pairings.onFriends(new Set(['friend']), T0);
    await assert.rejects(pairings.create('1111-1111-1111', 'ip3', T0), { code: 'already_friends' });
  });

  it('lets a linked user who removed the shared account pair again, revoking the old token', async () => {
    const oldToken = await users.link('abc', 'Damien');
    const created = await pairings.create('1234-5678-9012', 'ip', T0);
    await pairings.onFriends(new Set(['abc']), T0 + 1000);
    assert.equal(pairings.get(created.id, T0 + 1000)?.status, 'linked');
    assert.equal(users.findByToken(oldToken), undefined);
  });

  it('limits attempts per IP and friend requests per day', async () => {
    for (let i = 0; i < 3; i++) await assert.rejects(pairings.create('0000-0000-0000', 'ip', T0));
    await assert.rejects(pairings.create('1234-5678-9012', 'ip', T0), { code: 'too_many_requests' });

    const capped = new PairingManager(nintendo, users, { ttlMs: TTL, maxPerIpPerHour: 10, maxFriendRequestsPerDay: 1 });
    await capped.onFriends(new Set(), T0);
    nintendo.directory.set('2222-2222-2222', { nsaId: 'def', name: 'Other' });
    await capped.create('1234-5678-9012', 'ip', T0);
    await assert.rejects(capped.create('2222-2222-2222', 'ip', T0), { code: 'daily_limit_reached' });
  });

  it('refuses to pair before the first poll', async () => {
    const fresh = new PairingManager(nintendo, users, { ttlMs: TTL, maxPerIpPerHour: 3, maxFriendRequestsPerDay: 10 });
    await assert.rejects(fresh.create('1234-5678-9012', 'ip', T0), { code: 'not_ready' });
  });

  it('reports a refused friend request', async () => {
    nintendo.failSend = true;
    await assert.rejects(pairings.create('1234-5678-9012', 'ip', T0), { code: 'friend_request_failed' });
  });
});
