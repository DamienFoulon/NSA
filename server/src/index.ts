import { readConfig } from './config.js';
import { createPresenceServer } from './http.js';
import { describeError, log } from './log.js';
import { MockPresenceSource } from './mock.js';
import { PresenceStore, type PresenceSource } from './presence.js';
import { startPoller } from './poller.js';

async function main(): Promise<void> {
  const config = readConfig();

  let source: PresenceSource;
  if (config.nintendo) {
    // Imported lazily so mock mode never loads nxapi.
    const { NintendoPresenceSource } = await import('./nintendo.js');
    source = new NintendoPresenceSource(config.nintendo);
  } else {
    source = new MockPresenceSource();
  }

  const store = new PresenceStore();
  const poller = startPoller(source, store, config.pollIntervalSeconds * 1000);
  const server = createPresenceServer(store, config.presenceToken);

  server.listen(config.port, config.host, () => {
    log('info', `Listening on ${config.host}:${config.port} ` +
      `(${config.nintendo ? 'Nintendo' : 'mock'} source, poll every ${config.pollIntervalSeconds}s)`);
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
