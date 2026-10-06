/**
 * Minimal Discord RPC client over the local IPC socket, implementing
 * https://docs.discord.com/developers/topics/rpc (only what Rich Presence needs).
 */
import { randomUUID } from 'node:crypto';
import { createConnection, type Socket } from 'node:net';
import { join } from 'node:path';

export enum Opcode {
  Handshake = 0,
  Frame = 1,
  Close = 2,
  Ping = 3,
  Pong = 4,
}

export interface Activity {
  details?: string;
  state?: string;
  /** Unix timestamps in milliseconds */
  timestamps?: { start?: number };
  assets?: { large_image?: string; large_text?: string };
}

interface Payload {
  cmd?: string;
  evt?: string | null;
  nonce?: string | null;
  data?: { message?: string; code?: number } & Record<string, unknown>;
}

const REQUEST_TIMEOUT_MS = 10_000;
const HEADER_SIZE = 8;

export function encodeFrame(op: Opcode, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Splits a buffer into complete frames, returning the unconsumed remainder. */
export function decodeFrames(buffer: Buffer): { frames: { op: Opcode; payload: unknown }[]; rest: Buffer } {
  const frames: { op: Opcode; payload: unknown }[] = [];
  let offset = 0;
  while (buffer.length - offset >= HEADER_SIZE) {
    const op = buffer.readUInt32LE(offset);
    const length = buffer.readUInt32LE(offset + 4);
    if (buffer.length - offset - HEADER_SIZE < length) break;
    const body = buffer.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + length);
    frames.push({ op, payload: JSON.parse(body.toString('utf8')) });
    offset += HEADER_SIZE + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

export function ipcPaths(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string[] {
  const ids = Array.from({ length: 10 }, (_, i) => i);
  if (platform === 'win32') return ids.map(i => `\\\\?\\pipe\\discord-ipc-${i}`);

  const prefixes = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp']
    .filter((p): p is string => !!p);
  const dirs = new Set(prefixes);
  if (env.XDG_RUNTIME_DIR) {
    // Flatpak and Snap builds of Discord
    dirs.add(join(env.XDG_RUNTIME_DIR, 'app', 'com.discordapp.Discord'));
    dirs.add(join(env.XDG_RUNTIME_DIR, 'snap.discord'));
  }
  return [...dirs].flatMap(dir => ids.map(i => join(dir, `discord-ipc-${i}`)));
}

function connectTo(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.once('connect', () => {
      socket.off('error', reject);
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

export class DiscordIpc {
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pending = new Map<string, { resolve: (p: Payload) => void; reject: (e: Error) => void }>();
  private onReady: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private closedResolve: () => void = () => {};
  /** Resolves when the connection is lost or closed. */
  readonly closed = new Promise<void>(resolve => (this.closedResolve = resolve));

  constructor(private readonly clientId: string, private readonly paths = ipcPaths()) {}

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** Connects to the first available Discord client and performs the handshake. */
  async connect(): Promise<void> {
    for (const path of this.paths) {
      try {
        this.socket = await connectTo(path);
        break;
      } catch {
        // Try the next candidate path
      }
    }
    const socket = this.socket;
    if (!socket) throw new Error('no running Discord client found');

    socket.on('data', chunk => this.onData(chunk));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.onClose());

    const ready = new Promise<void>((resolve, reject) => (this.onReady = { resolve, reject }));
    socket.write(encodeFrame(Opcode.Handshake, { v: 1, client_id: this.clientId }));
    await withTimeout(ready, 'Discord handshake');
  }

  /** Sets the Rich Presence, or clears it when activity is null. */
  async setActivity(activity: Activity | null, pid = process.pid): Promise<void> {
    await this.request('SET_ACTIVITY', activity ? { pid, activity } : { pid });
  }

  close(): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.end(encodeFrame(Opcode.Close, {}));
      this.socket.destroy();
    }
  }

  private request(cmd: string, args: unknown): Promise<Payload> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(new Error('Not connected to Discord'));

    const nonce = randomUUID();
    const response = new Promise<Payload>((resolve, reject) => this.pending.set(nonce, { resolve, reject }));
    socket.write(encodeFrame(Opcode.Frame, { cmd, args, nonce }));
    return withTimeout(response, cmd).finally(() => this.pending.delete(nonce));
  }

  private onData(chunk: Buffer): void {
    let decoded;
    try {
      decoded = decodeFrames(Buffer.concat([this.buffer, chunk]));
    } catch {
      this.socket?.destroy();
      return;
    }
    this.buffer = decoded.rest;

    for (const { op, payload } of decoded.frames) {
      if (op === Opcode.Ping) {
        this.socket?.write(encodeFrame(Opcode.Pong, payload));
      } else if (op === Opcode.Close) {
        const { message } = (payload ?? {}) as { message?: string };
        this.onReady?.reject(new Error(`Discord closed the connection: ${message ?? 'unknown reason'}`));
        this.socket?.destroy();
      } else if (op === Opcode.Frame) {
        this.onFrame(payload as Payload);
      }
    }
  }

  private onFrame(payload: Payload): void {
    if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
      this.onReady?.resolve();
      this.onReady = null;
      return;
    }
    const pending = payload.nonce ? this.pending.get(payload.nonce) : undefined;
    if (!pending) return;
    if (payload.evt === 'ERROR') {
      pending.reject(new Error(`Discord error ${payload.data?.code}: ${payload.data?.message}`));
    } else {
      pending.resolve(payload);
    }
  }

  private onClose(): void {
    const error = new Error('Discord connection closed');
    this.onReady?.reject(error);
    this.onReady = null;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    this.socket = null;
    this.closedResolve();
  }
}

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
