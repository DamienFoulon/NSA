import { addUserAgent } from 'nxapi';
import CoralApi, {
  CoralErrorResponse,
  CoralStatus,
  PresencePlatform,
  PresenceState,
  type Friend_4,
} from 'nxapi/coral';
import { NintendoAccountAuthErrorResponse } from 'nxapi/nintendo-account';
import type { NintendoConfig } from './config.js';
import { FatalAuthError } from './errors.js';
import type { PresenceSnapshot, PresenceSource } from './presence.js';

// nxapi requires identifying the program in requests to third-party APIs.
addUserAgent('nsa-presence-server/0.1.0 (+https://github.com/DamienFoulon/NSA)');

export async function login(sessionToken: string): Promise<CoralApi> {
  try {
    const { nso, data } = await CoralApi.createWithSessionToken(sessionToken);
    // nxapi calls this on TOKEN_EXPIRED and retries the request once;
    // renewToken() updates the token of the client itself.
    nso.onTokenExpired = async () => {
      await nso.renewToken(sessionToken, data.user);
    };
    return nso;
  } catch (err) {
    throw toFatalIfRevoked(err);
  }
}

export function toSnapshot(friend: Friend_4): PresenceSnapshot {
  const { presence } = friend;
  const reportedAt = presence.updatedAt * 1000;

  if (presence.state === PresenceState.ONLINE || presence.state === PresenceState.PLAYING) {
    return {
      state: 'playing',
      game: { name: presence.game.name, imageUrl: presence.game.imageUri || null },
      platform: presence.platform === PresencePlatform.OUNCE ? 'switch2' : 'switch',
      reportedAt,
    };
  }

  return {
    state: presence.state === PresenceState.INACTIVE ? 'online' : 'offline',
    game: null,
    platform: null,
    reportedAt,
  };
}

export class NintendoPresenceSource implements PresenceSource {
  private api: CoralApi | null = null;

  constructor(private readonly config: NintendoConfig) {}

  async fetch(): Promise<PresenceSnapshot> {
    this.api ??= await login(this.config.sessionToken);

    let friends: Friend_4[];
    try {
      ({ friends } = await this.api.getFriendList());
    } catch (err) {
      if (err instanceof CoralErrorResponse &&
          (err.status === CoralStatus.INVALID_TOKEN || err.status === CoralStatus.TOKEN_EXPIRED)) {
        // Renewal failed: log in from scratch on the next poll.
        this.api = null;
      }
      throw toFatalIfRevoked(err);
    }

    const friend = friends.find(f => f.nsaId === this.config.friendNsaId);
    if (!friend) {
      throw new Error('NSO_FRIEND_NSA_ID was not found in the friend list of the secondary account');
    }
    return toSnapshot(friend);
  }
}

function toFatalIfRevoked(err: unknown): unknown {
  if (err instanceof NintendoAccountAuthErrorResponse && err.data?.error === 'invalid_grant') {
    return new FatalAuthError('The Nintendo session token has expired or was revoked, run the login script again');
  }
  return err;
}
