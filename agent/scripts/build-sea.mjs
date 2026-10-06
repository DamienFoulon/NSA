// Builds the standalone agent executable for the current platform with
// Node.js single executable applications (https://nodejs.org/api/single-executable-applications.html).
//
// The server URL and Discord application ID baked into the executable come
// from NSA_SERVER_URL and NSA_DISCORD_CLIENT_ID.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { inject } from 'postject';

const out = 'dist/sea';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const exe = join(out, process.platform === 'win32' ? 'nsa-agent.exe' : 'nsa-agent');

if (!process.env.NSA_SERVER_URL || !process.env.NSA_DISCORD_CLIENT_ID) {
  console.warn('Warning: NSA_SERVER_URL or NSA_DISCORD_CLIENT_ID is not set, users will have to set them.');
}

mkdirSync(out, { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: join(out, 'nsa-agent.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  define: {
    __DEFAULT_SERVER_URL__: JSON.stringify(process.env.NSA_SERVER_URL ?? ''),
    __DEFAULT_DISCORD_CLIENT_ID__: JSON.stringify(process.env.NSA_DISCORD_CLIENT_ID ?? ''),
    __AGENT_VERSION__: JSON.stringify(pkg.version),
  },
});

const config = join(out, 'sea-config.json');
writeFileSync(config, JSON.stringify({
  main: join(out, 'nsa-agent.cjs'),
  output: join(out, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
}));
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });

copyFileSync(process.execPath, exe);
chmodSync(exe, 0o755);
await inject(exe, 'NODE_SEA_BLOB', readFileSync(join(out, 'sea-prep.blob')), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
});

console.log(`Built ${exe}`);
