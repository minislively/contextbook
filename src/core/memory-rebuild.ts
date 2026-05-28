import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mapEvidence } from '../concepts/mapper.js';
import { gitWorkingTreeState } from '../scan/git-diff.js';
import { readPackageJson } from '../scan/package-json.js';
import { scanProjectFiles } from '../scan/read-files.js';
import { validateMemory, type MemoryValidateIssue, type MemoryValidateResult } from './memory-validate.js';
import { projectPaths } from '../storage/project-store.js';
import { scanProject } from './scan.js';
import { executeMemoryBackup } from './memory-backup.js';
import { knownMemoryFiles } from './memory-files.js';

export type MemoryRebuildStatus = 'warning' | 'blocked' | 'ok';
export type MemoryRebuildOperationKind = 'replace-project-concepts' | 'replace-project-evidence' | 'replace-project-file-index' | 'append-scan-run' | 'preserve-learner-memory' | 'skip-validation-blocked';

export interface MemoryRebuildOperation {
  id: string;
  scope: 'project' | 'learner';
  operation: MemoryRebuildOperationKind;
  supported: boolean;
  wouldWrite: boolean;
  destructive: false;
  files: string[];
  message: string;
  blockedBy?: Array<Pick<MemoryValidateIssue, 'file' | 'code' | 'line'>>;
}

export interface MemoryRebuildPreview {
  filesScanned: number;
  bytesScanned: number;
  skippedFiles: number;
  changedFiles: number;
  conceptsDetected: number;
  evidenceDetected: number;
  warnings: number;
  topConcepts: string[];
}

export interface MemoryRebuildSummary {
  operations: number;
  supported: number;
  blocked: number;
  wouldWrite: number;
}

