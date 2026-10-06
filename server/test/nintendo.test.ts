import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Friend_4 } from 'nxapi/coral';
import { toSnapshot } from '../src/nintendo.js';

const game = { name: 'Zelda', imageUri: 'https://example.com/zelda.jpg', shopUri: '', totalPlayTime: 0, firstPlayedAt: 0, sysDescription: '' };

function friend(presence: Record<string, unknown>): Friend_4 {
  return { nsaId: 'abc', presence: { updatedAt: 1_700_000_000, logoutAt: 0, ...presence } } as unknown as Friend_4;
}

describe('toSnapshot', () => {
  it('maps ONLINE (in a game, offline play) to playing', () => {
    const snapshot = toSnapshot(friend({ state: 'ONLINE', game, platform: 1 }));
    assert.equal(snapshot.state, 'playing');
    assert.deepEqual(snapshot.game, { name: 'Zelda', imageUrl: 'https://example.com/zelda.jpg' });
    assert.equal(snapshot.platform, 'switch');
    assert.equal(snapshot.reportedAt, 1_700_000_000_000);
  });

  it('maps PLAYING (in a game, online play) to playing on Switch 2', () => {
    const snapshot = toSnapshot(friend({ state: 'PLAYING', game, platform: 2 }));
    assert.equal(snapshot.state, 'playing');
    assert.equal(snapshot.platform, 'switch2');
  });

  it('maps INACTIVE to online and OFFLINE to offline, without game', () => {
    assert.deepEqual(
      [toSnapshot(friend({ state: 'INACTIVE', game: {} })), toSnapshot(friend({ state: 'OFFLINE', game: {} }))]
        .map(s => [s.state, s.game, s.platform]),
      [['online', null, null], ['offline', null, null]],
    );
  });
});
