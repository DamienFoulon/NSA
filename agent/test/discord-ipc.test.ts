import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { decodeFrames, DiscordIpc, encodeFrame, ipcPaths, Opcode } from '../src/discord-ipc.js';

describe('frames', () => {
  it('encodes opcode and length as little-endian uint32 before the JSON body', () => {
    const frame = encodeFrame(Opcode.Handshake, { v: 1, client_id: '123456789012345678' });
    // The JSON body is 40 bytes long
    assert.deepEqual([...frame.subarray(0, 8)], [0, 0, 0, 0, 0x28, 0, 0, 0]);
    assert.equal(frame.subarray(8).toString(), '{"v":1,"client_id":"123456789012345678"}');
  });

  it('decodes complete frames and keeps partial ones', () => {
    const data = Buffer.concat([encodeFrame(Opcode.Frame, { a: 1 }), encodeFrame(Opcode.Ping, { b: 2 })]);
    const { frames, rest } = decodeFrames(data.subarray(0, data.length - 3));
    assert.deepEqual(frames, [{ op: Opcode.Frame, payload: { a: 1 } }]);
    assert.equal(rest.length, data.length - 3 - encodeFrame(Opcode.Frame, { a: 1 }).length);
  });
});

describe('ipcPaths', () => {
  it('uses named pipes on Windows', () => {
    assert.equal(ipcPaths({}, 'win32')[0], '\\\\?\\pipe\\discord-ipc-0');
  });

  it('tries XDG_RUNTIME_DIR first, then the temp dirs, on Linux', () => {
    const paths = ipcPaths({ XDG_RUNTIME_DIR: '/run/user/1000' }, 'linux');
    assert.equal(paths[0], '/run/user/1000/discord-ipc-0');
    assert.ok(paths.includes('/tmp/discord-ipc-9'));
  });
});

/** Fake Discord client speaking the IPC protocol. */
describe('DiscordIpc against a fake Discord client', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nsa-ipc-'));
  const path = join(dir, 'discord-ipc-0');
  const received: unknown[] = [];
  let server: Server;

  before(async () => {
    server = createServer((socket: Socket) => {
      let buffer: Buffer = Buffer.alloc(0);
      socket.on('error', () => {});
      socket.on('data', chunk => {
        const decoded = decodeFrames(Buffer.concat([buffer, chunk]));
        buffer = decoded.rest;
        for (const { op, payload } of decoded.frames) {
          received.push(payload);
          const p = payload as { cmd?: string; nonce?: string; args?: { activity?: { details?: string } } };
          if (op === Opcode.Close) {
            socket.end();
          } else if (op === Opcode.Handshake) {
            socket.write(encodeFrame(Opcode.Frame, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }));
          } else if (p.args?.activity?.details === 'boom') {
            socket.write(encodeFrame(Opcode.Frame, { cmd: p.cmd, evt: 'ERROR', nonce: p.nonce, data: { code: 4000, message: 'bad' } }));
          } else {
            socket.write(encodeFrame(Opcode.Frame, { cmd: p.cmd, evt: null, nonce: p.nonce, data: {} }));
          }
        }
      });
    });
    await new Promise<void>(resolve => server.listen(path, resolve));
  });
  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('performs the handshake, sets and clears the activity', async () => {
    const ipc = new DiscordIpc('42', [join(dir, 'missing'), path]);
    await ipc.connect();
    assert.deepEqual(received[0], { v: 1, client_id: '42' });

    await ipc.setActivity({ details: 'Zelda' }, 1234);
    assert.deepEqual((received[1] as { args: unknown }).args, { pid: 1234, activity: { details: 'Zelda' } });

    await ipc.setActivity(null, 1234);
    assert.deepEqual((received[2] as { args: unknown }).args, { pid: 1234 });

    await assert.rejects(ipc.setActivity({ details: 'boom' }), /Discord error 4000: bad/);

    ipc.close();
    await ipc.closed;
    assert.equal(ipc.connected, false);
  });

  it('fails when no Discord client is running', async () => {
    await assert.rejects(new DiscordIpc('42', [join(dir, 'missing')]).connect());
  });
});
