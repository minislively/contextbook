import { createHash } from 'node:crypto';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { backupManifestSafePath, projectPaths } from '../storage/project-store.js';
import { learnerBackupManifestSafePath, learnerBackupPaths } from '../storage/user-store.js';
import { writeJson } from '../storage/fs-utils.js';
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
  sha256?: string;
}

export interface MemoryBackupManifest {
  backupId: string;
  target: string;
  items: MemoryBackupItem[];
}

export interface MemoryBackupWrittenManifest {
  schemaVersion: 1;
  backupId: string;
  createdAt: string;
  scope: MemoryBackupScope;
  root: string;
  items: MemoryBackupItem[];
  summary: MemoryBackupSummary;
  safety: {
    rawContentInManifest: false;
    absolutePathsInManifest: false;
    containsLearnerMemory?: false;
    storedOutsideProject?: true;
  };
}

export interface MemoryBackupTargets {
  projectManifest: string;
  learnerManifest: string;
}

export interface MemoryBackupSummary {
  files: number;
  included: number;
  missing: number;
  inspectErrors: number;
  bytes: number;
}

export interface MemoryBackupSafety {
  dryRunOnly: boolean;
  readOnly: boolean;
  backupCreated: boolean;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  conversationMemoryMutated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
  learnerStoredOutsideProject: true;
}

export interface MemoryBackupHealth {
  validationIncluded: false;
  statusMeaning: 'backup-preview-only' | 'backup-created-only';
  recommendedCommand: 'contextbook memory validate --json';
}

export interface MemoryBackupResult {
  schemaVersion: 1;
  generatedAt: string;
  dryRun: boolean;
  status: MemoryBackupStatus;
  manifest: MemoryBackupManifest;
  targets: MemoryBackupTargets;
  summary: MemoryBackupSummary;
  health: MemoryBackupHealth;
  safety: MemoryBackupSafety;
}

interface BackupOptions {
  root?: string;
  learner?: string;
}

interface BackupPlanOptions extends BackupOptions {
  generatedAt?: string;
}

export async function planMemoryBackup(options: BackupPlanOptions = {}): Promise<MemoryBackupResult> {
  return buildMemoryBackupPlan({ ...options, dryRun: true, backupCreated: false });
}

export async function executeMemoryBackup(options: BackupOptions = {}): Promise<MemoryBackupResult> {
  const result = await buildMemoryBackupPlan({ ...options, dryRun: false, backupCreated: true });
  if (result.summary.inspectErrors > 0) {
    throw new Error('Cannot create memory backup while known memory files have inspect errors. Run `contextbook memory backup --dry-run --json` for details.');
  }
  await writeBackupFiles(result, options.root ?? process.cwd(), options.learner ?? 'default');
  return result;
}

export function formatMemoryBackupSummary(result: MemoryBackupResult): string {
  const title = result.dryRun ? '# Contextbook Memory Backup Dry Run' : '# Contextbook Memory Backup';
  const lines = [
    title,
    '',
    `status: ${result.status}`,
    `backup id: ${result.manifest.backupId}`,
    `project target: ${result.targets.projectManifest}`,
    `learner target: ${result.targets.learnerManifest}`,
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
    `- dry-run only: ${result.safety.dryRunOnly ? 'yes' : 'no'}`,
    `- read-only: ${result.safety.readOnly ? 'yes' : 'no'}`,
    `- backup created: ${result.safety.backupCreated ? 'yes' : 'no'}`,
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- conversation memory mutated: no',
    '- learner backup stored outside project: yes',
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}

async function buildMemoryBackupPlan(options: BackupPlanOptions & { dryRun: boolean; backupCreated: boolean }): Promise<MemoryBackupResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const backupId = backupIdFromTimestamp(generatedAt);
  const targets = knownMemoryFiles(root, learner);
  const items = await Promise.all(targets.map((target) => toBackupItem(target, learner, !options.dryRun)));
  const included = items.filter((item) => item.include).length;
  const missing = items.filter((item) => item.status === 'missing').length;
  const inspectErrors = items.filter((item) => item.status === 'inspect-error').length;
  const bytes = items.reduce((total, item) => total + (item.bytes ?? 0), 0);

  return {
    schemaVersion: 1,
    generatedAt,
    dryRun: options.dryRun,
    status: missing > 0 || inspectErrors > 0 ? 'warning' : 'ok',
    manifest: {
      backupId,
      target: backupManifestSafePath(backupId),
      items
    },
    targets: {
      projectManifest: backupManifestSafePath(backupId),
      learnerManifest: learnerBackupManifestSafePath(backupId)
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
      statusMeaning: options.dryRun ? 'backup-preview-only' : 'backup-created-only',
      recommendedCommand: 'contextbook memory validate --json'
    },
    safety: {
      dryRunOnly: options.dryRun,
      readOnly: options.dryRun,
      backupCreated: options.backupCreated,
      projectMemoryMutated: false,
      learnerMemoryMutated: false,
      conversationMemoryMutated: false,
      rawContentIncluded: false,
      absolutePathsIncluded: false,
      unsafeJudgmentIncluded: false,
      learnerStoredOutsideProject: true
    }
  };
}

