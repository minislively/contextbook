import { adapters, adapterIds, getAdapter, type AdapterId } from '../integrations/registry.js';
import type { CodexSkillPathMode, InstallAction, InstallOptions, InstallResult } from '../install/types.js';

type InstallTargetArg = AdapterId | 'all';

export async function installCommand(args: string[]): Promise<void> {
  const { target, options } = parseArgs(args);
  if (target === 'all') {
    console.log(formatInstallResults(await installAll(options)));
    return;
  }

  const adapter = getAdapter(target);
  if (!adapter) throw new Error(`Unknown adapter: ${target}\n\n${usage()}`);

  const result = await adapter.install(options);
  console.log(formatInstallResult(result));
}

export async function installAll(options: InstallOptions): Promise<InstallResult[]> {
  return Promise.all(adapters.map((adapter) => adapter.install(options)));
}

export function formatInstallResults(results: InstallResult[]): string {
  return results.map(formatInstallResult).join('\n\n');
}

function parseArgs(args: string[]): { target: InstallTargetArg; options: InstallOptions } {
  const [target, ...rest] = args;
  if (!target || !isInstallTargetArg(target)) throw new Error(usage());

  const options: InstallOptions = { dryRun: false };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--hooks') {
      options.includeHooks = true;
      continue;
    }
    if (arg === '--auto') {
      options.includeHooks = true;
      options.autoSafePreferences = true;
      options.nonInteractive = true;
      continue;
    }
    if (arg === '--codex-path') {
      const value = rest[index + 1];
      assertCodexPathSupported(target, value);
      options.codexSkillPathMode = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith('--codex-path=')) {
      const value = arg.slice('--codex-path='.length);
      assertCodexPathSupported(target, value);
      options.codexSkillPathMode = value;
      continue;
    }
    throw new Error(`Unknown install option: ${arg}\n\n${usage()}`);
  }

  return { target, options };
}

function isInstallTargetArg(value: string): value is InstallTargetArg {
  return value === 'all' || adapterIds.includes(value as AdapterId);
}

function assertCodexPathSupported(target: InstallTargetArg, value: string | undefined): asserts value is CodexSkillPathMode {
  if (target !== 'codex' && target !== 'all') throw new Error(`--codex-path is only supported for codex or all installs\n\n${usage()}`);
  if (!isCodexSkillPathMode(value)) throw new Error(`Invalid --codex-path value: ${value ?? '<missing>'}\n\n${usage()}`);
}

function isCodexSkillPathMode(value: string | undefined): value is CodexSkillPathMode {
  return value === 'auto' || value === 'agents' || value === 'codex' || value === 'both';
}

function usage(): string {
  return `Usage: contextbook install <all|${adapterIds.join('|')}> [--dry-run] [--hooks] [--auto]\n       contextbook install codex [--dry-run] [--hooks] [--auto] [--codex-path auto|agents|codex|both]\n       contextbook install all [--dry-run] [--hooks] [--auto] [--codex-path auto|agents|codex|both]`;
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
    case 'skip-unmanaged-existing':
      return 'skipped existing unmanaged file';
    case 'remove-deprecated':
      return 'removed deprecated Contextbook alias';
    case 'skip-deprecated-unmanaged':
      return 'kept unmanaged deprecated alias';
    case 'dry-run-create':
      return 'would create';
    case 'dry-run-update-with-backup':
      return 'would update with backup';
    case 'dry-run-remove-deprecated':
      return 'would remove deprecated Contextbook alias';
  }
}
