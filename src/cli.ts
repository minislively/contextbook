#!/usr/bin/env node
import { initCommand } from './commands/init.js';
import { learnerCommand } from './commands/learner.js';
import { learnCommand } from './commands/learn.js';
import { memoryCommand } from './commands/memory.js';
import { profileCommand } from './commands/profile.js';
import { projectCommand } from './commands/project.js';
import { scanCommand } from './commands/scan.js';
import { whyCommand } from './commands/why.js';
import { installCommand } from './commands/install.js';
import { setupCommand } from './commands/setup.js';
import { hooksCommand } from './commands/hooks.js';
import { doctorCommand } from './commands/doctor.js';

function help(): string {
  return `Contextbook — Learn the concepts behind the code you just touched.

Usage:
  contextbook init
  contextbook scan
  contextbook doctor [--json]
  contextbook project [--json]
  contextbook learner [--json]
  contextbook memory add-signal --type <type> [--concept <concept>] [--note <note>]
  contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]
  contextbook memory hook-suggest --prompt <text> [--source manual|codex|claude-code] [--mode suggest|auto-safe] [--include-memory-context] [--json]
  contextbook memory signals [--json]
  contextbook memory suggest-weak-terms [--json]
  contextbook memory suggest-profile-updates [--json]
  contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]
  contextbook memory apply-preference-signals --prompt <text> [--source manual|codex|claude-code] [--mode manual|suggest|auto-safe] [--dry-run] [--json]
  contextbook memory preference-history [--json]
  contextbook memory undo-preference-update --entry <id|index> (--dry-run|--yes) [--json]
  contextbook memory context [--json]
  contextbook memory recover [--safe] [--json]
  contextbook memory validate [--json]
  contextbook memory repair (--dry-run|--yes) [--json]
  contextbook memory rebuild (--dry-run|--yes) [--json]
  contextbook memory backup (--dry-run|--yes) [--json]
  contextbook memory restore --backup-id <id> (--dry-run|--yes) [--json]
  contextbook learn
  contextbook why "<question>"
  contextbook profile
  contextbook profile diff
  contextbook profile edit
  contextbook profile reset
  contextbook setup [--dry-run] [--auto]
  contextbook hooks status [--json]
  contextbook hooks smoke --prompt <text> [--platform codex|claude-code|all] [--json]
  contextbook install all [--dry-run] [--hooks] [--auto] [--codex-path auto|agents|codex|both]
  contextbook install codex [--dry-run] [--hooks] [--auto] [--codex-path auto|agents|codex|both]
  contextbook install claude-code [--dry-run] [--hooks] [--auto]
`;
}
async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  switch (command) {
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      console.log(help());
      return;
    case 'init':
      await initCommand();
      return;
    case 'scan':
      await scanCommand();
      return;
    case 'doctor':
      await doctorCommand(args);
      return;
    case 'learn':
      await learnCommand();
      return;
    case 'learner':
      await learnerCommand(args);
      return;
    case 'memory':
      await memoryCommand(args);
      return;
    case 'why':
      await whyCommand(args);
      return;
    case 'profile':
      await profileCommand(args);
      return;
    case 'project':
      await projectCommand(args);
      return;
    case 'setup':
      await setupCommand(args);
      return;
    case 'install':
      await installCommand(args);
      return;
    case 'hooks':
      await hooksCommand(args);
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\n${help()}`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
