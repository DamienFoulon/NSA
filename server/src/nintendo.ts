import { addUserAgent } from 'nxapi';
import CoralApi, {
  CoralErrorResponse,
  CoralStatus,
  PresencePlatform,
  PresenceState,
  type Friend_4,
} from 'nxapi/coral';
import { NintendoAccountAuthErrorResponse } from 'nxapi/nintendo-account';
import { FatalAuthError } from './errors.js';
import type { PresenceSnapshot } from './presence.js';

// nxapi requires identifying the program in requests to third-party APIs.
addUserAgent('nsa-presence-server/0.2.0 (+https://github.com/DamienFoulon/NSA)');

export interface Friend {
  nsaId: string;
  name: string;
  /** When the friendship was created (ms since epoch) */
  createdAt: number;
  presence: PresenceSnapshot;
}

export interface NintendoUser {
  nsaId: string;
  name: string;
}

export interface SentFriendRequest {
  id: string;
  nsaId: string;
  /** ms since epoch */
  createdAt: number;
}

/** What the server needs from the shared Nintendo account. */
export interface NintendoService {
  getFriends(): Promise<Friend[]>;
  /** null when no user has this friend code (format 1234-5678-9012) */
  findUserByFriendCode(friendCode: string): Promise<NintendoUser | null>;
  sendFriendRequest(nsaId: string): Promise<void>;
  listSentFriendRequests(): Promise<SentFriendRequest[]>;
  cancelFriendRequest(id: string): Promise<void>;
  deleteFriend(nsaId: string): Promise<void>;
}

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

export class NintendoClient implements NintendoService {
  private api: CoralApi | null = null;

  constructor(private readonly sessionToken: string) {}

  async getFriends(): Promise<Friend[]> {
    const { friends } = await this.call(api => api.getFriendList());
    return friends.map(friend => ({
      nsaId: friend.nsaId,
      name: friend.name,
      createdAt: friend.friendCreatedAt * 1000,
      presence: toSnapshot(friend),
    }));
  }

  async findUserByFriendCode(friendCode: string): Promise<NintendoUser | null> {
    try {
      const user = await this.call(api => api.getUserByFriendCode(friendCode));
      return { nsaId: user.nsaId, name: user.name };
    } catch (err) {
      if (err instanceof CoralErrorResponse &&
          (err.status === CoralStatus.USER_NOT_FOUND || err.status === CoralStatus.RESOURCE_NOT_FOUND)) {
        return null;
      }
      throw err;
    }
  }

  async sendFriendRequest(nsaId: string): Promise<void> {
    await this.call(api => api.sendFriendRequest(nsaId));
  }

  async listSentFriendRequests(): Promise<SentFriendRequest[]> {
    const { friendRequests } = await this.call(api => api.getSentFriendRequests());
    return friendRequests.map(r => ({ id: r.id, nsaId: r.receiver.nsaId, createdAt: r.createdAt * 1000 }));
  }

  async cancelFriendRequest(id: string): Promise<void> {
    await this.call(api => api.cancelFriendRequest(id));
  }

  async deleteFriend(nsaId: string): Promise<void> {
    await this.call(api => api.deleteFriend(nsaId));
  }

  private async call<T>(request: (api: CoralApi) => Promise<T>): Promise<T> {
    this.api ??= await login(this.sessionToken);
    try {
      return await request(this.api);
    } catch (err) {
      if (err instanceof CoralErrorResponse &&
          (err.status === CoralStatus.INVALID_TOKEN || err.status === CoralStatus.TOKEN_EXPIRED)) {
        // Renewal failed: log in from scratch on the next call.
        this.api = null;
      }
      throw toFatalIfRevoked(err);
    }
  }
}

function toFatalIfRevoked(err: unknown): unknown {
  if (err instanceof NintendoAccountAuthErrorResponse && err.data?.error === 'invalid_grant') {
    return new FatalAuthError('The Nintendo session token has expired or was revoked, run the login script again');
  }
  return err;
}
