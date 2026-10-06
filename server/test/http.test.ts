import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createPresenceServer } from '../src/http.js';
import { PresenceStore } from '../src/presence.js';

const TOKEN = 'test-token-that-is-long-enough-1234567890';

describe('HTTP API', () => {
  const server = createPresenceServer(new PresenceStore(), TOKEN);
  let base = '';

  before(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  it('answers /health without authentication', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });

  it('rejects /presence without a valid bearer token', async () => {
    assert.equal((await fetch(`${base}/presence`)).status, 401);
    const wrong = await fetch(`${base}/presence`, { headers: { Authorization: 'Bearer nope' } });
    assert.equal(wrong.status, 401);
  });

  it('returns the presence with a valid bearer token', async () => {
    const res = await fetch(`${base}/presence`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ['game', 'platform', 'since', 'stale', 'state', 'updatedAt']);
  });

  it('returns 404 for unknown routes', async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});
