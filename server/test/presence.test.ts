import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PresenceTracker, STALE_AFTER_MS, type PresenceSnapshot } from '../src/presence.js';

const T0 = Date.parse('2026-10-06T12:00:00Z');

function playing(name: string, reportedAt: number): PresenceSnapshot {
  return { state: 'playing', game: { name, imageUrl: null }, platform: 'switch', reportedAt };
}

const online: PresenceSnapshot = { state: 'online', game: null, platform: null, reportedAt: T0 };

describe('PresenceTracker', () => {
  it('is offline, stale and assumed linked before the first poll', () => {
    const response = new PresenceTracker(T0).get('a', T0);
    assert.deepEqual(
      [response.state, response.stale, response.linked, response.updatedAt],
      ['offline', true, true, new Date(T0).toISOString()],
    );
  });

  it('tracks each friend separately', () => {
    const tracker = new PresenceTracker(T0);
    tracker.update(new Map([['a', playing('Zelda', T0 - 10_000)], ['b', online]]), T0);
    assert.equal(tracker.get('a', T0).since, new Date(T0 - 10_000).toISOString());
    assert.equal(tracker.get('b', T0).state, 'online');
    assert.equal(tracker.get('b', T0).since, null);
  });

  it('keeps since while the same game is played, even if Nintendo bumps updatedAt', () => {
    const tracker = new PresenceTracker(T0);
    tracker.update(new Map([['a', playing('Zelda', T0)]]), T0);
    tracker.update(new Map([['a', playing('Zelda', T0 + 3_600_000)]]), T0 + 3_600_000);
    assert.equal(tracker.get('a', T0 + 3_600_000).since, new Date(T0).toISOString());
  });

  it('resets since when the game changes, and never puts it in the future', () => {
    const tracker = new PresenceTracker(T0);
    tracker.update(new Map([['a', playing('Zelda', T0)]]), T0);
    tracker.update(new Map([['a', playing('Mario Kart', T0 + 120_000)]]), T0 + 60_000);
    assert.equal(tracker.get('a', T0 + 60_000).since, new Date(T0 + 60_000).toISOString());
  });

  it('reports friends that left the friend list as not linked', () => {
    const tracker = new PresenceTracker(T0);
    tracker.update(new Map([['a', online]]), T0);
    tracker.update(new Map(), T0 + 1000);
    assert.deepEqual([tracker.get('a', T0 + 1000).linked, tracker.get('a', T0 + 1000).state], [false, 'offline']);
  });

  it('reports stale data once the last successful poll is older than 3 minutes', () => {
    const tracker = new PresenceTracker(T0);
    tracker.update(new Map([['a', online]]), T0);
    assert.equal(tracker.get('a', T0 + STALE_AFTER_MS).stale, false);
    assert.equal(tracker.get('a', T0 + STALE_AFTER_MS + 1).stale, true);
  });
});
