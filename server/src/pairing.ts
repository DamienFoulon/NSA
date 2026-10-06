import { randomBytes } from 'node:crypto';
import type { NintendoService } from './nintendo.js';
import type { UserStore } from './users.js';

export class PairingError extends Error {
  override name = 'PairingError';

  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

export interface PairingOptions {
  ttlMs: number;
  maxPerIpPerHour: number;
  maxFriendRequestsPerDay: number;
}

interface Pairing {
  id: string;
  nsaId: string;
  name: string;
  expiresAt: number;
  status: 'pending' | 'linked' | 'expired';
  token?: string;
}

export type PairingView =
  | { status: 'pending'; name: string; expiresAt: string }
  | { status: 'linked'; name: string; token: string }
  | { status: 'expired' };

const HOUR_MS = 60 * 60 * 1000;

/** Accepts "SW-1234-5678-9012", "1234 5678 9012", "123456789012"... */
export function normalizeFriendCode(input: string): string | null {
  const digits = input.trim().replace(/^SW[-\s]?/i, '').replace(/[-\s]/g, '');
  if (!/^\d{12}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
}

/**
 * Links agents to Nintendo accounts: the shared account sends a friend
 * request, and only the owner of the target account can accept it.
 */
export class PairingManager {
  private readonly pairings = new Map<string, Pairing>();
  private readonly attempts = new Map<string, number[]>();
  /** Friends seen in the last successful poll, null before the first one */
  private friendIds: ReadonlySet<string> | null = null;

  constructor(
    private readonly nintendo: NintendoService,
    private readonly users: UserStore,
    private readonly options: PairingOptions,
  ) {}

  async create(friendCodeInput: string, ip: string, now = Date.now()): Promise<{ id: string } & PairingView> {
    const friendCode = normalizeFriendCode(friendCodeInput);
    if (!friendCode) {
      throw new PairingError('invalid_friend_code', 400, 'Invalid friend code, expected SW-1234-5678-9012');
    }
    if (!this.friendIds) {
      throw new PairingError('not_ready', 503, 'The server is starting, try again in a minute');
    }
    this.checkRateLimit(ip, now);

    const target = await this.nintendo.findUserByFriendCode(friendCode);
    if (!target) {
      throw new PairingError('friend_code_not_found', 404, 'No Nintendo account has this friend code');
    }
    if (this.friendIds.has(target.nsaId)) {
      throw new PairingError('already_friends', 409,
        'This account is already friends with the shared account. Remove it from your friends on the Switch, then try again.');
    }
    if (this.findPending(target.nsaId, now)) {
      throw new PairingError('pairing_in_progress', 409, 'A friend request is already waiting for this account');
    }
    if (!await this.users.takeFriendRequest(this.options.maxFriendRequestsPerDay, new Date(now))) {
      throw new PairingError('daily_limit_reached', 503, 'Too many new users today, try again tomorrow');
    }

    try {
      await this.nintendo.sendFriendRequest(target.nsaId);
    } catch {
      throw new PairingError('friend_request_failed', 502,
        'Nintendo refused the friend request. Check that your Switch accepts friend requests and that your friend list is not full.');
    }

    const pairing: Pairing = {
      id: randomBytes(24).toString('base64url'),
      nsaId: target.nsaId,
      name: target.name,
      expiresAt: now + this.options.ttlMs,
      status: 'pending',
    };
    this.pairings.set(pairing.id, pairing);
    return { id: pairing.id, ...this.view(pairing) };
  }

  /** The token is handed out once, then the pairing is forgotten. */
  get(id: string, now = Date.now()): PairingView | undefined {
    const pairing = this.pairings.get(id);
    if (!pairing) return undefined;
    if (pairing.status === 'pending' && now > pairing.expiresAt) pairing.status = 'expired';
    if (pairing.status !== 'pending') this.pairings.delete(id);
    return this.view(pairing);
  }

  /** Called after each successful poll with the current friend list. */
  async onFriends(friendIds: ReadonlySet<string>, now = Date.now()): Promise<void> {
    this.friendIds = friendIds;
    for (const pairing of this.pairings.values()) {
      if (pairing.status === 'pending' && friendIds.has(pairing.nsaId)) {
        pairing.token = await this.users.link(pairing.nsaId, pairing.name, new Date(now));
        pairing.status = 'linked';
      } else if (pairing.status === 'pending' && now > pairing.expiresAt) {
        pairing.status = 'expired';
      } else if (pairing.status !== 'pending' && now > pairing.expiresAt + this.options.ttlMs) {
        // Never collected by the agent
        this.pairings.delete(pairing.id);
      }
    }
    this.pruneAttempts(now);
  }

  /** Accounts with a friend request still waiting for acceptance. */
  pendingIds(now = Date.now()): Set<string> {
    return new Set([...this.pairings.values()]
      .filter(p => p.status === 'pending' && now <= p.expiresAt)
      .map(p => p.nsaId));
  }

  private findPending(nsaId: string, now: number): Pairing | undefined {
    return [...this.pairings.values()].find(p => p.nsaId === nsaId && p.status === 'pending' && now <= p.expiresAt);
  }

  private checkRateLimit(ip: string, now: number): void {
    const recent = (this.attempts.get(ip) ?? []).filter(t => now - t < HOUR_MS);
    if (recent.length >= this.options.maxPerIpPerHour) {
      throw new PairingError('too_many_requests', 429, 'Too many pairing attempts, try again later');
    }
    recent.push(now);
    this.attempts.set(ip, recent);
  }

  private pruneAttempts(now: number): void {
    for (const [ip, times] of this.attempts) {
      if (times.every(t => now - t >= HOUR_MS)) this.attempts.delete(ip);
    }
  }

  private view(pairing: Pairing): PairingView {
    if (pairing.status === 'linked') return { status: 'linked', name: pairing.name, token: pairing.token! };
    if (pairing.status === 'expired') return { status: 'expired' };
    return { status: 'pending', name: pairing.name, expiresAt: new Date(pairing.expiresAt).toISOString() };
  }
}