export interface MemoryRebuildSafety {
  dryRunOnly: boolean;
  readOnly: boolean;
  rebuildApplied: boolean;
  preRebuildBackupCreated: boolean;
  projectMemoryMutated: boolean;
  learnerMemoryMutated: false;
  conversationMemoryMutated: false;
  backupCreated: boolean;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRebuildResult {
  schemaVersion: 1;
  generatedAt: string;
  dryRun: boolean;
  status: MemoryRebuildStatus;
  validationStatus: MemoryValidateResult['status'];
  postValidationStatus?: MemoryValidateResult['status'];
  rebuildApplied: boolean;
  preRebuildBackupId?: string;
  preview: MemoryRebuildPreview;
  operations: MemoryRebuildOperation[];
  summary: MemoryRebuildSummary;
  applied?: {
    concepts: number;
    evidence: number;
    scanRunsAppended: number;
    blocked: number;
  };
  safety: MemoryRebuildSafety;
}

interface RebuildOptions {
  root?: string;
  learner?: string;
}

export async function planMemoryRebuild(options: RebuildOptions = {}): Promise<MemoryRebuildResult> {
  const root = options.root ?? process.cwd();
  const generatedAt = new Date().toISOString();
  const [validation, scanned, workingTree, packageJson] = await Promise.all([
    validateMemory(options),
    scanProjectFiles(root, 500, generatedAt),
    gitWorkingTreeState(root),
    readPackageJson(root)
  ]);
  const mapped = mapEvidence(scanned.files, { changedFiles: workingTree.changedFiles, packageJson });
  const blockingIssues = validation.issues.filter((issue) => issue.severity === 'error');
  const operations = rebuildOperations(blockingIssues, options.root ?? process.cwd(), options.learner ?? 'default');
  const blocked = operations.filter((operation) => !operation.supported).length;
  const supported = operations.filter((operation) => operation.supported).length;
  const wouldWrite = operations.filter((operation) => operation.wouldWrite).length;

  return {
    schemaVersion: 1,
    generatedAt,
    dryRun: true,
    status: blocked > 0 ? 'blocked' : 'warning',
    validationStatus: validation.status,
    rebuildApplied: false,
    preview: {
      filesScanned: scanned.fileIndex.totals.scanned,
      bytesScanned: scanned.fileIndex.totals.bytesScanned,
      skippedFiles: scanned.fileIndex.totals.skipped,
      changedFiles: workingTree.changedFileCount,
      conceptsDetected: mapped.concepts.length,
      evidenceDetected: mapped.evidence.length,
      warnings: scanned.warnings.length,
      topConcepts: mapped.concepts.slice(0, 5).map((concept) => concept.label)
    },
    operations,
    summary: {
      operations: operations.length,
      supported,
      blocked,
      wouldWrite
    },
    safety: rebuildSafety({ dryRunOnly: true, readOnly: true, rebuildApplied: false, preRebuildBackupCreated: false, projectMemoryMutated: false, backupCreated: false })
  };
}

export function formatMemoryRebuildSummary(result: MemoryRebuildResult): string {
  const title = result.dryRun ? '# Contextbook Memory Rebuild Dry Run' : '# Contextbook Memory Rebuild';
  const lines = [
    title,
    '',
    `status: ${result.status}`,
    `validation status: ${result.validationStatus}`,
    ...(result.postValidationStatus ? [`post-validation status: ${result.postValidationStatus}`] : []),
    ...(result.preRebuildBackupId ? [`pre-rebuild backup id: ${result.preRebuildBackupId}`] : []),
    `project preview: ${result.preview.filesScanned} files, ${result.preview.conceptsDetected} concepts, ${result.preview.evidenceDetected} evidence records`,
    `operations: ${result.summary.operations} total, ${result.summary.supported} supported, ${result.summary.blocked} blocked`,
    ...(result.applied ? [`applied: ${result.applied.concepts} concepts, ${result.applied.evidence} evidence records, ${result.applied.scanRunsAppended} scan-run appended`] : []),
    '',
    '## Planned Operations'
  ];

  for (const operation of result.operations) {
    const support = operation.supported ? 'supported' : 'blocked';
    const files = operation.files.length ? ` [${operation.files.join(', ')}]` : '';
    lines.push(`- ${support}: ${operation.operation}${files} — ${operation.message}`);
  }

  if (result.preview.topConcepts.length) {
    lines.push('', '## Preview Concepts', '', ...result.preview.topConcepts.map((label) => `- ${label}`));
  }

  lines.push(
    '',
    '## Safety',
    '',
    `- dry-run only: ${result.safety.dryRunOnly ? 'yes' : 'no'}`,
    `- read-only: ${result.safety.readOnly ? 'yes' : 'no'}`,
    `- rebuild applied: ${result.safety.rebuildApplied ? 'yes' : 'no'}`,
    `- pre-rebuild backup created: ${result.safety.preRebuildBackupCreated ? 'yes' : 'no'}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated ? 'yes' : 'no'}`,
    '- learner memory mutated: no',
    '- conversation memory mutated: no',
    `- backup created: ${result.safety.backupCreated ? 'yes' : 'no'}`,
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}


export async function executeMemoryRebuild(options: RebuildOptions = {}): Promise<MemoryRebuildResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const plan = await planMemoryRebuild({ root, learner });
  if (plan.status === 'blocked') {
    throw new Error('Cannot apply memory rebuild while the rebuild plan is blocked. Run `contextbook memory rebuild --dry-run --json` for details.');
  }

  try {
    await assertProjectMemoryDestinationSafe(root);
  } catch (error) {
    throw new Error(`Cannot apply memory rebuild safely. Error code: ${errorCode(error)}.`);
  }

  let preRebuildBackupId: string | undefined;
  if (plan.summary.wouldWrite > 0) {
    try {
      const backup = await executeMemoryBackup({ root, learner });
      preRebuildBackupId = backup.manifest.backupId;
    } catch (error) {
      throw new Error(`Cannot create pre-rebuild backup safely. Error code: ${errorCode(error)}.`);
    }
  }

  try {
    const scan = await scanProject({ root, learner, recordConversationSignal: false });
    const postValidation = await validateMemory({ root, learner });
    const blocked = plan.operations.filter((operation) => !operation.supported).length;
    return {
      ...plan,
      generatedAt: new Date().toISOString(),
      dryRun: false,
      status: postValidation.status === 'error' ? 'blocked' : postValidation.status === 'warning' ? 'warning' : 'ok',
      postValidationStatus: postValidation.status,
      rebuildApplied: true,
      preRebuildBackupId,
      applied: {
        concepts: scan.conceptsDetected,
        evidence: scan.evidenceDetected,
        scanRunsAppended: 1,
        blocked
      },
      safety: rebuildSafety({ dryRunOnly: false, readOnly: false, rebuildApplied: true, preRebuildBackupCreated: Boolean(preRebuildBackupId), projectMemoryMutated: true, backupCreated: Boolean(preRebuildBackupId) })
    };
  } catch (error) {
    throw new Error(`Cannot apply memory rebuild safely. Error code: ${errorCode(error)}.`);
  }
}

function rebuildSafety(input: { dryRunOnly: boolean; readOnly: boolean; rebuildApplied: boolean; preRebuildBackupCreated: boolean; projectMemoryMutated: boolean; backupCreated: boolean }): MemoryRebuildSafety {
  return {
    dryRunOnly: input.dryRunOnly,
    readOnly: input.readOnly,
    rebuildApplied: input.rebuildApplied,
    preRebuildBackupCreated: input.preRebuildBackupCreated,
    projectMemoryMutated: input.projectMemoryMutated,
    learnerMemoryMutated: false,
    conversationMemoryMutated: false,
    backupCreated: input.backupCreated,
    rawContentIncluded: false,
    absolutePathsIncluded: false,
    unsafeJudgmentIncluded: false
  };
}

async function assertProjectMemoryDestinationSafe(root: string): Promise<void> {
  const paths = projectPaths(root);
  await assertNoSymlinkIfExists(dirname(paths.project));
  await assertNoSymlinkIfExists(paths.project);
}

async function assertNoSymlinkIfExists(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw rebuildSafetyError('UNSAFE_REBUILD_PATH');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
}

function rebuildSafetyError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}

