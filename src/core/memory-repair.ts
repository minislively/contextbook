import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { defaultFileIndex } from '../storage/project-store.js';
import { defaultPreferences, defaultProfile } from '../storage/user-store.js';
import { executeMemoryBackup } from './memory-backup.js';
import { knownMemoryFiles, type MemoryFileKey, type MemoryFileScope } from './memory-files.js';
import { validateMemory, type MemoryValidateIssue, type MemoryValidateResult } from './memory-validate.js';

export type MemoryRepairStatus = 'ok' | 'warning' | 'blocked';
export type MemoryRepairOperationKind = 'create-default' | 'rerun-scan' | 'skip-manual-review' | 'noop';

export interface MemoryRepairOperation {
  id: string;
  scope: MemoryValidateIssue['scope'];
  file: string;
  issueCode: MemoryValidateIssue['code'];
  operation: MemoryRepairOperationKind;
  supported: boolean;
  destructive: false;
  wouldWrite: boolean;
  message: string;
  line?: number;
  recommendedCommand?: string;
}

export interface MemoryRepairSummary {
  operations: number;
  supported: number;
  blocked: number;
  wouldWrite: number;
}

export interface MemoryRepairSafety {
  dryRunOnly: boolean;
  readOnly: boolean;
  repairApplied: boolean;
  preRepairBackupCreated: boolean;
  projectMemoryMutated: boolean;
  learnerMemoryMutated: boolean;
  backupCreated: boolean;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRepairResult {
  schemaVersion: 1;
  generatedAt: string;
  dryRun: boolean;
  status: MemoryRepairStatus;
  validationStatus: MemoryValidateResult['status'];
  postValidationStatus?: MemoryValidateResult['status'];
  repairApplied: boolean;
  preRepairBackupId?: string;
  operations: MemoryRepairOperation[];
  summary: MemoryRepairSummary;
  applied?: {
    written: number;
    skipped: number;
    blocked: number;
  };
  safety: MemoryRepairSafety;
}

interface RepairOptions {
  root?: string;
  learner?: string;
}

export async function planMemoryRepair(options: RepairOptions = {}): Promise<MemoryRepairResult> {
  const validation = await validateMemory(options);
  const operations = validation.issues.map(toRepairOperation);
  const blocked = operations.filter((operation) => !operation.supported).length;
  const supported = operations.filter((operation) => operation.supported).length;
  const wouldWrite = operations.filter((operation) => operation.wouldWrite).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    status: blocked > 0 ? 'blocked' : wouldWrite > 0 ? 'warning' : 'ok',
    validationStatus: validation.status,
    repairApplied: false,
    operations,
    summary: {
      operations: operations.length,
      supported,
      blocked,
      wouldWrite
    },
    safety: repairSafety({ dryRunOnly: true, readOnly: true, repairApplied: false, preRepairBackupCreated: false, projectMemoryMutated: false, learnerMemoryMutated: false, backupCreated: false })
  };
}

