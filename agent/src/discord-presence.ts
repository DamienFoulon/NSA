import { DiscordIpc, type Activity } from './discord-ipc.js';
import { describeError, log } from './log.js';

const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

/**
 * Keeps a connection to the local Discord client and makes sure it shows the
 * desired activity. Discord is only called when the activity changes, or
 * after a reconnection.
 */
export class DiscordPresence {
  private ipc: DiscordIpc | null = null;
  private desired: Activity | null = null;
  private desiredKey = 'clear';
  /** null when Discord's current activity is unknown */
  private appliedKey: string | null = null;
  private queue = Promise.resolve();
  private stopped = false;
  private wakeUp: () => void = () => {};

  constructor(private readonly clientId: string) {}

  start(): void {
    void this.connectLoop();
  }

  set(activity: Activity | null): Promise<void> {
    this.desired = activity;
    this.desiredKey = activity ? JSON.stringify(activity) : 'clear';
    return this.sync();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.wakeUp();
    if (this.ipc?.connected) {
      await this.ipc.setActivity(null).catch(() => {});
    }
    this.ipc?.close();
  }

  private sync(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const ipc = this.ipc;
      if (!ipc?.connected || this.appliedKey === this.desiredKey) return;
      const key = this.desiredKey;
      const activity = this.desired;
      try {
        await ipc.setActivity(activity);
        this.appliedKey = key;
        log('info', activity ? `Discord presence set: ${activity.details}` : 'Discord presence cleared');
      } catch (err) {
        log('warn', `Could not update Discord presence: ${describeError(err)}`);
        ipc.close();
      }
    });
    return this.queue;
  }

  private async connectLoop(): Promise<void> {
    let retryMs = MIN_RETRY_MS;
    let reportedFailure = false;

    while (!this.stopped) {
      const ipc = new DiscordIpc(this.clientId);
      try {
        await ipc.connect();
        log('info', 'Connected to Discord');
        this.ipc = ipc;
        this.appliedKey = null;
        retryMs = MIN_RETRY_MS;
        reportedFailure = false;
        await this.sync();
        await ipc.closed;
        this.ipc = null;
        if (!this.stopped) log('warn', 'Disconnected from Discord');
      } catch (err) {
        ipc.close();
        if (!reportedFailure) {
          log('warn', `Discord is not reachable (${describeError(err)}), retrying in the background`);
          reportedFailure = true;
        }
      }

      if (this.stopped) break;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, retryMs);
        this.wakeUp = () => { clearTimeout(timer); resolve(); };
      });
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    }
  }
}
