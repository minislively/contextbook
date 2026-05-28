import { installAll, formatInstallResults } from './install.js';

export async function setupCommand(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');
  const auto = args.includes('--auto');
  const legacyHooksFlag = args.includes('--hooks');
  const unknown = args.filter((arg) => arg !== '--dry-run' && arg !== '--auto' && arg !== '--hooks');
  if (unknown.length > 0) throw new Error('Usage: contextbook setup [--dry-run] [--auto]');

  const results = await installAll({
    dryRun,
    includeHooks: true,
    autoSafePreferences: true,
    nonInteractive: auto
  });
  console.log(formatSetupResult(formatInstallResults(results), { dryRun, auto, legacyHooksFlag }));
}

function formatSetupResult(installOutput: string, options: { dryRun: boolean; auto: boolean; legacyHooksFlag: boolean }): string {
  const lines = [
    `# Contextbook setup${options.dryRun ? ' (dry run)' : ''}`,
    '',
    'This sets up local Codex and Claude Code helper files, including UserPromptSubmit hook helpers, so agents can call the deterministic contextbook CLI from the environments you already use.',
    '',
    'Default setup includes safe preference automation: generated hooks may apply only policy-approved low-risk style preferences, with backups/audit/undo, and never raw-prompt storage, profile promotion, weak-term promotion, or learner judgment.',
    '',
    `Mode: ${options.auto ? 'auto/bootstrap — non-interactive safe defaults for CI or repeatable local setup' : 'standard — simple local setup with safe defaults'}`,
    '',
    installOutput
  ];
  if (options.legacyHooksFlag) {
    lines.push('', '`--hooks` is now included by default for `contextbook setup`; the flag is accepted for backward compatibility.');
  }
  lines.push('', "Contextbook still does not edit your Codex/Claude hook config automatically. Merge the generated guide snippets and use each agent runtime's trust/review flow when required.");
  if (options.dryRun) lines.push('', `No files were written. Re-run \`contextbook setup${options.auto ? ' --auto' : ''}\` to install.`);
  return lines.join('\n');
}