function rebuildOperations(blockingIssues: MemoryValidateIssue[], root: string, learner: string): MemoryRebuildOperation[] {
  const learnerFiles = knownMemoryFiles(root, learner).filter((file) => file.scope === 'learner').map((file) => file.safePath);
  const operations: MemoryRebuildOperation[] = [
    {
      id: 'rebuild:project:concepts',
      scope: 'project',
      operation: 'replace-project-concepts',
      supported: true,
      wouldWrite: true,
      destructive: false,
      files: ['.contextbook/project/concepts.json'],
      message: 'Would replace detected project concepts from a fresh read-only scan.'
    },
    {
      id: 'rebuild:project:evidence',
      scope: 'project',
      operation: 'replace-project-evidence',
      supported: true,
      wouldWrite: true,
      destructive: false,
      files: ['.contextbook/project/evidence.jsonl'],
      message: 'Would replace project evidence records from a fresh read-only scan.'
    },
    {
      id: 'rebuild:project:file-index',
      scope: 'project',
      operation: 'replace-project-file-index',
      supported: true,
      wouldWrite: true,
      destructive: false,
      files: ['.contextbook/project/file-index.json'],
      message: 'Would replace the project file index snapshot.'
    },
    {
      id: 'rebuild:project:scan-runs',
      scope: 'project',
      operation: 'append-scan-run',
      supported: true,
      wouldWrite: true,
      destructive: false,
      files: ['.contextbook/project/scan-runs.jsonl'],
      message: 'Would append a scan-run audit entry for the rebuild.'
    },
    {
      id: 'rebuild:learner:preserve',
      scope: 'learner',
      operation: 'preserve-learner-memory',
      supported: true,
      wouldWrite: false,
      destructive: false,
      files: learnerFiles,
      message: 'Would preserve Learner and Conversation Memory unchanged.'
    }
  ];

  if (blockingIssues.length === 0) return operations;
  return [
    ...operations,
    {
      id: 'rebuild:validation:blocked',
      scope: 'project',
      operation: 'skip-validation-blocked',
      supported: false,
      wouldWrite: false,
      destructive: false,
      files: [...new Set(blockingIssues.map((issue) => issue.file))],
      message: 'Existing memory has validation errors; inspect or repair them before running a real rebuild.',
      blockedBy: blockingIssues.map((issue) => ({ file: issue.file, code: issue.code, line: issue.line }))
    }
  ];
}
