import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { describeError, log } from './log.js';
import type { NintendoService } from './nintendo.js';
import { PairingError, type PairingManager } from './pairing.js';
import type { PresenceTracker } from './presence.js';
import type { StoredUser, UserStore } from './users.js';

const MAX_BODY_BYTES = 1024;

export interface AppContext {
  tracker: PresenceTracker;
  pairings: PairingManager;
  users: UserStore;
  nintendo: NintendoService;
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

/**
 * Alwaysdata's proxy appends the client address to X-Forwarded-For: the last
 * entry is the only one the client cannot forge.
 */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const last = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded)?.split(',').pop()?.trim();
  return last || req.socket.remoteAddress || 'unknown';
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body_too_large');
    chunks.push(chunk);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // handled below
  }
  throw new HttpError(400, 'invalid_json');
}

function authenticate(req: IncomingMessage, users: UserStore): StoredUser {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  const user = match ? users.findByToken(match[1]!) : undefined;
  if (!user) throw new HttpError(401, 'unauthorized');
  return user;
}

async function route(req: IncomingMessage, res: ServerResponse, app: AppContext): Promise<void> {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  if (pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (pathname === '/pairings' && method === 'POST') {
    const { friendCode } = await readJson(req);
    if (typeof friendCode !== 'string') throw new HttpError(400, 'invalid_friend_code');
    const pairing = await app.pairings.create(friendCode, clientIp(req));
    return sendJson(res, 201, pairing);
  }

  const pairingMatch = /^\/pairings\/([\w-]{16,64})$/.exec(pathname);
  if (pairingMatch && method === 'GET') {
    const pairing = app.pairings.get(pairingMatch[1]!);
    if (!pairing) throw new HttpError(404, 'not_found');
    return sendJson(res, 200, pairing);
  }

  if (pathname === '/presence' && method === 'GET') {
    const user = authenticate(req, app.users);
    return sendJson(res, 200, app.tracker.get(user.nsaId));
  }

  if (pathname === '/me' && method === 'DELETE') {
    const user = authenticate(req, app.users);
    await app.users.remove(user.nsaId);
    await app.nintendo.deleteFriend(user.nsaId).catch(err => {
      // The hourly maintenance removes friends that are not linked anyway.
      log('warn', `Could not remove an unlinked friend: ${describeError(err)}`);
    });
    return sendJson(res, 204, undefined);
  }

  throw new HttpError(404, 'not_found');
}

export function createAppServer(app: AppContext): Server {
  return createServer((req, res) => {
    route(req, res, app).catch(err => {
      if (err instanceof HttpError) {
        const headers: Record<string, string> = err.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {};
        sendJson(res, err.status, { error: err.code }, headers);
      } else if (err instanceof PairingError) {
        sendJson(res, err.status, { error: err.code, message: err.message });
      } else {
        log('error', `${req.method} ${req.url?.split('?')[0]} failed: ${describeError(err)}`);
        sendJson(res, 500, { error: 'internal_error' });
      }
    });
  });
}
