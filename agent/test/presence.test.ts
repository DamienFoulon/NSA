import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toActivity, type PresenceResponse } from '../src/presence.js';

const playing: PresenceResponse = {
  state: 'playing',
  game: { name: 'Zelda', imageUrl: 'https://example.com/zelda.jpg' },
  platform: 'switch',
  since: '2026-10-06T12:00:00.000Z',
  updatedAt: '2026-10-06T12:01:00.000Z',
  stale: false,
};

describe('toActivity', () => {
  it('shows the game, its image and start time while playing', () => {
    assert.deepEqual(toActivity(playing, 'switch'), {
      details: 'Zelda',
      state: undefined,
      timestamps: { start: Date.parse('2026-10-06T12:00:00.000Z') },
      assets: { large_image: 'https://example.com/zelda.jpg', large_text: 'Zelda' },
    });
  });

  it('falls back to the uploaded asset without image and names the Switch 2', () => {
    const activity = toActivity({ ...playing, platform: 'switch2', game: { name: 'Zelda', imageUrl: null } }, 'switch');
    assert.equal(activity?.assets?.large_image, 'switch');
    assert.equal(activity?.state, 'Nintendo Switch 2');
  });

  it('clears the presence when stale, online, offline or unreachable', () => {
    assert.equal(toActivity({ ...playing, stale: true }, 'switch'), null);
    assert.equal(toActivity({ ...playing, state: 'online', game: null }, 'switch'), null);
    assert.equal(toActivity({ ...playing, state: 'offline', game: null }, 'switch'), null);
    assert.equal(toActivity(null, 'switch'), null);
  });
});
