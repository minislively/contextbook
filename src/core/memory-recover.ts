import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gitWorkingTreeState } from '../scan/git-diff.js';
import { projectPaths, readScanRuns } from '../storage/project-store.js';
import { learnerBackupPaths, learnerPaths } from '../storage/user-store.js';
import { validateMemory, type MemoryValidateIssue, type MemoryValidateResult } from './memory-validate.js';

export type MemoryRecoverStatus = 'ok' | 'warning' | 'blocked';
export type MemoryRecoverPrimaryCase = 'healthy' | 'missing-files' | 'malformed-memory' | 'stale-project-memory' | 'restore-candidate' | 'preference-undo-candidate' | 'mixed';
export type MemoryRecoverScope = 'project' | 'learner' | 'conversation' | 'backup' | 'preference';
export type MemoryRecoverSeverity = 'info' | 'warning' | 'error';

export interface MemoryRecoverFinding {
  code: string;
  severity: MemoryRecoverSeverity;
  scope: MemoryRecoverScope;
  message: string;
  evidence?: string[];
}

export interface MemoryRecoverStep {
  step: number;
  command: string;
  reason: string;
  writes: boolean;
  requiresYes: boolean;
  blockedBy?: string[];
}

export interface MemoryRecoverBackupCandidate {
  backupId: string;
  scopes: Array<'project' | 'learner'>;
  recommendedCommand: string;
}

export interface MemoryRecoverSafety {
  readOnly: true;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  conversationMemoryMutated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryRecoverResult {
  schemaVersion: 1;
  generatedAt: string;
  status: MemoryRecoverStatus;
  primaryCase: MemoryRecoverPrimaryCase;
  findings: MemoryRecoverFinding[];
  recommendedFlow: MemoryRecoverStep[];
  backupCandidates: MemoryRecoverBackupCandidate[];
  safety: MemoryRecoverSafety;
}

interface RecoverOptions {
  root?: string;
  learner?: string;
}

export async function recoverMemory(options: RecoverOptions = {}): Promise<MemoryRecoverResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const generatedAt = new Date().toISOString();
  const [validation, backupCandidates, staleFinding, undoablePreferences] = await Promise.all([
    validateMemory({ root, learner }),
    discoverBackupCandidates(root),
    projectStaleFinding(root),
    countUndoablePreferenceEntries(learner)
  ]);

  const findings: MemoryRecoverFinding[] = [validationFinding(validation)];
  const missingIssues = validation.issues.filter((issue) => issue.code === 'missing-file');
  const errorIssues = validation.issues.filter((issue) => issue.severity === 'error');
  if (missingIssues.length > 0) findings.push(missingFilesFinding(missingIssues));
  if (errorIssues.length > 0) findings.push(malformedMemoryFinding(errorIssues));
  if (staleFinding) findings.push(staleFinding);
  if (backupCandidates.length > 0) findings.push(backupFinding(backupCandidates));
  if (undoablePreferences > 0) findings.push(preferenceUndoFinding(undoablePreferences));

  const primaryCase = choosePrimaryCase({ missingIssues, errorIssues, hasStaleProject: Boolean(staleFinding), hasBackups: backupCandidates.length > 0, undoablePreferences });
  const recommendedFlow = buildRecommendedFlow({ primaryCase, validation, missingIssues, errorIssues, hasStaleProject: Boolean(staleFinding), backupCandidates, undoablePreferences });

  return {
    schemaVersion: 1,
    generatedAt,
    status: recoverStatus(validation, staleFinding, primaryCase),
    primaryCase,
    findings,
    recommendedFlow,
    backupCandidates,
    safety: recoverSafety()
  };
}

