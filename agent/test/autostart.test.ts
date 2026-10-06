import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { systemdUnit, vbsScript } from '../src/commands/autostart.js';

describe('autostart files', () => {
  it('starts the agent hidden on Windows, logging to a file', () => {
    const script = vbsScript(['C:\\Users\\A B\\nsa-agent.exe'], 'C:\\Users\\A B\\agent.log');
    assert.ok(script.includes(
      '"""C:\\Users\\A B\\nsa-agent.exe"" ""run"" ""--log-file"" ""C:\\Users\\A B\\agent.log""", 0, False'));
    assert.ok(script.includes('\r\n'));
  });

  it('runs the agent as a systemd user service', () => {
    const unit = systemdUnit(['/home/a/.local/bin/nsa-agent']);
    assert.match(unit, /^ExecStart="\/home\/a\/\.local\/bin\/nsa-agent" "run"$/m);
    assert.match(unit, /^WantedBy=default\.target$/m);
  });
});
