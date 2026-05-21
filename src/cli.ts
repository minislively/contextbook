#!/usr/bin/env node
import { initCommand } from './commands/init.js';
import { learnCommand } from './commands/learn.js';
import { profileCommand } from './commands/profile.js';
import { scanCommand } from './commands/scan.js';
import { whyCommand } from './commands/why.js';

function help(): string {
  return `Contextbook — Learn the concepts behind the code you just touched.\n\nUsage:\n  contextbook init\n  contextbook scan\n  contextbook learn\n  contextbook why "<question>"\n  contextbook profile\n`;
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
    case 'why':
      await whyCommand(args);
      return;
    case 'profile':
      await profileCommand();
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
