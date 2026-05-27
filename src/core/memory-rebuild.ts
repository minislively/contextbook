import { mapEvidence } from '../concepts/mapper.js';
import { gitWorkingTreeState } from '../scan/git-diff.js';
import { readPackageJson } from '../scan/package-json.js';
import { scanProjectFiles } from '../scan/read-files.js';
import { validateMemory, type MemoryValidateIssue, type MemoryValidateResult } from './memory-validate.js';

export type MemoryRebuildStatus = 'warning' | 'blocked';
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
  dryRunOnly: true;
  readOnly: true;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  conversationMemoryMutated: false;
  backupCreated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRebuildResult {
  schemaVersion: 1;
  generatedAt: string;
  dryRun: true;
  status: MemoryRebuildStatus;
  validationStatus: MemoryValidateResult['status'];
  preview: MemoryRebuildPreview;
  operations: MemoryRebuildOperation[];
  summary: MemoryRebuildSummary;
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
  const operations = rebuildOperations(blockingIssues);
  const blocked = operations.filter((operation) => !operation.supported).length;
  const supported = operations.filter((operation) => operation.supported).length;
  const wouldWrite = operations.filter((operation) => operation.wouldWrite).length;

  return {
    schemaVersion: 1,
    generatedAt,
    dryRun: true,
    status: blocked > 0 ? 'blocked' : 'warning',
    validationStatus: validation.status,
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
    safety: {
      dryRunOnly: true,
      readOnly: true,
      projectMemoryMutated: false,
      learnerMemoryMutated: false,
      conversationMemoryMutated: false,
      backupCreated: false,
      rawContentIncluded: false,
      absolutePathsIncluded: false,
      unsafeJudgmentIncluded: false
    }
  };
}

export function formatMemoryRebuildSummary(result: MemoryRebuildResult): string {
  const lines = [
    '# Contextbook Memory Rebuild Dry Run',
    '',
    `status: ${result.status}`,
    `validation status: ${result.validationStatus}`,
    `project preview: ${result.preview.filesScanned} files, ${result.preview.conceptsDetected} concepts, ${result.preview.evidenceDetected} evidence records`,
    `operations: ${result.summary.operations} total, ${result.summary.supported} supported, ${result.summary.blocked} blocked`,
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
    '- dry-run only: yes',
    '- read-only: yes',
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- conversation memory mutated: no',
    '- backup created: no',
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}

function rebuildOperations(blockingIssues: MemoryValidateIssue[]): MemoryRebuildOperation[] {
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
      files: ['~/.contextbook/learners/default/profile.md', '~/.contextbook/learners/default/preferences.json', '~/.contextbook/learners/default/signals.jsonl'],
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
