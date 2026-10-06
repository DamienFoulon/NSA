import { AGENT_VERSION } from './build-info.js';
import { install, uninstall } from './commands/autostart.js';
import { ask, exportPairing, importPairing, pair, unpair } from './commands/pair.js';
import { run } from './commands/run.js';
import { describeError, log, setLogFile } from './log.js';
import { loadSettings } from './settings.js';

const HELP = `nsa-agent ${AGENT_VERSION} - shows your Nintendo Switch games on Discord

Usage: nsa-agent [command]

  (no command)       first start: pair and install; afterwards: show the status
  pair [friend-code] link this computer to your Nintendo account
  install            start the agent automatically at logon (and now)
  uninstall          stop the agent and remove the automatic start
  unpair             unlink your Nintendo account from the server
  export             print a code to move the pairing to another computer
  import [code]      use a code printed by \`export\`
  run                run the agent in the foreground
  help               show this help`;

/**
 * Without arguments (e.g. double-click on Windows): guided setup the first
 * time, then a status screen. Waits for Enter so the window stays readable.
 */
async function guided(): Promise<void> {
  try {
    if (!(await loadSettings()).token) {
      console.log('Welcome! This sets up nsa-agent in two steps.\n\nStep 1/2: pairing\n');
      await pair();
      console.log('\nStep 2/2: automatic start\n');
      await install();
      console.log('\nAll set: start a game on your Switch and keep Discord open.');
    } else {
      console.log('nsa-agent is paired and starts automatically at logon.\n');
      console.log(HELP);
    }
  } catch (err) {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  }
  await ask('\nPress Enter to close.');
}

async function main(argv: string[]): Promise<void> {
  const logFileIndex = argv.indexOf('--log-file');
  if (logFileIndex !== -1) {
    setLogFile(argv[logFileIndex + 1] ?? 'agent.log');
    argv.splice(logFileIndex, 2);
  }

  const [command, arg] = argv;
  switch (command) {
    case undefined: return guided();
    case 'run': return run();
    case 'pair': return pair(arg);
    case 'unpair': return unpair();
    case 'install': return install();
    case 'uninstall': return uninstall();
    case 'export': return exportPairing();
    case 'import': return importPairing(arg);
    case 'help': case '--help': case '-h': console.log(HELP); return;
    case 'version': case '--version': console.log(AGENT_VERSION); return;
    default: throw new Error(`Unknown command "${command}", see \`nsa-agent help\``);
  }
}

main(process.argv.slice(2)).catch(err => {
  log('error', describeError(err));
  process.exit(1);
});
