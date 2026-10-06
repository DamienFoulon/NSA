import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createAppServer } from '../src/http.js';
import { PairingManager } from '../src/pairing.js';
import { PresenceTracker } from '../src/presence.js';
import { UserStore } from '../src/users.js';
import { FakeNintendo, tempDir } from './helpers.js';

describe('HTTP API', () => {
  const nintendo = new FakeNintendo();
  nintendo.directory.set('1234-5678-9012', { nsaId: 'abc', name: 'Damien' });
  let users: UserStore;
  let pairings: PairingManager;
  let base = '';
  let server: ReturnType<typeof createAppServer>;

  before(async () => {
    users = await UserStore.open(tempDir());
    pairings = new PairingManager(nintendo, users, { ttlMs: 3_600_000, maxPerIpPerHour: 5, maxFriendRequestsPerDay: 5 });
    await pairings.onFriends(new Set());
    server = createAppServer({ tracker: new PresenceTracker(), pairings, users, nintendo });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (path: string, body: string) =>
    fetch(`${base}${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

  it('answers /health and 404 for unknown routes', async () => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });

  it('validates pairing requests', async () => {
    assert.equal((await post('/pairings', 'not json')).status, 400);
    const res = await post('/pairings', JSON.stringify({ friendCode: 'nope' }));
    assert.equal(res.status, 400);
    assert.equal((await res.json() as { error: string }).error, 'invalid_friend_code');
    assert.equal((await post('/pairings', JSON.stringify({ friendCode: 'x'.repeat(2000) }))).status, 413);
  });

  it('pairs, serves the presence to the linked agent only, then unlinks', async () => {
    const created = await post('/pairings', JSON.stringify({ friendCode: 'SW-1234-5678-9012' }));
    assert.equal(created.status, 201);
    const { id } = await created.json() as { id: string };

    nintendo.accept('abc');
    await pairings.onFriends(new Set(['abc']));
    const linked = await (await fetch(`${base}/pairings/${id}`)).json() as { status: string; token: string };
    assert.equal(linked.status, 'linked');

    assert.equal((await fetch(`${base}/presence`)).status, 401);
    const auth = { Authorization: `Bearer ${linked.token}` };
    const presence = await fetch(`${base}/presence`, { headers: auth });
    assert.equal(presence.status, 200);
    assert.deepEqual(Object.keys(await presence.json() as object).sort(),
      ['game', 'linked', 'platform', 'since', 'stale', 'state', 'updatedAt']);

    assert.equal((await fetch(`${base}/me`, { method: 'DELETE', headers: auth })).status, 204);
    assert.deepEqual(nintendo.deleted, ['abc']);
    assert.equal((await fetch(`${base}/presence`, { headers: auth })).status, 401);
  });
});