export function formatMemoryRecoverSummary(result: MemoryRecoverResult): string {
  const findings = result.findings.map((finding) => {
    const evidence = finding.evidence?.length ? ` [${finding.evidence.join(', ')}]` : '';
    return `- ${finding.severity}: ${finding.code}${evidence} — ${finding.message}`;
  }).join('\n') || '- none';
  const flow = result.recommendedFlow.map((step) => {
    const writes = step.writes ? 'writes' : 'read-only';
    const yes = step.requiresYes ? ', requires --yes' : '';
    const blocked = step.blockedBy?.length ? ` blocked by: ${step.blockedBy.join(', ')}` : '';
    return `${step.step}. \`${step.command}\` — ${step.reason} (${writes}${yes})${blocked}`;
  }).join('\n') || '- no recovery action needed';
  const backups = result.backupCandidates.map((candidate) => `- ${candidate.backupId}: ${candidate.scopes.join('+')} — \`${candidate.recommendedCommand}\``).join('\n') || '- none';

  return [
    '# Contextbook Memory Recovery',
    '',
    `status: ${result.status}`,
    `primary case: ${result.primaryCase}`,
    '',
    '## What Contextbook Found',
    findings,
    '',
    '## Recommended Flow',
    flow,
    '',
    '## Backup Candidates',
    backups,
    '',
    '## Safety',
    '- read-only: yes',
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- conversation memory mutated: no',
    '- raw memory included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  ].join('\n');
}

function validationFinding(validation: MemoryValidateResult): MemoryRecoverFinding {
  return {
    code: `validation-${validation.status}`,
    severity: validation.status === 'error' ? 'error' : validation.status === 'warning' ? 'warning' : 'info',
    scope: 'project',
    message: `${validation.summary.errors} validation errors and ${validation.summary.warnings} warnings found.`,
    evidence: [`missing:${validation.summary.missingFiles}`, `invalid:${validation.summary.invalidFiles}`]
  };
}

function missingFilesFinding(issues: MemoryValidateIssue[]): MemoryRecoverFinding {
  return {
    code: 'missing-memory-files',
    severity: 'warning',
    scope: issues.some((issue) => issue.scope === 'project') ? 'project' : 'learner',
    message: 'Known Contextbook memory files are missing; supported defaults can be recreated after a dry-run preview.',
    evidence: safeIssueEvidence(issues)
  };
}

function malformedMemoryFinding(issues: MemoryValidateIssue[]): MemoryRecoverFinding {
  return {
    code: 'malformed-memory-files',
    severity: 'error',
    scope: issues.some((issue) => issue.scope === 'learner') ? 'learner' : 'project',
    message: 'Some memory files are malformed or unsafe to inspect; restore from backup or inspect manually before applying repairs.',
    evidence: safeIssueEvidence(issues)
  };
}

async function projectStaleFinding(root: string): Promise<MemoryRecoverFinding | undefined> {
  try {
    const [scanRuns, workingTree] = await Promise.all([readScanRuns(root), gitWorkingTreeState(root)]);
    const latest = [...scanRuns].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0];
    if (!latest) return undefined;
    if (!workingTree.available || !latest.workingTreeFingerprint || latest.workingTreeFingerprint === workingTree.fingerprint) return undefined;
    return {
      code: 'stale-project-memory',
      severity: 'warning',
      scope: 'project',
      message: 'The working tree changed since the latest project scan; Project Memory may need regeneration.',
      evidence: [`changed-files:${workingTree.changedFileCount}`, `latest-scan:${latest.scanId}`]
    };
  } catch {
    return undefined;
  }
}

function backupFinding(candidates: MemoryRecoverBackupCandidate[]): MemoryRecoverFinding {
  return {
    code: 'backup-candidates-found',
    severity: 'info',
    scope: 'backup',
    message: 'Backup manifests are available for explicit restore dry-runs.',
    evidence: candidates.slice(0, 3).map((candidate) => candidate.backupId)
  };
}

function preferenceUndoFinding(count: number): MemoryRecoverFinding {
  return {
    code: 'preference-undo-candidates-found',
    severity: 'info',
    scope: 'preference',
    message: 'Undoable preference history exists if the recovery need is about explanation preferences.',
    evidence: [`undoable:${count}`]
  };
}

function choosePrimaryCase(input: { missingIssues: MemoryValidateIssue[]; errorIssues: MemoryValidateIssue[]; hasStaleProject: boolean; hasBackups: boolean; undoablePreferences: number }): MemoryRecoverPrimaryCase {
  const active = [input.missingIssues.length > 0, input.errorIssues.length > 0, input.hasStaleProject, input.undoablePreferences > 0].filter(Boolean).length;
  if (active > 1) return 'mixed';
  if (input.errorIssues.length > 0) return input.hasBackups ? 'restore-candidate' : 'malformed-memory';
  if (input.missingIssues.length > 0) return 'missing-files';
  if (input.hasStaleProject) return 'stale-project-memory';
  if (input.undoablePreferences > 0) return 'preference-undo-candidate';
  return 'healthy';
}

