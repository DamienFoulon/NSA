import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PresenceStore, STALE_AFTER_MS, type PresenceSnapshot } from '../src/presence.js';

const T0 = Date.parse('2026-10-06T12:00:00Z');

function playing(name: string, reportedAt: number): PresenceSnapshot {
  return { state: 'playing', game: { name, imageUrl: null }, platform: 'switch', reportedAt };
}

describe('PresenceStore', () => {
  it('is offline and stale before the first successful poll', () => {
    const response = new PresenceStore(T0).toResponse(T0);
    assert.equal(response.state, 'offline');
    assert.equal(response.stale, true);
    assert.equal(response.updatedAt, new Date(T0).toISOString());
  });

  it('sets since from the presence update time when a game starts', () => {
    const store = new PresenceStore(T0);
    store.update(playing('Zelda', T0 - 10_000), T0);
    assert.equal(store.toResponse(T0).since, new Date(T0 - 10_000).toISOString());
  });

  it('keeps since while the same game is played, even if Nintendo bumps updatedAt', () => {
    const store = new PresenceStore(T0);
    store.update(playing('Zelda', T0), T0);
    store.update(playing('Zelda', T0 + 3_600_000), T0 + 3_600_000);
    assert.equal(store.toResponse(T0 + 3_600_000).since, new Date(T0).toISOString());
  });

  it('resets since when the game changes or play stops', () => {
    const store = new PresenceStore(T0);
    store.update(playing('Zelda', T0), T0);
    store.update(playing('Mario Kart', T0 + 60_000), T0 + 60_000);
    assert.equal(store.toResponse(T0 + 60_000).since, new Date(T0 + 60_000).toISOString());

    store.update({ state: 'online', game: null, platform: null, reportedAt: T0 + 120_000 }, T0 + 120_000);
    assert.equal(store.toResponse(T0 + 120_000).since, null);
  });

  it('never puts since in the future', () => {
    const store = new PresenceStore(T0);
    store.update(playing('Zelda', T0 + 5_000), T0);
    assert.equal(store.toResponse(T0).since, new Date(T0).toISOString());
  });

  it('reports stale data once the last successful poll is older than 3 minutes', () => {
    const store = new PresenceStore(T0);
    store.update(playing('Zelda', T0), T0);
    assert.equal(store.toResponse(T0 + STALE_AFTER_MS).stale, false);
    assert.equal(store.toResponse(T0 + STALE_AFTER_MS + 1).stale, true);
  });
});
