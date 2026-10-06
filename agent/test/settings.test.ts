import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  configDir, decodeTransferCode, encodeTransferCode, loadSettings, resolveSettings, saveSettings,
} from '../src/settings.js';

describe('settings', () => {
  it('uses APPDATA on Windows and XDG_CONFIG_HOME on Linux', () => {
    assert.equal(configDir({ APPDATA: 'C:\\Users\\a\\AppData\\Roaming' }, 'win32'),
      join('C:\\Users\\a\\AppData\\Roaming', 'nsa-agent'));
    assert.equal(configDir({ XDG_CONFIG_HOME: '/home/a/.config' }, 'linux'), '/home/a/.config/nsa-agent');
  });

  it('saves and loads the settings file, readable by the user only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nsa-agent-'));
    assert.deepEqual(await loadSettings(dir), {});
    await saveSettings({ serverUrl: 'https://a.example/', token: 't' }, dir);
    assert.deepEqual(await loadSettings(dir), { serverUrl: 'https://a.example/', token: 't' });
    assert.equal(statSync(join(dir, 'config.json')).mode & 0o777, 0o600);
  });

  it('lets environment variables override the saved server', () => {
    const settings = resolveSettings({ serverUrl: 'https://saved.example', token: 't' },
      { NSA_SERVER_URL: 'https://env.example/nsa', DISCORD_CLIENT_ID: '123' });
    assert.equal(settings.serverUrl.href, 'https://env.example/nsa/');
    assert.equal(settings.token, 't');
    assert.equal(settings.pollIntervalSeconds, 20);
  });

  it('requires a server and a numeric Discord application ID without built-in defaults', () => {
    assert.throws(() => resolveSettings({}, { DISCORD_CLIENT_ID: '123' }), /NSA_SERVER_URL/);
    assert.throws(() => resolveSettings({ serverUrl: 'https://a.example' }, {}), /DISCORD_CLIENT_ID/);
    assert.throws(() => resolveSettings({ serverUrl: 'https://a.example' }, { DISCORD_CLIENT_ID: 'abc' }), /numeric/);
  });

  it('round-trips transfer codes and rejects invalid ones', () => {
    const code = encodeTransferCode('https://a.example/', 'secret');
    assert.deepEqual(decodeTransferCode(` ${code} `), { serverUrl: 'https://a.example/', token: 'secret' });
    assert.throws(() => decodeTransferCode('nsa1.garbage'), /Invalid transfer code/);
  });
});
