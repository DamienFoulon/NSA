import type { PresenceSnapshot, PresenceSource } from './presence.js';

const PHASE_MS = 60 * 1000;

const PHASES: Omit<PresenceSnapshot, 'reportedAt'>[] = [
  { state: 'playing', game: { name: 'Mario Kart World', imageUrl: null }, platform: 'switch2' },
  { state: 'playing', game: { name: 'Mario Kart World', imageUrl: null }, platform: 'switch2' },
  { state: 'online', game: null, platform: null },
  { state: 'playing', game: { name: 'The Legend of Zelda: Tears of the Kingdom', imageUrl: null }, platform: 'switch' },
  { state: 'playing', game: { name: 'The Legend of Zelda: Tears of the Kingdom', imageUrl: null }, platform: 'switch' },
  { state: 'offline', game: null, platform: null },
];

/** Fake presence that changes every minute, to test the agent without Nintendo. */
export class MockPresenceSource implements PresenceSource {
  async fetch(now = Date.now()): Promise<PresenceSnapshot> {
    const index = Math.floor(now / PHASE_MS) % PHASES.length;
    return { ...PHASES[index]!, reportedAt: Math.floor(now / PHASE_MS) * PHASE_MS };
  }
}
