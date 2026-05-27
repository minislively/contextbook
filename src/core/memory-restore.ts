import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, sep } from 'node:path';
import { backupManifestSafePath, projectPaths } from '../storage/project-store.js';
import { learnerBackupManifestSafePath, learnerBackupPaths, learnerPaths } from '../storage/user-store.js';
import { knownMemoryFiles, type MemoryFileKey, type MemoryFileScope } from './memory-files.js';
import { executeMemoryBackup, type MemoryBackupItem, type MemoryBackupWrittenManifest } from './memory-backup.js';

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
  dryRunOnly: boolean;
  readOnly: boolean;
  restoreApplied: boolean;
  preRestoreBackupCreated: boolean;
  projectMemoryMutated: boolean;
  learnerMemoryMutated: boolean;
  conversationMemoryMutated: boolean;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRestoreResult {
  schemaVersion: 1;
  generatedAt: string;
  backupId: string;
  dryRun: boolean;
  status: MemoryRestoreStatus;
  restoreApplied: boolean;
  preRestoreBackupId?: string;
  targets: {
    projectManifest: string;
    learnerManifest: string;
  };
  operations: MemoryRestoreOperation[];
  summary: MemoryRestoreSummary;
  applied?: {
    written: number;
    skipped: number;
    blocked: number;
  };
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
    restoreApplied: false,
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
    safety: restoreSafety({ dryRunOnly: true, readOnly: true, restoreApplied: false, preRestoreBackupCreated: false, projectMemoryMutated: false, learnerMemoryMutated: false, conversationMemoryMutated: false })
  };
}

export async function executeMemoryRestore(options: RestoreOptions): Promise<MemoryRestoreResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const plan = await planMemoryRestore({ backupId: options.backupId, root, learner });
  if (plan.status === 'blocked') {
    throw new Error('Cannot apply memory restore while the restore plan is blocked. Run `contextbook memory restore --backup-id <id> --dry-run --json` for details.');
  }
  if (plan.summary.missingManifests > 0) {
    throw new Error('Cannot apply memory restore while a split backup manifest is missing. Run `contextbook memory restore --backup-id <id> --dry-run --json` for details.');
  }

  const preRestoreBackup = await createPreRestoreBackup(root, learner);
  const specs = new Map(knownMemoryFiles(root, learner).map((spec) => [spec.key, spec]));
  let written = 0;

  for (const operation of plan.operations) {
    if (operation.operation !== 'restore-file') continue;
    const spec = specs.get(operation.key as MemoryFileKey);
    if (!spec) {
      throw new Error('Cannot apply memory restore because the restore plan contains an unknown memory file.');
    }
    try {
      await mkdir(dirname(spec.path), { recursive: true });
      await applyRestoreFile(operation, spec.path, root, learner, options.backupId);
    } catch (error) {
      throw new Error(`Cannot apply memory restore for ${operation.destination}. Error code: ${errorCode(error)}.`);
    }
    written += 1;
  }

  const skipped = plan.operations.filter((operation) => operation.operation === 'skip-identical').length;
  const blocked = plan.operations.filter((operation) => operation.operation === 'blocked').length;

  return {
    ...plan,
    generatedAt: new Date().toISOString(),
    dryRun: false,
    restoreApplied: true,
    preRestoreBackupId: preRestoreBackup.manifest.backupId,
    applied: {
      written,
      skipped,
      blocked
    },
    safety: restoreSafety({
      dryRunOnly: false,
      readOnly: false,
      restoreApplied: true,
      preRestoreBackupCreated: true,
      projectMemoryMutated: plan.operations.some((operation) => operation.operation === 'restore-file' && operation.scope === 'project'),
      learnerMemoryMutated: plan.operations.some((operation) => operation.operation === 'restore-file' && operation.scope === 'learner'),
      conversationMemoryMutated: plan.operations.some((operation) => operation.operation === 'restore-file' && operation.scope === 'learner' && ['learner.signals', 'learner.answers', 'learner.profileUpdates'].includes(operation.key))
    })
  };
}