function buildRecommendedFlow(input: { primaryCase: MemoryRecoverPrimaryCase; validation: MemoryValidateResult; missingIssues: MemoryValidateIssue[]; errorIssues: MemoryValidateIssue[]; hasStaleProject: boolean; backupCandidates: MemoryRecoverBackupCandidate[]; undoablePreferences: number }): MemoryRecoverStep[] {
  const steps: Omit<MemoryRecoverStep, 'step'>[] = [
    { command: 'contextbook memory validate --json', reason: 'Confirm current memory health before choosing a recovery path.', writes: false, requiresYes: false }
  ];

  if (input.errorIssues.length > 0) {
    const backup = input.backupCandidates[0];
    if (backup) {
      steps.push({ command: `contextbook memory restore --backup-id ${backup.backupId} --dry-run`, reason: 'Preview restore from an explicit backup because malformed files should not be guessed or overwritten.', writes: false, requiresYes: false, blockedBy: safeIssueEvidence(input.errorIssues) });
      steps.push({ command: `contextbook memory restore --backup-id ${backup.backupId} --yes`, reason: 'Apply restore only after the dry-run verifies manifests and checksums.', writes: true, requiresYes: true, blockedBy: safeIssueEvidence(input.errorIssues) });
    } else {
      steps.push({ command: 'contextbook memory validate', reason: 'Inspect malformed memory issue codes; no safe backup candidate was found for automatic restore guidance.', writes: false, requiresYes: false, blockedBy: safeIssueEvidence(input.errorIssues) });
    }
  }

  if (input.missingIssues.length > 0 && input.errorIssues.length === 0) {
    steps.push({ command: 'contextbook memory repair --dry-run', reason: 'Preview supported missing-file repairs without writing.', writes: false, requiresYes: false });
    steps.push({ command: 'contextbook memory repair --yes', reason: 'Recreate supported missing files after Contextbook creates a pre-repair backup.', writes: true, requiresYes: true });
  }

  if (input.hasStaleProject && input.errorIssues.length === 0) {
    steps.push({ command: 'contextbook memory rebuild --dry-run', reason: 'Preview Project Memory regeneration from the current codebase.', writes: false, requiresYes: false });
    steps.push({ command: 'contextbook memory rebuild --yes', reason: 'Regenerate Project Memory after a pre-rebuild backup while preserving Learner and Conversation Memory.', writes: true, requiresYes: true });
  }

  if (input.undoablePreferences > 0) {
    steps.push({ command: 'contextbook memory preference-history', reason: 'Inspect undoable preference changes if recovery is about explanation preferences.', writes: false, requiresYes: false });
    steps.push({ command: 'contextbook memory undo-preference-update --entry <id|index> --dry-run', reason: 'Preview the selected preference snapshot restore.', writes: false, requiresYes: false });
    steps.push({ command: 'contextbook memory undo-preference-update --entry <id|index> --yes', reason: 'Restore only the selected preferences snapshot after confirming the dry-run.', writes: true, requiresYes: true });
  }

  if (steps.length === 1 && input.primaryCase === 'healthy') {
    steps.push({ command: 'contextbook memory context', reason: 'Memory looks healthy; inspect current learning context instead of recovering.', writes: false, requiresYes: false });
  }

  return steps.map((step, index) => ({ step: index + 1, ...step }));
}

function recoverStatus(validation: MemoryValidateResult, staleFinding: MemoryRecoverFinding | undefined, primaryCase: MemoryRecoverPrimaryCase): MemoryRecoverStatus {
  if (validation.status === 'error') return 'blocked';
  if (validation.status === 'warning' || staleFinding || primaryCase !== 'healthy') return 'warning';
  return 'ok';
}

async function discoverBackupCandidates(root: string): Promise<MemoryRecoverBackupCandidate[]> {
  const projectBackupRoot = projectPaths(root).backups;
  const learnerBackupRoot = dirname(learnerBackupPaths('placeholder').base);
  const [projectIds, learnerIds] = await Promise.all([
    listBackupIds(projectBackupRoot),
    listBackupIds(learnerBackupRoot)
  ]);
  const ids = [...new Set([...projectIds, ...learnerIds])].sort().reverse().slice(0, 5);
  return ids.map((backupId) => {
    const scopes: Array<'project' | 'learner'> = [];
    if (projectIds.includes(backupId)) scopes.push('project');
    if (learnerIds.includes(backupId)) scopes.push('learner');
    return {
      backupId,
      scopes,
      recommendedCommand: `contextbook memory restore --backup-id ${backupId} --dry-run`
    };
  });
}

async function listBackupIds(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeBackupId(entry.name)) continue;
      try {
        await readFile(join(root, entry.name, 'manifest.json'), 'utf8');
        ids.push(entry.name);
      } catch {
        // Ignore partial/non-manifest directories; recover is guidance only.
      }
    }
    return ids;
  } catch {
    return [];
  }
}

async function countUndoablePreferenceEntries(learner: string): Promise<number> {
  const paths = learnerPaths(learner);
  try {
    const [raw, entries] = await Promise.all([
      readFile(paths.profileUpdates, 'utf8'),
      readdir(paths.base)
    ]);
    const backups = new Set(entries.filter((entry) => /^preferences\.json\.bak-/.test(entry)));
    return raw.split(/\r?\n/).filter(Boolean).reduce((count, line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const metadata = parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata as Record<string, unknown> : {};
        const backup = typeof metadata.backup === 'string' ? metadata.backup.split('/').pop() : typeof metadata.preferencesBackup === 'string' ? metadata.preferencesBackup.split('/').pop() : '';
        const command = typeof parsed.command === 'string' ? parsed.command : '';
        return backup && backups.has(backup) && command.startsWith('memory.') ? count + 1 : count;
      } catch {
        return count;
      }
    }, 0);
  } catch {
    return 0;
  }
}

function safeIssueEvidence(issues: MemoryValidateIssue[]): string[] {
  return [...new Set(issues.slice(0, 5).map((issue) => `${issue.file}:${issue.code}${issue.line ? `:${issue.line}` : ''}`))];
}

function isSafeBackupId(value: string): boolean {
  return /^backup-[0-9]{8}T[0-9]{9}Z$/.test(value);
}

function recoverSafety(): MemoryRecoverSafety {
  return {
    readOnly: true,
    projectMemoryMutated: false,
    learnerMemoryMutated: false,
    conversationMemoryMutated: false,
    rawContentIncluded: false,
    absolutePathsIncluded: false,
    unsafeJudgmentIncluded: false
  };
}
