/** Client of the NSA presence server, see server/src/http.ts. */

export interface PresenceResponse {
  state: 'playing' | 'online' | 'offline';
  game: { name: string; imageUrl: string | null } | null;
  platform: 'switch' | 'switch2' | null;
  since: string | null;
  updatedAt: string;
  stale: boolean;
  linked: boolean;
}

export type PairingView =
  | { status: 'pending'; name: string; expiresAt: string }
  | { status: 'linked'; name: string; token: string }
  | { status: 'expired' };

export class ApiError extends Error {
  override name = 'ApiError';

  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

async function request<T>(url: URL, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'http_error', body.message ?? `Server answered HTTP ${res.status}`);
  }
  return body as T;
}

function bearer(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export function createPairing(server: URL, friendCode: string): Promise<{ id: string } & PairingView> {
  return request(new URL('pairings', server), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendCode }),
  });
}

export function getPairing(server: URL, id: string): Promise<PairingView> {
  return request(new URL(`pairings/${encodeURIComponent(id)}`, server));
}

export function fetchPresence(server: URL, token: string): Promise<PresenceResponse> {
  return request(new URL('presence', server), { headers: bearer(token) });
}

export function unlink(server: URL, token: string): Promise<void> {
  return request(new URL('me', server), { method: 'DELETE', headers: bearer(token) });
}
