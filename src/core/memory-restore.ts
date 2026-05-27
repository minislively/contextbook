import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { backupManifestSafePath, projectPaths } from '../storage/project-store.js';
import { learnerBackupManifestSafePath, learnerBackupPaths } from '../storage/user-store.js';
import { knownMemoryFiles, type MemoryFileKey, type MemoryFileScope } from './memory-files.js';
import type { MemoryBackupItem, MemoryBackupWrittenManifest } from './memory-backup.js';

export type MemoryRestoreStatus = 'ok' | 'warning' | 'blocked';
export type MemoryRestoreOperationKind = 'skip-identical' | 'restore-file' | 'blocked';

export interface MemoryRestoreOperation {
  operation: MemoryRestoreOperationKind;
  scope: MemoryFileScope;
  key: string;
  destination: string;
  backupPath: string;
  wouldWrite: boolean;
  reason: string;
  code?: string;
}

export interface MemoryRestoreSummary {
  operations: number;
  wouldWrite: number;
  identical: number;
  blocked: number;
  missingManifests: number;
}

export interface MemoryRestoreSafety {
  dryRunOnly: true;
  readOnly: true;
  restoreApplied: false;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  conversationMemoryMutated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRestoreResult {
  schemaVersion: 1;
  generatedAt: string;
  backupId: string;
  dryRun: true;
  status: MemoryRestoreStatus;
  targets: {
    projectManifest: string;
    learnerManifest: string;
  };
  operations: MemoryRestoreOperation[];
  summary: MemoryRestoreSummary;
  safety: MemoryRestoreSafety;
}

interface RestoreOptions {
  backupId: string;
  root?: string;
  learner?: string;
}

type ManifestReadResult =
  | { state: 'present'; manifest: MemoryBackupWrittenManifest }
  | { state: 'missing'; scope: MemoryFileScope }
  | { state: 'blocked'; scope: MemoryFileScope; reason: string; code: string };

export async function planMemoryRestore(options: RestoreOptions): Promise<MemoryRestoreResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const generatedAt = new Date().toISOString();
  if (!isSafeBackupId(options.backupId)) {
    return blockedRestoreResult({
      generatedAt,
      backupId: '<invalid-backup-id>',
      reason: 'Backup id must be a single Contextbook-generated backup id segment.',
      code: 'invalid-backup-id'
    });
  }
  const projectManifestPath = projectPaths(root).backupManifest(options.backupId);
  const learnerManifestPath = learnerBackupPaths(options.backupId).manifest;
  const manifests = await Promise.all([
    readManifest(projectManifestPath, 'project'),
    readManifest(learnerManifestPath, 'learner')
  ]);
  const operations: MemoryRestoreOperation[] = [];
  const missingManifests = manifests.filter((manifest) => manifest.state === 'missing').length;
  const specs = new Map(knownMemoryFiles(root, learner).map((spec) => [spec.key, spec]));
  const knownKeys = new Set(specs.keys());

  for (const manifest of manifests) {
    if (manifest.state === 'missing') continue;
    if (manifest.state === 'blocked') {
      operations.push(blockedOperation(manifest.scope, manifest.scope === 'project' ? 'project.config' : 'learner.profile', manifest.scope === 'project' ? '.contextbook/project/config.json' : `~/.contextbook/learners/${learner}/profile.md`, '', manifest.reason, manifest.code));
      continue;
    }
    for (const rawItem of manifest.manifest.items as unknown[]) {
      const parsedItem = parseManifestItem(rawItem, manifest.manifest.scope, knownKeys);
      if (parsedItem.state === 'invalid') {
        operations.push(blockedOperation(manifest.manifest.scope, '<unknown-memory-key>', safeUnknownDestination(manifest.manifest.scope, learner), parsedItem.backupPath, parsedItem.reason, parsedItem.code));
        continue;
      }
      const item = parsedItem.item;
      const spec = specs.get(item.key);
      if (!spec || spec.scope !== manifest.manifest.scope || item.scope !== manifest.manifest.scope) {
        operations.push(blockedOperation(manifest.manifest.scope, '<unknown-memory-key>', safeUnknownDestination(manifest.manifest.scope, learner), safeBackupPathForOutput(item.backupPath), 'Manifest item does not match the known memory inventory for this scope.', 'unsafe-manifest-item'));
        continue;
      }
      if (!isSafeBackupPath(item, learner)) {
        operations.push(blockedOperation(spec.scope, item.key, spec.safePath, safeBackupPathForOutput(item.backupPath), 'Manifest item backup path is outside the expected scoped backup directory.', 'unsafe-backup-path'));
        continue;
      }
      const expectedBackupPath = backupItemPathForSpec(spec, learner);
      if (item.backupPath !== expectedBackupPath) {
        operations.push(blockedOperation(spec.scope, item.key, spec.safePath, safeBackupPathForOutput(item.backupPath), 'Manifest item backup path does not match the canonical path for this memory file.', 'backup-path-mismatch'));
        continue;
      }
      operations.push(await planRestoreItem({ item, root, learner, backupId: options.backupId, destinationPath: spec.path, destinationSafePath: spec.safePath }));
    }
  }