async function createPreRestoreBackup(root: string, learner: string) {
  try {
    return await executeMemoryBackup({ root, learner });
  } catch (error) {
    throw new Error(`Cannot create pre-restore backup safely. Error code: ${errorCode(error)}.`);
  }
}

function blockedRestoreResult(input: { generatedAt: string; backupId: string; reason: string; code: string }): MemoryRestoreResult {
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    backupId: input.backupId,
    dryRun: true,
    status: 'blocked',
    restoreApplied: false,
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
    safety: restoreSafety({ dryRunOnly: true, readOnly: true, restoreApplied: false, preRestoreBackupCreated: false, projectMemoryMutated: false, learnerMemoryMutated: false, conversationMemoryMutated: false })
  };
}

function restoreSafety(input: { dryRunOnly: boolean; readOnly: boolean; restoreApplied: boolean; preRestoreBackupCreated: boolean; projectMemoryMutated: boolean; learnerMemoryMutated: boolean; conversationMemoryMutated: boolean }): MemoryRestoreSafety {
  return {
    dryRunOnly: input.dryRunOnly,
    readOnly: input.readOnly,
    restoreApplied: input.restoreApplied,
    preRestoreBackupCreated: input.preRestoreBackupCreated,
    projectMemoryMutated: input.projectMemoryMutated,
    learnerMemoryMutated: input.learnerMemoryMutated,
    conversationMemoryMutated: input.conversationMemoryMutated,
    rawContentIncluded: false,
    absolutePathsIncluded: false,
    unsafeJudgmentIncluded: false
  };
}

export function formatMemoryRestoreSummary(result: MemoryRestoreResult): string {
  const title = result.dryRun ? '# Contextbook Memory Restore Dry Run' : '# Contextbook Memory Restore';
  const lines = [
    title,
    '',
    `status: ${result.status}`,
    `backup id: ${result.backupId}`,
    ...(result.preRestoreBackupId ? [`pre-restore backup id: ${result.preRestoreBackupId}`] : []),
    `project manifest: ${result.targets.projectManifest}`,
    `learner manifest: ${result.targets.learnerManifest}`,
    `operations: ${result.summary.operations} total, ${result.summary.wouldWrite} would write, ${result.summary.identical} identical, ${result.summary.blocked} blocked`,
    ...(result.applied ? [`applied: ${result.applied.written} written, ${result.applied.skipped} skipped, ${result.applied.blocked} blocked`] : []),
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
    `- dry-run only: ${result.safety.dryRunOnly ? 'yes' : 'no'}`,
    `- read-only: ${result.safety.readOnly ? 'yes' : 'no'}`,
    `- restore applied: ${result.safety.restoreApplied ? 'yes' : 'no'}`,
    `- pre-restore backup created: ${result.safety.preRestoreBackupCreated ? 'yes' : 'no'}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated ? 'yes' : 'no'}`,
    `- learner memory mutated: ${result.safety.learnerMemoryMutated ? 'yes' : 'no'}`,
    `- conversation memory mutated: ${result.safety.conversationMemoryMutated ? 'yes' : 'no'}`,
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
  const backupRoot = backupRootForScope(input.item.scope, input.root, input.backupId);
  if (!input.item.sha256) {
    return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, 'Backup manifest item is missing sha256.', 'missing-backup-hash');
  }
  try {
    const backupHash = await sha256FileInside(backupPath, backupRoot);
    if (backupHash !== input.item.sha256) {
      return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, 'Backup file checksum does not match manifest.', 'backup-checksum-mismatch');
    }
  } catch (error) {
    const code = errorCode(error);
    return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, `Could not verify backup file. Error code: ${code}.`, code === 'ENOENT' ? 'missing-backup-file' : code.startsWith('UNSAFE_BACKUP_') ? 'unsafe-backup-file' : 'backup-inspect-error');
  }

  try {
    const destination = await lstat(input.destinationPath);
    if (destination.isSymbolicLink()) {
      return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, 'Current destination is a symbolic link and cannot be restored safely.', 'unsafe-destination-path');
    }
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
    const currentHash = await sha256FileInside(input.destinationPath, memoryRootForScope(input.item.scope, input.root, input.learner));
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
    const code = errorCode(error);
    return blockedOperation(input.item.scope, input.item.key, input.destinationSafePath, input.item.backupPath, `Could not inspect current destination safely. Error code: ${code}.`, code.startsWith('UNSAFE_DESTINATION_') ? 'unsafe-destination-path' : 'destination-inspect-error');
  }
}