async function toBackupItem(target: MemoryFileSpec, learner: string, includeHash: boolean): Promise<MemoryBackupItem> {
  try {
    const file = await stat(target.path);
    if (!file.isFile()) {
      return {
        key: target.key,
        scope: target.scope,
        file: target.safePath,
        backupPath: backupItemPath(target, learner),
        status: 'inspect-error',
        exists: false,
        include: false,
        reason: 'Known memory path exists but is not a regular file.'
      };
    }
    const item: MemoryBackupItem = {
      key: target.key,
      scope: target.scope,
      file: target.safePath,
      backupPath: backupItemPath(target, learner),
      status: 'included',
      exists: true,
      include: true,
      reason: target.backupReason,
      bytes: file.size,
      modifiedAt: file.mtime.toISOString()
    };
    if (includeHash) item.sha256 = await sha256File(target.path);
    return item;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT') {
      return {
        key: target.key,
        scope: target.scope,
        file: target.safePath,
        backupPath: backupItemPath(target, learner),
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
      backupPath: backupItemPath(target, learner),
      status: 'inspect-error',
      exists: false,
      include: false,
      reason: `Could not inspect known memory file metadata; backup preview cannot include this path safely. Error code: ${code}.`,
      inspectErrorCode: code
    };
  }
}

async function writeBackupFiles(result: MemoryBackupResult, root: string, learner: string): Promise<void> {
  const projectBackupRoot = `${projectPaths(root).backups}/${result.manifest.backupId}`;
  const learnerBackupRoot = learnerBackupPaths(result.manifest.backupId).base;
  await assertBackupTargetAvailable(projectBackupRoot);
  await assertBackupTargetAvailable(learnerBackupRoot);

  const specsByKey = new Map(knownMemoryFiles(root, learner).map((spec) => [spec.key, spec]));
  for (const item of result.manifest.items.filter((candidate) => candidate.include)) {
    const spec = specsByKey.get(item.key);
    if (!spec) throw new Error(`Unknown memory backup item: ${item.key}`);
    const destination = destinationForItem(item, root, result.manifest.backupId);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(spec.path, destination);
    const copiedHash = await sha256File(destination);
    if (item.sha256 && copiedHash !== item.sha256) throw new Error(`Backup checksum mismatch for ${item.file}`);
  }

  await writeScopedManifest(result, 'project', root);
  await writeScopedManifest(result, 'learner', root);
}

async function writeScopedManifest(result: MemoryBackupResult, scope: MemoryBackupScope, root: string): Promise<void> {
  const items = result.manifest.items.filter((item) => item.scope === scope && item.include);
  const included = items.length;
  const bytes = items.reduce((total, item) => total + (item.bytes ?? 0), 0);
  const manifest: MemoryBackupWrittenManifest = {
    schemaVersion: 1,
    backupId: result.manifest.backupId,
    createdAt: result.generatedAt,
    scope,
    root: scope === 'project' ? `.contextbook/backups/${result.manifest.backupId}` : `~/.contextbook/backups/${result.manifest.backupId}`,
    items,
    summary: {
      files: result.manifest.items.filter((item) => item.scope === scope).length,
      included,
      missing: result.manifest.items.filter((item) => item.scope === scope && item.status === 'missing').length,
      inspectErrors: result.manifest.items.filter((item) => item.scope === scope && item.status === 'inspect-error').length,
      bytes
    },
    safety: scope === 'project'
      ? { rawContentInManifest: false, absolutePathsInManifest: false, containsLearnerMemory: false }
      : { rawContentInManifest: false, absolutePathsInManifest: false, storedOutsideProject: true }
  };
  await writeJson(scope === 'project' ? projectPaths(root).backupManifest(result.manifest.backupId) : learnerBackupPaths(result.manifest.backupId).manifest, manifest);
}

async function assertBackupTargetAvailable(targetPath: string): Promise<void> {
  try {
    await stat(targetPath);
    throw new Error(`Backup target already exists: ${safeBackupRootForError(targetPath)}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Backup target already exists:')) throw error;
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

function destinationForItem(item: MemoryBackupItem, root: string, backupId: string): string {
  return item.scope === 'project'
    ? `${projectPaths(root).backups}/${backupId}/${item.backupPath}`
    : `${learnerBackupPaths(backupId).base}/${item.backupPath}`;
}

function backupItemPath(target: Pick<MemoryFileSpec, 'path' | 'scope'>, learner: string): string {
  return target.scope === 'project'
    ? `project/${basename(target.path)}`
    : `learners/${learner}/${basename(target.path)}`;
}

async function sha256File(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function safeBackupRootForError(path: string): string {
  return path.includes('/.contextbook/backups/') && !path.includes('/learners/') ? '<memory-backup-root>/<backupId>' : '<memory-backup-root>/<backupId>';
}

function backupIdFromTimestamp(timestamp: string): string {
  return `backup-${timestamp.replace(/[-:]/g, '').replace(/\./g, '')}`;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}
