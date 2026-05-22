import { installClaudeCode, installCodex, type InstallAction, type InstallResult } from '../install/installer.js';

export async function installCommand(args: string[]): Promise<void> {
  const { target, dryRun } = parseArgs(args);
  const result = target === 'codex'
    ? await installCodex({ dryRun })
    : await installClaudeCode({ dryRun });
  console.log(formatInstallResult(result));
}

function parseArgs(args: string[]): { target: 'codex' | 'claude-code'; dryRun: boolean } {
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((arg) => arg !== '--dry-run');
  const [target, ...rest] = positional;
  if (rest.length > 0 || (target !== 'codex' && target !== 'claude-code')) {
    throw new Error(`Usage: contextbook install <codex|claude-code> [--dry-run]`);
  }
  return { target, dryRun };
}

function formatInstallResult(result: InstallResult): string {
  const lines = [
    `# Contextbook ${result.target} install${result.dryRun ? ' (dry run)' : ''}`,
    ''
  ];
  for (const action of result.actions) {
    lines.push(`- ${statusLabel(action)} ${action.path}`);
    lines.push(`  ${action.description}`);
    if (action.backupPath) lines.push(`  backup: ${action.backupPath}`);
  }
  if (result.dryRun) {
    lines.push('', 'No files were written. Re-run without --dry-run to install.');
  }
  return lines.join('\n');
}

function statusLabel(action: InstallAction): string {
  switch (action.status) {
    case 'create':
      return 'created';
    case 'update-with-backup':
      return 'updated with backup';
    case 'skip-identical':
      return 'skipped identical';
    case 'dry-run-create':
      return 'would create';
    case 'dry-run-update-with-backup':
      return 'would update with backup';
  }
}
