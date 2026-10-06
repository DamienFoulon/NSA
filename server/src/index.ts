import { readConfig } from './config.js';
import { createAppServer } from './http.js';
import { describeError, log } from './log.js';
import { MockNintendo } from './mock.js';
import type { NintendoService } from './nintendo.js';
import { PairingManager } from './pairing.js';
import { startPoller } from './poller.js';
import { PresenceTracker } from './presence.js';
import { Synchronizer } from './sync.js';
import { UserStore } from './users.js';

async function main(): Promise<void> {
  const config = readConfig();

  let nintendo: NintendoService;
  if (config.sessionToken) {
    // Imported lazily so mock mode never loads nxapi.
    const { NintendoClient } = await import('./nintendo.js');
    nintendo = new NintendoClient(config.sessionToken);
  } else {
    nintendo = new MockNintendo();
  }

  const pairingTtlMs = config.pairingTtlMinutes * 60 * 1000;
  const users = await UserStore.open(config.dataDir);
  const tracker = new PresenceTracker();
  const pairings = new PairingManager(nintendo, users, {
    ttlMs: pairingTtlMs,
    maxPerIpPerHour: config.maxPairingsPerIpPerHour,
    maxFriendRequestsPerDay: config.maxFriendRequestsPerDay,
  });
  const sync = new Synchronizer(nintendo, tracker, pairings, users, pairingTtlMs);

  const poller = startPoller(() => sync.run(), config.pollIntervalSeconds * 1000);
  const server = createAppServer({ tracker, pairings, users, nintendo });

  server.listen(config.port, config.host, () => {
    log('info', `Listening on ${config.host}:${config.port} ` +
      `(${config.sessionToken ? 'Nintendo' : 'mock'} account, ${users.size} linked user(s), ` +
      `poll every ${config.pollIntervalSeconds}s)`);
  });

  const shutdown = (signal: string) => {
    log('info', `${signal} received, shutting down`);
    poller.stop();
    server.close(() => process.exit(0));
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  log('error', describeError(err));
  process.exit(1);
});