export function formatMemoryRepairSummary(result: MemoryRepairResult): string {
  const title = result.dryRun ? '# Contextbook Memory Repair Dry Run' : '# Contextbook Memory Repair';
  const lines = [
    title,
    '',
    `status: ${result.status}`,
    `validation status: ${result.validationStatus}`,
    ...(result.postValidationStatus ? [`post-validation status: ${result.postValidationStatus}`] : []),
    ...(result.preRepairBackupId ? [`pre-repair backup id: ${result.preRepairBackupId}`] : []),
    `operations: ${result.summary.operations} total, ${result.summary.supported} supported, ${result.summary.blocked} blocked`,
    ...(result.applied ? [`applied: ${result.applied.written} written, ${result.applied.skipped} skipped, ${result.applied.blocked} blocked`] : []),
    '',
    '## Planned Operations'
  ];

  if (result.operations.length === 0) {
    lines.push('', '- none');
  } else {
    lines.push('');
    for (const operation of result.operations) {
      const line = operation.line ? ` line ${operation.line}` : '';
      const support = operation.supported ? 'supported' : 'blocked';
      const action = operation.recommendedCommand ? ` — next: \`${operation.recommendedCommand}\`` : '';
      lines.push(`- ${support}: ${operation.file}${line} (${operation.operation}) — ${operation.message}${action}`);
    }
  }

  lines.push(
    '',
    '## Safety',
    '',
    `- dry-run only: ${result.safety.dryRunOnly ? 'yes' : 'no'}`,
    `- read-only: ${result.safety.readOnly ? 'yes' : 'no'}`,
    `- repair applied: ${result.safety.repairApplied ? 'yes' : 'no'}`,
    `- pre-repair backup created: ${result.safety.preRepairBackupCreated ? 'yes' : 'no'}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated ? 'yes' : 'no'}`,
    `- learner memory mutated: ${result.safety.learnerMemoryMutated ? 'yes' : 'no'}`,
    `- backup created: ${result.safety.backupCreated ? 'yes' : 'no'}`,
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}

export async function executeMemoryRepair(options: RepairOptions = {}): Promise<MemoryRepairResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const plan = await planMemoryRepair({ root, learner });
  if (plan.status === 'blocked') {
    throw new Error('Cannot apply memory repair while the repair plan is blocked. Run `contextbook memory repair --dry-run --json` for details.');
  }
  const writes = plan.operations.filter((operation) => operation.supported && operation.wouldWrite);
  let preRepairBackupId: string | undefined;
  let written = 0;
  if (writes.length > 0) {
    try {
      const backup = await executeMemoryBackup({ root, learner });
      preRepairBackupId = backup.manifest.backupId;
    } catch (error) {
      throw new Error(`Cannot create pre-repair backup safely. Error code: ${errorCode(error)}.`);
    }
    const specs = new Map(knownMemoryFiles(root, learner).map((spec) => [spec.safePath, spec]));
    for (const operation of writes) {
      const spec = specs.get(operation.file);
      if (!spec) throw new Error('Cannot apply memory repair because the repair plan contains an unknown memory file.');
      try {
        if (await writeDefaultIfMissing(spec.path, repairRootFor(spec.scope, root, learner), defaultContentFor(spec.key, learner))) written += 1;
      } catch (error) {
        throw new Error(`Cannot apply memory repair for ${operation.file}. Error code: ${errorCode(error)}.`);
      }
    }
  }
  const postValidation = await validateMemory({ root, learner });
  const blocked = plan.operations.filter((operation) => !operation.supported).length;
  return {
    ...plan,
    generatedAt: new Date().toISOString(),
    dryRun: false,
    repairApplied: true,
    preRepairBackupId,
    postValidationStatus: postValidation.status,
    applied: {
      written,
      skipped: plan.operations.length - writes.length - blocked,
      blocked
    },
    safety: repairSafety({
      dryRunOnly: false,
      readOnly: false,
      repairApplied: true,
      preRepairBackupCreated: Boolean(preRepairBackupId),
      projectMemoryMutated: writes.some((operation) => operation.scope === 'project'),
      learnerMemoryMutated: writes.some((operation) => operation.scope === 'learner'),
      backupCreated: Boolean(preRepairBackupId)
    })
  };
}

function repairSafety(input: { dryRunOnly: boolean; readOnly: boolean; repairApplied: boolean; preRepairBackupCreated: boolean; projectMemoryMutated: boolean; learnerMemoryMutated: boolean; backupCreated: boolean }): MemoryRepairSafety {
  return {
    dryRunOnly: input.dryRunOnly,
    readOnly: input.readOnly,
    repairApplied: input.repairApplied,
    preRepairBackupCreated: input.preRepairBackupCreated,
    projectMemoryMutated: input.projectMemoryMutated,
    learnerMemoryMutated: input.learnerMemoryMutated,
    backupCreated: input.backupCreated,
    rawContentIncluded: false,
    absolutePathsIncluded: false,
    unsafeJudgmentIncluded: false
  };
}

