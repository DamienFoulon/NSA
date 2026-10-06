import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { UserStore } from '../src/users.js';
import { tempDir } from './helpers.js';

describe('UserStore', () => {
  it('links users, finds them by token and persists only token hashes', async () => {
    const dir = tempDir();
    const store = await UserStore.open(dir);
    const token = await store.link('abc', 'Damien');

    assert.equal(store.findByToken(token)?.nsaId, 'abc');
    assert.equal(store.findByToken('wrong'), undefined);

    const file = readFileSync(join(dir, 'users.json'), 'utf8');
    assert.ok(!file.includes(token));
    assert.equal(statSync(join(dir, 'users.json')).mode & 0o777, 0o600);

    const reopened = await UserStore.open(dir);
    assert.equal(reopened.findByToken(token)?.name, 'Damien');
  });

  it('replaces the token when a user links again, and removes users', async () => {
    const store = await UserStore.open(tempDir());
    const first = await store.link('abc', 'Damien');
    const second = await store.link('abc', 'Damien');
    assert.equal(store.findByToken(first), undefined);
    assert.equal(store.findByToken(second)?.nsaId, 'abc');
    assert.equal(store.size, 1);

    await store.remove('abc');
    assert.equal(store.has('abc'), false);
  });

  it('caps friend requests per UTC day', async () => {
    const store = await UserStore.open(tempDir());
    const day1 = new Date('2026-10-06T10:00:00Z');
    assert.equal(await store.takeFriendRequest(2, day1), true);
    assert.equal(await store.takeFriendRequest(2, day1), true);
    assert.equal(await store.takeFriendRequest(2, day1), false);
    assert.equal(await store.takeFriendRequest(2, new Date('2026-10-07T00:00:01Z')), true);
  });
});
