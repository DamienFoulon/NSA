/**
 * Lists the friends of the secondary account with their NSA ID, to find the
 * value of NSO_FRIEND_NSA_ID. Requires NSO_SESSION_TOKEN and
 * NXAPI_ZNCA_API_CLIENT_ID (read from .env by `npm run list-friends`).
 */
import { login, toSnapshot } from '../src/nintendo.js';

const sessionToken = process.env.NSO_SESSION_TOKEN;
if (!sessionToken) {
  console.error('NSO_SESSION_TOKEN is not set');
  process.exit(1);
}

const api = await login(sessionToken);
const { friends } = await api.getFriendList();

for (const friend of friends) {
  const { state, game } = toSnapshot(friend);
  console.log(`${friend.name.padEnd(20)} nsaId=${friend.nsaId}  ${state}${game ? ` (${game.name})` : ''}`);
}
