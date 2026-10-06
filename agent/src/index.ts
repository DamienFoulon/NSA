import { readConfig } from './config.js';
import { DiscordPresence } from './discord-presence.js';
import { describeError, log } from './log.js';
import { fetchPresence, toActivity, type PresenceResponse } from './presence.js';

async function main(): Promise<void> {
  const config = readConfig();
  const discord = new DiscordPresence(config.discordClientId);
  discord.start();

  let serverReachable = true;
  let wasStale = false;
  let timer: NodeJS.Timeout | undefined;

  const poll = async () => {
    let presence: PresenceResponse | null = null;
    try {
      presence = await fetchPresence(config.presenceUrl, config.presenceToken);
      if (!serverReachable) log('info', 'Presence server reachable again');
      serverReachable = true;
      if (presence.stale && !wasStale) log('warn', 'Presence server reports stale data, clearing the presence');
      wasStale = presence.stale;
    } catch (err) {
      // Only log transitions, not every failed poll.
      if (serverReachable) log('warn', `Presence server unreachable: ${describeError(err)}`);
      serverReachable = false;
    }

    await discord.set(toActivity(presence, config.fallbackImage));
    timer = setTimeout(poll, config.pollIntervalSeconds * 1000);
  };

  log('info', `Polling ${config.presenceUrl.origin} every ${config.pollIntervalSeconds}s`);
  void poll();

  const shutdown = async (signal: string) => {
    log('info', `${signal} received, clearing the presence and exiting`);
    clearTimeout(timer);
    await discord.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(err => {
  log('error', describeError(err));
  process.exit(1);
});