  if (manifests.every((manifest) => manifest.state === 'missing')) {
    operations.push(blockedOperation('project', 'project.config', '.contextbook/project/config.json', '', 'No backup manifest was found for this backup id.', 'missing-manifest'));
  }

  const blocked = operations.filter((operation) => operation.operation === 'blocked').length;
  const wouldWrite = operations.filter((operation) => operation.wouldWrite).length;
  const identical = operations.filter((operation) => operation.operation === 'skip-identical').length;

  return {
    schemaVersion: 1,
    generatedAt,
    backupId: options.backupId,
    dryRun: true,
    status: blocked > 0 ? 'blocked' : wouldWrite > 0 || missingManifests > 0 ? 'warning' : 'ok',
    targets: {
      projectManifest: backupManifestSafePath(options.backupId),
      learnerManifest: learnerBackupManifestSafePath(options.backupId)
    },
    operations,
    summary: {
      operations: operations.length,
      wouldWrite,
      identical,
      blocked,
      missingManifests
    },
    safety: restoreSafety()
  };
}

function blockedRestoreResult(input: { generatedAt: string; backupId: string; reason: string; code: string }): MemoryRestoreResult {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    backupId: input.backupId,
    dryRun: true,
    status: 'blocked',
    targets: {
      projectManifest: '.contextbook/backups/<backupId>/manifest.json',
      learnerManifest: '~/.contextbook/backups/<backupId>/manifest.json'
    },
    operations: [blockedOperation('project', input.backupId, '.contextbook/backups/<backupId>/manifest.json', '', input.reason, input.code)],
    summary: {
      operations: 1,
      wouldWrite: 0,
      identical: 0,
      blocked: 1,
      missingManifests: 0
    },
    safety: restoreSafety()
  };
}

function restoreSafety(): MemoryRestoreSafety {
  return {
    dryRunOnly: true,
    readOnly: true,
    restoreApplied: false,
    projectMemoryMutated: false,
    learnerMemoryMutated: false,
    conversationMemoryMutated: false,
    rawContentIncluded: false,
    absolutePathsIncluded: false,
    unsafeJudgmentIncluded: false
  };
}

export function formatMemoryRestoreSummary(result: MemoryRestoreResult): string {
  const lines = [
    '# Contextbook Memory Restore Dry Run',
    '',
    `status: ${result.status}`,
    `backup id: ${result.backupId}`,
    `project manifest: ${result.targets.projectManifest}`,
    `learner manifest: ${result.targets.learnerManifest}`,
    `operations: ${result.summary.operations} total, ${result.summary.wouldWrite} would write, ${result.summary.identical} identical, ${result.summary.blocked} blocked`,
    '',
    '## Operations'
  ];

  for (const operation of result.operations) {
    lines.push(`- ${operation.operation}: ${operation.destination} — ${operation.reason}`);
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- dry-run only: yes',
    '- read-only: yes',
    '- restore applied: no',
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- conversation memory mutated: no',
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}

async function readManifest(path: string, scope: MemoryFileScope): Promise<ManifestReadResult> {
  try {
    const raw = await readFile(path, 'utf8');
    const manifest = JSON.parse(raw) as MemoryBackupWrittenManifest;
    if (manifest.schemaVersion !== 1 || manifest.scope !== scope || !Array.isArray(manifest.items)) {
      return { state: 'blocked', scope, reason: 'Backup manifest shape is invalid for this scope.', code: 'invalid-manifest' };
    }
    return { state: 'present', manifest };
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { state: 'missing', scope };
    return { state: 'blocked', scope, reason: `Could not read backup manifest safely. Error code: ${errorCode(error)}.`, code: 'manifest-read-error' };
  }
}

async function planRestoreItem(input: { item: MemoryBackupItem; root: string; learner: string; backupId: string; destinationPath: string; destinationSafePath: string }): Promise<MemoryRestoreOperation> {
  const backupPath = backupFilePath(input.item, input.root, input.backupId);
  if (!input.item.sha256) {
    return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, 'Backup manifest item is missing sha256.', 'missing-backup-hash');
  }
  try {
    const backupHash = await sha256File(backupPath);
    if (backupHash !== input.item.sha256) {
      return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, 'Backup file checksum does not match manifest.', 'backup-checksum-mismatch');
    }
  } catch (error) {
    return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, `Could not verify backup file. Error code: ${errorCode(error)}.`, errorCode(error) === 'ENOENT' ? 'missing-backup-file' : 'backup-inspect-error');
  }

  try {
    const destination = await stat(input.destinationPath);
    if (!destination.isFile()) {
      return {
        operation: 'restore-file',
        scope: input.item.scope,
        key: input.item.key,
        destination: input.destinationSafePath,
        backupPath: input.item.backupPath,
        wouldWrite: true,
        reason: 'Current destination is not a regular file and would be replaced.'
      };
    }
    const currentHash = await sha256File(input.destinationPath);
    if (currentHash === input.item.sha256) {
      return {
        operation: 'skip-identical',
        scope: input.item.scope,
        key: input.item.key,
        destination: input.destinationSafePath,
        backupPath: input.item.backupPath,
        wouldWrite: false,
        reason: 'Current file already matches backup checksum.'
      };
    }
    return {
      operation: 'restore-file',
      scope: input.item.scope,
      key: input.item.key,
      destination: input.destinationSafePath,
      backupPath: input.item.backupPath,
      wouldWrite: true,
      reason: 'Current file differs from backup checksum.'
    };
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return {
        operation: 'restore-file',
        scope: input.item.scope,
        key: input.item.key,
        destination: input.destinationSafePath,
        backupPath: input.item.backupPath,
        wouldWrite: true,
        reason: 'Current file is missing and would be restored.'
      };
    }
    return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, `Could not inspect current destination safely. Error code: ${errorCode(error)}.`, 'destination-inspect-error');
  }
}

