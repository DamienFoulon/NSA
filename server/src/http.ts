import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { PresenceStore } from './presence.js';

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function isAuthorized(req: IncomingMessage, expectedToken: string): boolean {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  // Hashing gives equal-length buffers, as required by timingSafeEqual.
  return !!match && timingSafeEqual(digest(match[1]!), digest(expectedToken));
}

export function createPresenceServer(store: PresenceStore, presenceToken: string): Server {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    } else if (pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
    } else if (pathname === '/presence') {
      if (isAuthorized(req, presenceToken)) {
        sendJson(res, 200, store.toResponse());
      } else {
        sendJson(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      }
    } else {
      sendJson(res, 404, { error: 'not_found' });
    }
  });
}
