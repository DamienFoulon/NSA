import { describeError, log } from './log.js';
import { FatalAuthError } from './errors.js';
import type { PresenceSource, PresenceStore } from './presence.js';

const MAX_BACKOFF_MS = 15 * 60 * 1000;

export interface Poller {
  stop(): void;
}

/** Polls the source in the background, backing off exponentially on errors. */
export function startPoller(source: PresenceSource, store: PresenceStore, intervalMs: number): Poller {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let failures = 0;

  const tick = async () => {
    try {
      store.update(await source.fetch());
      if (failures > 0) log('info', `Polling recovered after ${failures} failure(s)`);
      failures = 0;
    } catch (err) {
      if (err instanceof FatalAuthError) {
        log('error', `${err.message}. Polling stopped, /presence will report stale data.`);
        return;
      }
      failures++;
      log('warn', `Poll failed (${failures} in a row): ${describeError(err)}`);
    }

    if (stopped) return;
    const delay = Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS);
    timer = setTimeout(tick, delay);
  };

  void tick();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