function backupFilePath(item: MemoryBackupItem, root: string, backupId: string): string {
  return item.scope === 'project'
    ? `${projectPaths(root).backups}/${backupId}/${item.backupPath}`
    : `${learnerBackupPaths(backupId).base}/${item.backupPath}`;
}

function parseManifestItem(rawItem: unknown, manifestScope: MemoryFileScope, knownKeys: Set<MemoryFileKey>): { state: 'valid'; item: MemoryBackupItem } | { state: 'invalid'; backupPath: string; reason: string; code: string } {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
    return invalidManifestItem('', 'Backup manifest item is not an object.', 'invalid-manifest-item');
  }
  const record = rawItem as Record<string, unknown>;
  const safeBackupPath = typeof record.backupPath === 'string' ? safeBackupPathForOutput(record.backupPath) : '<unsafe-backup-path>';
  if (typeof record.key !== 'string' || !knownKeys.has(record.key as MemoryFileKey)) {
    return invalidManifestItem(safeBackupPath, 'Backup manifest item key is not a known memory file.', 'unsafe-manifest-item');
  }
  if (record.scope !== manifestScope) {
    return invalidManifestItem(safeBackupPath, 'Backup manifest item scope does not match its manifest scope.', 'unsafe-manifest-item');
  }
  if (typeof record.backupPath !== 'string') {
    return invalidManifestItem('<unsafe-backup-path>', 'Backup manifest item backup path is missing or invalid.', 'unsafe-backup-path');
  }
  if (record.sha256 !== undefined && typeof record.sha256 !== 'string') {
    return invalidManifestItem(safeBackupPath, 'Backup manifest item sha256 is invalid.', 'invalid-manifest-item');
  }
  return {
    state: 'valid',
    item: {
      key: record.key as MemoryFileKey,
      scope: manifestScope,
      file: typeof record.file === 'string' ? record.file : '',
      backupPath: record.backupPath,
      status: record.status === 'missing' || record.status === 'inspect-error' ? record.status : 'included',
      exists: typeof record.exists === 'boolean' ? record.exists : true,
      include: typeof record.include === 'boolean' ? record.include : true,
      reason: typeof record.reason === 'string' ? record.reason : '',
      inspectErrorCode: typeof record.inspectErrorCode === 'string' ? record.inspectErrorCode : undefined,
      bytes: typeof record.bytes === 'number' ? record.bytes : undefined,
      modifiedAt: typeof record.modifiedAt === 'string' ? record.modifiedAt : undefined,
      sha256: typeof record.sha256 === 'string' ? record.sha256 : undefined
    }
  };
}

function invalidManifestItem(backupPath: string, reason: string, code: string): { state: 'invalid'; backupPath: string; reason: string; code: string } {
  return { state: 'invalid', backupPath, reason, code };
}

function isSafeBackupPath(item: MemoryBackupItem, learner: string): boolean {
  if (item.backupPath.includes('..') || item.backupPath.startsWith('/') || item.backupPath.startsWith('~')) return false;
  return item.scope === 'project'
    ? item.backupPath.startsWith('project/')
    : item.backupPath.startsWith(`learners/${learner}/`);
}

function backupItemPathForSpec(spec: { path: string; scope: MemoryFileScope }, learner: string): string {
  return spec.scope === 'project'
    ? `project/${basename(spec.path)}`
    : `learners/${learner}/${basename(spec.path)}`;
}

function isSafeBackupId(backupId: string): boolean {
  return /^backup-[0-9]{8}T[0-9]{9}Z$/.test(backupId);
}

function safeBackupPathForOutput(path: string): string {
  return path.includes('..') || path.startsWith('/') || path.startsWith('~') ? '<unsafe-backup-path>' : path;
}

function safeUnknownDestination(scope: MemoryFileScope, learner: string): string {
  return scope === 'project' ? '.contextbook/project/<unknown>' : `~/.contextbook/learners/${learner}/<unknown>`;
}

function blockedOperation(scope: MemoryFileScope, key: string, destination: string, backupPath: string, reason: string, code: string): MemoryRestoreOperation {
  return { operation: 'blocked', scope, key, destination, backupPath, wouldWrite: false, reason, code };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}
