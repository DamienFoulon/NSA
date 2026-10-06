import { execFileSync, spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isSea } from 'node:sea';
import { configDir } from '../settings.js';

const UNIT_NAME = 'nsa-agent.service';

function windowsStartupScript(env = process.env): string {
  const appData = env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'nsa-agent.vbs');
}

function systemdUnitPath(env = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'systemd', 'user', UNIT_NAME);
}

/** Where `install` copies the executable so the download can be deleted. */
function installedExecutable(env = process.env, platform = process.platform): string {
  if (platform === 'win32') {
    return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'nsa-agent', 'nsa-agent.exe');
  }
  return join(homedir(), '.local', 'bin', 'nsa-agent');
}

/** VBScript that starts the agent without a console window. */
export function vbsScript(command: string[], logFile: string): string {
  const quoted = [...command, 'run', '--log-file', logFile].map(part => `""${part}""`).join(' ');
  return [
    "' Starts the NSA presence agent at logon, without a console window.",
    `CreateObject("WScript.Shell").Run "${quoted}", 0, False`,
    '',
  ].join('\r\n');
}

export function systemdUnit(command: string[]): string {
  return `[Unit]
Description=NSA - Nintendo Switch presence to Discord Rich Presence
After=network-online.target

[Service]
Type=simple
ExecStart=${[...command, 'run'].map(part => `"${part}"`).join(' ')}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
}

/** Copies the standalone executable to a stable place; returns the command to start it. */
async function prepareCommand(): Promise<string[]> {
  if (!isSea()) {
    // Development: node + script
    return [process.execPath, resolve(process.argv[1]!)];
  }
  const target = installedExecutable();
  if (resolve(process.execPath) !== target) {
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyFile(process.execPath, target);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'ETXTBSY' || code === 'EPERM') {
        throw new Error('The installed agent is running: run `nsa-agent uninstall` first, then install again.');
      }
      throw err;
    }
    await chmod(target, 0o755);
  }
  return [target];
}

/** Starts the agent at logon and right now. */
export async function install(): Promise<void> {
  const command = await prepareCommand();

  if (process.platform === 'win32') {
    const script = windowsStartupScript();
    const logFile = join(configDir(), 'agent.log');
    await mkdir(dirname(logFile), { recursive: true });
    await writeFile(script, vbsScript(command, logFile));
    spawn('wscript.exe', [script], { detached: true, stdio: 'ignore' }).unref();
    console.log(`Installed: the agent now starts at logon (log file: ${logFile}).`);
  } else if (process.platform === 'linux') {
    const unit = systemdUnitPath();
    await mkdir(dirname(unit), { recursive: true });
    await writeFile(unit, systemdUnit(command));
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
    execFileSync('systemctl', ['--user', 'enable', UNIT_NAME], { stdio: 'inherit' });
    execFileSync('systemctl', ['--user', 'restart', UNIT_NAME], { stdio: 'inherit' });
    console.log(`Installed: the agent now starts at logon (logs: journalctl --user -u ${UNIT_NAME}).`);
  } else {
    throw new Error(`Automatic start is not supported on ${process.platform}: run \`nsa-agent run\` yourself.`);
  }
}

export async function uninstall(): Promise<void> {
  if (process.platform === 'win32') {
    await rm(windowsStartupScript(), { force: true });
    if (isSea()) {
      try {
        execFileSync('taskkill', ['/F', '/IM', 'nsa-agent.exe', '/FI', `PID ne ${process.pid}`], { stdio: 'ignore' });
      } catch {
        // Not running
      }
    }
  } else if (process.platform === 'linux') {
    try {
      execFileSync('systemctl', ['--user', 'disable', '--now', UNIT_NAME], { stdio: 'ignore' });
    } catch {
      // Not installed
    }
    await rm(systemdUnitPath(), { force: true });
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
  }
  console.log('Automatic start removed and background agent stopped. Your pairing is kept (`nsa-agent unpair` to remove it).');
}
