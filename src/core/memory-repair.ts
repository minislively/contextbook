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
  dryRunOnly: true;
  readOnly: true;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  backupCreated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRepairResult {
  schemaVersion: 1;
  generatedAt: string;
  dryRun: true;
  status: MemoryRepairStatus;
  validationStatus: MemoryValidateResult['status'];
  operations: MemoryRepairOperation[];
  summary: MemoryRepairSummary;
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
      backupCreated: false,
      rawContentIncluded: false,
      absolutePathsIncluded: false,
      unsafeJudgmentIncluded: false
    }
  };
}

export function formatMemoryRepairSummary(result: MemoryRepairResult): string {
  const lines = [
    '# Contextbook Memory Repair Dry Run',
    '',
    `status: ${result.status}`,
    `validation status: ${result.validationStatus}`,
    `operations: ${result.summary.operations} total, ${result.summary.supported} supported, ${result.summary.blocked} blocked`,
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
    '- dry-run only: yes',
    '- read-only: yes',
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- backup created: no',
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
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
