import { installAll, formatInstallResults } from './install.js';

export async function setupCommand(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const includeHooks = args.includes('--hooks');
  const unknown = args.filter((arg) => arg !== '--dry-run' && arg !== '--hooks');
  if (unknown.length > 0) throw new Error('Usage: contextbook setup [--dry-run] [--hooks]');

  const results = await installAll({ dryRun, includeHooks });
  console.log(formatSetupResult(formatInstallResults(results), dryRun, includeHooks));
}

function formatSetupResult(installOutput: string, dryRun: boolean, includeHooks: boolean): string {
  const lines = [
    `# Contextbook setup${dryRun ? ' (dry run)' : ''}`,
    '',
    `This sets up local Codex and Claude Code helper files so agents can call the deterministic contextbook CLI${includeHooks ? ', including opt-in prompt-capture hook helpers' : ''}.`,
    '',
    installOutput
  ];
  if (includeHooks) {
    lines.push('', 'Hook helpers are opt-in. Merge the generated guide snippets into your Codex/Claude hook settings to enable UserPromptSubmit capture.');
  }
  if (dryRun) lines.push('', `No files were written. Re-run \`contextbook setup${includeHooks ? ' --hooks' : ''}\` to install.`);
  return lines.join('\n');
}
