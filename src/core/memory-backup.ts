import { stat } from 'node:fs/promises';
import { backupManifestSafePath } from '../storage/project-store.js';
import { knownMemoryFiles, type MemoryFileKey, type MemoryFileScope, type MemoryFileSpec } from './memory-files.js';

export type MemoryBackupStatus = 'ok' | 'warning';
export type MemoryBackupScope = MemoryFileScope;

export type MemoryBackupItemStatus = 'included' | 'missing' | 'inspect-error';

export interface MemoryBackupItem {
  key: MemoryFileKey;
  scope: MemoryBackupScope;
  file: string;
  backupPath: string;
  status: MemoryBackupItemStatus;
  exists: boolean;
  include: boolean;
  reason: string;
  inspectErrorCode?: string;
  bytes?: number;
  modifiedAt?: string;
}

export interface MemoryBackupManifest {
  backupId: string;
  target: string;
  items: MemoryBackupItem[];
}

export interface MemoryBackupSummary {
  files: number;
  included: number;
  missing: number;
  inspectErrors: number;
  bytes: number;
}

export interface MemoryBackupSafety {
  dryRunOnly: true;
  readOnly: true;
  backupCreated: false;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  conversationMemoryMutated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryBackupHealth {
  validationIncluded: false;
  statusMeaning: 'backup-preview-only';
  recommendedCommand: 'contextbook memory validate --json';
}

export interface MemoryBackupResult {
  schemaVersion: 1;
  generatedAt: string;
  dryRun: true;
  status: MemoryBackupStatus;
  manifest: MemoryBackupManifest;
  summary: MemoryBackupSummary;
  health: MemoryBackupHealth;
  safety: MemoryBackupSafety;
}

interface BackupOptions {
  root?: string;
  learner?: string;
}

export async function planMemoryBackup(options: BackupOptions = {}): Promise<MemoryBackupResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const generatedAt = new Date().toISOString();
  const backupId = backupIdFromTimestamp(generatedAt);
  const targets = knownMemoryFiles(root, learner);
  const items = await Promise.all(targets.map(toBackupItem));
  const included = items.filter((item) => item.include).length;
  const missing = items.filter((item) => item.status === 'missing').length;
  const inspectErrors = items.filter((item) => item.status === 'inspect-error').length;
  const bytes = items.reduce((total, item) => total + (item.bytes ?? 0), 0);

  return {
    schemaVersion: 1,
    generatedAt,
    dryRun: true,
    status: missing > 0 || inspectErrors > 0 ? 'warning' : 'ok',
    manifest: {
      backupId,
      target: backupManifestSafePath(backupId),
      items
    },
    summary: {
      files: items.length,
      included,
      missing,
      inspectErrors,
      bytes
    },
    health: {
      validationIncluded: false,
      statusMeaning: 'backup-preview-only',
      recommendedCommand: 'contextbook memory validate --json'
    },
    safety: {
      dryRunOnly: true,
      readOnly: true,
      backupCreated: false,
      projectMemoryMutated: false,
      learnerMemoryMutated: false,
      conversationMemoryMutated: false,
      rawContentIncluded: false,
      absolutePathsIncluded: false,
      unsafeJudgmentIncluded: false
    }
  };
}

export function formatMemoryBackupSummary(result: MemoryBackupResult): string {
  const lines = [
    '# Contextbook Memory Backup Dry Run',
    '',
    `status: ${result.status}`,
    `backup id: ${result.manifest.backupId}`,
    `target: ${result.manifest.target}`,
    `files: ${result.summary.files} total, ${result.summary.included} included, ${result.summary.missing} missing, ${result.summary.inspectErrors} inspect errors`,
    `bytes: ${result.summary.bytes}`,
    `health validation: not included — run \`${result.health.recommendedCommand}\``,
    '',
    '## Manifest Items'
  ];

  for (const item of result.manifest.items) {
    const status = item.status === 'included' ? 'include' : item.status;
    const size = item.bytes === undefined ? '' : ` (${item.bytes} bytes)`;
    lines.push(`- ${status}: ${item.file}${size} — ${item.reason}`);
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- dry-run only: yes',
    '- read-only: yes',
    '- backup created: no',
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- conversation memory mutated: no',
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}

async function toBackupItem(target: MemoryFileSpec): Promise<MemoryBackupItem> {
  try {
    const file = await stat(target.path);
    if (!file.isFile()) {
      return {
        key: target.key,
        scope: target.scope,
        file: target.safePath,
        backupPath: backupItemPath(target.key),
        status: 'inspect-error',
        exists: false,
        include: false,
        reason: 'Known memory path exists but is not a regular file.'
      };
    }
    return {
      key: target.key,
      scope: target.scope,
      file: target.safePath,
      backupPath: backupItemPath(target.key),
      status: 'included',
      exists: true,
      include: true,
      reason: target.backupReason,
      bytes: file.size,
      modifiedAt: file.mtime.toISOString()
    };
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT') {
      return {
        key: target.key,
        scope: target.scope,
        file: target.safePath,
        backupPath: backupItemPath(target.key),
        status: 'missing',
        exists: false,
        include: false,
        reason: 'Known memory file is missing; nothing would be backed up for this path.'
      };
    }
    return {
      key: target.key,
      scope: target.scope,
      file: target.safePath,
      backupPath: backupItemPath(target.key),
      status: 'inspect-error',
      exists: false,
      include: false,
      reason: `Could not inspect known memory file metadata; backup preview cannot include this path safely. Error code: ${code}.`,
      inspectErrorCode: code
    };
  }
}

function backupItemPath(key: MemoryFileKey): string {
  return `${key.replace(/\./g, '/')}`;
}

function backupIdFromTimestamp(timestamp: string): string {
  return `backup-${timestamp.replace(/[-:]/g, '').replace(/\./g, '')}`;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}
