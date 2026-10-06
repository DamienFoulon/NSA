import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError, createPairing, getPairing, unlink } from '../api.js';
import { decodeTransferCode, encodeTransferCode, loadSettings, resolveSettings, saveSettings } from '../settings.js';

const CHECK_INTERVAL_MS = 5_000;

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Links this agent to a Nintendo account through a friend request from the shared account. */
export async function pair(friendCodeArg?: string): Promise<void> {
  const stored = await loadSettings();
  const settings = resolveSettings(stored);
  if (stored.token) {
    console.log('This agent is already paired; pairing again replaces the previous link.\n');
  }

  const friendCode = friendCodeArg ?? await ask(
    'Your Nintendo Switch friend code (on the Switch: select your profile icon, e.g. SW-1234-5678-9012): ');

  let pairing;
  try {
    pairing = await createPairing(settings.serverUrl, friendCode);
  } catch (err) {
    throw err instanceof ApiError ? new Error(err.message) : err;
  }

  if (pairing.status === 'pending') {
    const minutes = Math.round((Date.parse(pairing.expiresAt) - Date.now()) / 60_000);
    console.log(`\nA friend request was sent to "${pairing.name}".`);
    console.log('Accept it on your Switch: open your profile > Add Friend > Received Friend Requests.');
    console.log(`Waiting for it (up to ${minutes} minutes; the server checks about once a minute).`);
  }

  for (;;) {
    const view = await getPairing(settings.serverUrl, pairing.id).catch(err => {
      if (err instanceof ApiError && err.status === 404) return { status: 'expired' as const };
      throw err;
    });
    if (view.status === 'linked') {
      await saveSettings({ ...stored, serverUrl: settings.serverUrl.href, token: view.token });
      console.log(`\nPaired with "${view.name}". The agent can now show your games on Discord.`);
      return;
    }
    if (view.status === 'expired') {
      throw new Error('The friend request was not accepted in time. Run `nsa-agent pair` again.');
    }
    await sleep(CHECK_INTERVAL_MS);
  }
}

/** Unlinks this agent: the server forgets the account and removes the friendship. */
export async function unpair(): Promise<void> {
  const stored = await loadSettings();
  if (!stored.token) {
    console.log('This agent is not paired.');
    return;
  }
  const settings = resolveSettings(stored);
  try {
    await unlink(settings.serverUrl, stored.token);
  } catch (err) {
    // Already unknown to the server: forget it locally anyway.
    if (!(err instanceof ApiError && err.status === 401)) throw err;
  }
  await saveSettings({ ...stored, token: undefined });
  console.log('Unpaired: the server forgot your account and the shared account removed you from its friends.');
}

export async function exportPairing(): Promise<void> {
  const stored = await loadSettings();
  if (!stored.token) throw new Error('This agent is not paired.');
  const settings = resolveSettings(stored);
  console.log('Transfer code (secret: anyone with it can see your games). Use it with `nsa-agent import <code>`:\n');
  console.log(encodeTransferCode(settings.serverUrl.href, stored.token));
}

export async function importPairing(code?: string): Promise<void> {
  const { serverUrl, token } = decodeTransferCode(code ?? await ask('Transfer code: '));
  const stored = await loadSettings();
  await saveSettings({ ...stored, serverUrl, token });
  console.log('Pairing imported.');
}
