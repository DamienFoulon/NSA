import { ApiError, fetchPresence, type PresenceResponse } from '../api.js';
import { DiscordPresence } from '../discord-presence.js';
import { describeError, log } from '../log.js';
import { toActivity } from '../presence.js';
import { loadSettings, resolveSettings } from '../settings.js';

type Problem = 'unreachable' | 'unauthorized' | 'stale' | 'unlinked' | null;

const PROBLEM_MESSAGES: Record<Exclude<Problem, null>, string> = {
  unreachable: 'Presence server unreachable',
  unauthorized: 'The server no longer knows this agent: run `nsa-agent pair` again',
  stale: 'The server reports stale data',
  unlinked: 'Your Nintendo account is no longer friends with the shared account: run `nsa-agent pair` again',
};

/** Mirrors the presence served by the server to the local Discord client, until stopped. */
export async function run(): Promise<void> {
  const settings = resolveSettings(await loadSettings());
  const token = settings.token;
  if (!token) {
    throw new Error('This agent is not paired yet: run `nsa-agent pair` first');
  }

  const discord = new DiscordPresence(settings.discordClientId);
  discord.start();

  let problem: Problem = null;
  let timer: NodeJS.Timeout | undefined;

  const poll = async () => {
    let presence: PresenceResponse | null = null;
    let current: Problem = null;
    try {
      presence = await fetchPresence(settings.serverUrl, token);
      if (presence.stale) current = 'stale';
      else if (!presence.linked) current = 'unlinked';
    } catch (err) {
      current = err instanceof ApiError && err.status === 401 ? 'unauthorized' : 'unreachable';
      if (current === 'unreachable' && problem !== 'unreachable') {
        log('warn', `${PROBLEM_MESSAGES.unreachable}: ${describeError(err)}`);
      }
    }

    // Only log transitions, not every poll.
    if (current !== problem) {
      if (current && current !== 'unreachable') log('warn', `${PROBLEM_MESSAGES[current]}, clearing the presence`);
      if (!current && problem) log('info', 'Presence available again');
      problem = current;
    }

    await discord.set(toActivity(presence, settings.fallbackImage));
    timer = setTimeout(poll, settings.pollIntervalSeconds * 1000);
  };

  log('info', `Polling ${settings.serverUrl.origin} every ${settings.pollIntervalSeconds}s`);
  void poll();

  const shutdown = async (signal: string) => {
    log('info', `${signal} received, clearing the presence and exiting`);
    clearTimeout(timer);
    await discord.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await new Promise<never>(() => {});
}
