import { installAll, formatInstallResults } from './install.js';

export async function setupCommand(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const unknown = args.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) throw new Error('Usage: contextbook setup [--dry-run]');

  const results = await installAll({ dryRun });
  console.log(formatSetupResult(formatInstallResults(results), dryRun));
}

function formatSetupResult(installOutput: string, dryRun: boolean): string {
  const lines = [
    `# Contextbook setup${dryRun ? ' (dry run)' : ''}`,
    '',
    'This sets up local Codex and Claude Code helper files so agents can call the deterministic contextbook CLI.',
    '',
    installOutput
  ];
  if (dryRun) lines.push('', 'No files were written. Re-run `contextbook setup` to install.');
  return lines.join('\n');
}