async function applyRestoreFile(operation: MemoryRestoreOperation, destinationPath: string, root: string, learner: string, backupId: string): Promise<void> {
  const backupPath = backupFilePathFromOperation(operation, root, backupId);
  await assertRegularFileInside(backupPath, backupRootForScope(operation.scope, root, backupId), 'backup');
  await assertDestinationInside(destinationPath, memoryRootForScope(operation.scope, root, learner), { allowMissing: true });
  const tempPath = `${destinationPath}.contextbook-restore-${randomUUID()}.tmp`;
  try {
    await copyFile(backupPath, tempPath);
    await assertRegularFileInside(tempPath, dirname(destinationPath), 'destination');
    await rename(tempPath, destinationPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function backupFilePath(item: MemoryBackupItem, root: string, backupId: string): string {
  return item.scope === 'project'
    ? `${projectPaths(root).backups}/${backupId}/${item.backupPath}`
    : `${learnerBackupPaths(backupId).base}/${item.backupPath}`;
}

function backupFilePathFromOperation(operation: MemoryRestoreOperation, root: string, backupId: string): string {
  return operation.scope === 'project'
    ? `${projectPaths(root).backups}/${backupId}/${operation.backupPath}`
    : `${learnerBackupPaths(backupId).base}/${operation.backupPath}`;
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

async function sha256FileInside(path: string, root: string): Promise<string> {
  await assertRegularFileInside(path, root, 'backup');
  return sha256File(path);
}

async function assertRegularFileInside(path: string, root: string, type: 'backup' | 'destination'): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw restoreSafetyError(type === 'backup' ? 'UNSAFE_BACKUP_SYMLINK' : 'UNSAFE_DESTINATION_SYMLINK');
  if (!info.isFile()) throw restoreSafetyError(type === 'backup' ? 'UNSAFE_BACKUP_FILE' : 'UNSAFE_DESTINATION_FILE');
  await assertRealPathInside(path, root, type === 'backup' ? 'UNSAFE_BACKUP_PATH' : 'UNSAFE_DESTINATION_PATH');
}

async function assertDestinationInside(path: string, root: string, options: { allowMissing: boolean }): Promise<void> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw restoreSafetyError('UNSAFE_DESTINATION_SYMLINK');
    if (info.isFile()) {
      await assertRealPathInside(path, root, 'UNSAFE_DESTINATION_PATH');
      return;
    }
    throw restoreSafetyError('UNSAFE_DESTINATION_FILE');
  } catch (error) {
    if (options.allowMissing && errorCode(error) === 'ENOENT') {
      await assertRealPathInside(dirname(path), root, 'UNSAFE_DESTINATION_PATH');
      return;
    }
    throw error;
  }
}

async function assertRealPathInside(path: string, root: string, code: string): Promise<void> {
  const [resolvedPath, resolvedRoot] = await Promise.all([realpath(path), realpath(root)]);
  if (!isPathInside(resolvedPath, resolvedRoot)) throw restoreSafetyError(code);
}

function isPathInside(path: string, root: string): boolean {
  const candidate = relative(root, path);
  return candidate === '' || Boolean(candidate && !candidate.startsWith('..') && !candidate.includes(`..${sep}`) && !isAbsolute(candidate));
}

function backupRootForScope(scope: MemoryFileScope, root: string, backupId: string): string {
  return scope === 'project' ? `${projectPaths(root).backups}/${backupId}` : learnerBackupPaths(backupId).base;
}

function memoryRootForScope(scope: MemoryFileScope, root: string, learner: string): string {
  return scope === 'project' ? projectPaths(root).project : learnerPaths(learner).base;
}

function restoreSafetyError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}
