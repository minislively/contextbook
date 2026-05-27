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

function help(): string {
  return `Contextbook — Learn the concepts behind the code you just touched.\n\nUsage:\n  contextbook init\n  contextbook scan\n  contextbook project [--json]\n  contextbook learner [--json]\n  contextbook memory add-signal --type <type> [--concept <concept>] [--note <note>]\n  contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]\n  contextbook memory hook-suggest --prompt <text> [--source manual|codex|claude-code] [--include-memory-context] [--json]\n  contextbook memory signals [--json]\n  contextbook memory suggest-weak-terms [--json]\n  contextbook memory suggest-profile-updates [--json]\n  contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]\n  contextbook memory apply-preference-signals --prompt <text> [--source manual|codex|claude-code] [--dry-run] [--json]\n  contextbook memory preference-history [--json]\n  contextbook memory undo-preference-update --entry <id|index> (--dry-run|--yes) [--json]\n  contextbook memory context [--json]\n  contextbook learn\n  contextbook why "<question>"\n  contextbook profile\n  contextbook profile diff\n  contextbook profile edit\n  contextbook profile reset\n  contextbook setup [--dry-run] [--hooks]\n  contextbook hooks status [--json]\n  contextbook hooks smoke --prompt <text> [--platform codex|claude-code|all] [--json]\n  contextbook install all [--dry-run] [--hooks] [--codex-path auto|agents|codex|both]\n  contextbook install codex [--dry-run] [--hooks] [--codex-path auto|agents|codex|both]\n  contextbook install claude-code [--dry-run] [--hooks]\n`;
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