async function writeDefaultIfMissing(path: string, root: string, content: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw repairSafetyError('UNSAFE_REPAIR_SYMLINK');
    await assertRealPathInside(path, root);
    return false;
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  await assertRepairRoot(root);
  await assertRealPathInside(dirname(path), root);
  await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
  return true;
}

async function assertRepairRoot(root: string): Promise<void> {
  const info = await lstat(root);
  if (info.isSymbolicLink()) throw repairSafetyError('UNSAFE_REPAIR_PATH');
  if (!info.isDirectory()) throw repairSafetyError('UNSAFE_REPAIR_PATH');
}

function repairRootFor(scope: MemoryFileScope, root: string, learner: string): string {
  const specs = knownMemoryFiles(root, learner).filter((spec) => spec.scope === scope).map((spec) => dirname(spec.path));
  return specs.sort((a, b) => a.length - b.length)[0] ?? root;
}

async function assertRealPathInside(path: string, root: string): Promise<void> {
  const [resolvedPath, resolvedRoot] = await Promise.all([realpath(path), realpath(root)]);
  if (!isPathInside(resolvedPath, resolvedRoot)) throw repairSafetyError('UNSAFE_REPAIR_PATH');
}

function isPathInside(path: string, root: string): boolean {
  const candidate = relative(root, path);
  return candidate === '' || Boolean(candidate && !candidate.startsWith('..') && !candidate.includes(`..${sep}`) && !isAbsolute(candidate));
}

function repairSafetyError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function defaultContentFor(key: MemoryFileKey, learner: string): string {
  switch (key) {
    case 'project.config':
      return `${JSON.stringify({ version: '0.1.0', learner, createdAt: new Date().toISOString() }, null, 2)}\n`;
    case 'project.concepts':
      return '[]\n';
    case 'project.evidence':
    case 'project.scanRuns':
    case 'learner.signals':
    case 'learner.answers':
    case 'learner.profileUpdates':
      return '';
    case 'project.fileIndex':
      return `${JSON.stringify(defaultFileIndex(), null, 2)}\n`;
    case 'learner.profile':
      return defaultProfile;
    case 'learner.preferences':
      return `${JSON.stringify(defaultPreferences, null, 2)}\n`;
    case 'learner.weakTerms':
      return '{}\n';
  }
}

function toRepairOperation(issue: MemoryValidateIssue): MemoryRepairOperation {
  if (issue.code === 'missing-file') return missingFileOperation(issue);
  return manualReviewOperation(issue);
}

function missingFileOperation(issue: MemoryValidateIssue): MemoryRepairOperation {
  const projectScanFile = issue.scope === 'project' && !issue.file.endsWith('config.json');
  return {
    id: repairOperationId(issue),
    scope: issue.scope,
    file: issue.file,
    issueCode: issue.code,
    operation: projectScanFile ? 'rerun-scan' : 'create-default',
    supported: true,
    destructive: false,
    wouldWrite: true,
    message: projectScanFile
      ? 'Would recreate this project memory file through project initialization or the next scan.'
      : 'Would recreate this default memory file from Contextbook templates.',
    line: issue.line,
    recommendedCommand: issue.recommendedCommand
  };
}

function manualReviewOperation(issue: MemoryValidateIssue): MemoryRepairOperation {
  return {
    id: repairOperationId(issue),
    scope: issue.scope,
    file: issue.file,
    issueCode: issue.code,
    operation: 'skip-manual-review',
    supported: false,
    destructive: false,
    wouldWrite: false,
    message: 'Automatic repair is not supported for this issue; inspect or restore the file manually before rerunning validate.',
    line: issue.line,
    recommendedCommand: issue.recommendedCommand
  };
}

function repairOperationId(issue: MemoryValidateIssue): string {
  const fileKey = issue.file.replace(/^~\//, 'home/').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const lineKey = issue.line ? `-line-${issue.line}` : '';
  return `repair:${issue.scope}:${fileKey}:${issue.code}${lineKey}`;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}
