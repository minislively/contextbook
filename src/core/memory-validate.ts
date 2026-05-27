import { readFile } from 'node:fs/promises';
import { projectRoot } from '../storage/project-store.js';
import { knownMemoryFiles, type MemoryFileKey, type MemoryFileKind, type MemoryFileScope } from './memory-files.js';

export type MemoryValidateStatus = 'ok' | 'warning' | 'error';
export type MemoryValidateSeverity = 'warning' | 'error';
export type MemoryValidateScope = MemoryFileScope;
export type MemoryValidateIssueCode = 'missing-file' | 'inspect-error' | 'invalid-json' | 'invalid-jsonl' | 'invalid-shape';

export interface MemoryValidateIssue {
  severity: MemoryValidateSeverity;
  scope: MemoryValidateScope;
  file: string;
  code: MemoryValidateIssueCode;
  message: string;
  line?: number;
  recommendedCommand?: string;
}

export interface MemoryValidateSummary {
  projectFilesChecked: number;
  learnerFilesChecked: number;
  missingFiles: number;
  invalidFiles: number;
  warnings: number;
  errors: number;
}

export interface MemoryValidateSafety {
  readOnly: true;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  rawContentIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryValidateResult {
  schemaVersion: 1;
  generatedAt: string;
  status: MemoryValidateStatus;
  issues: MemoryValidateIssue[];
  summary: MemoryValidateSummary;
  safety: MemoryValidateSafety;
}

interface ValidateOptions {
  root?: string;
  learner?: string;
}

interface FileSpec {
  key: MemoryFileKey;
  scope: MemoryValidateScope;
  path: string;
  safePath: string;
  kind: MemoryFileKind;
  requiredShape?: (value: unknown) => string | undefined;
  recommendedCommand: string;
}

export async function validateMemory(options: ValidateOptions = {}): Promise<MemoryValidateResult> {
  const root = options.root ?? projectRoot();
  const learner = options.learner ?? 'default';
  const specs = memoryFileSpecs(root, learner);
  const issues: MemoryValidateIssue[] = [];

  for (const spec of specs) {
    if (spec.kind === 'markdown') {
      issues.push(...await validateReadableFile(spec));
      continue;
    }
    if (spec.kind === 'json') {
      issues.push(...await validateJsonFile(spec));
      continue;
    }
    issues.push(...await validateJsonlFile(spec));
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'ok',
    issues,
    summary: {
      projectFilesChecked: specs.filter((spec) => spec.scope === 'project').length,
      learnerFilesChecked: specs.filter((spec) => spec.scope === 'learner').length,
      missingFiles: issues.filter((issue) => issue.code === 'missing-file').length,
      invalidFiles: new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.scope}:${issue.file}`)).size,
      warnings,
      errors
    },
    safety: {
      readOnly: true,
      projectMemoryMutated: false,
      learnerMemoryMutated: false,
      rawContentIncluded: false,
      absolutePathsIncluded: false,
      unsafeJudgmentIncluded: false
    }
  };
}

export function formatMemoryValidateSummary(result: MemoryValidateResult): string {
  const lines = [
    '# Contextbook Memory Validate',
    '',
    `status: ${result.status}`,
    `checked: project ${result.summary.projectFilesChecked}, learner ${result.summary.learnerFilesChecked}`,
    `issues: ${result.summary.errors} errors, ${result.summary.warnings} warnings`,
    '',
    '## Issues'
  ];

  if (result.issues.length === 0) {
    lines.push('', '- none');
  } else {
    lines.push('');
    for (const issue of result.issues) {
      const line = issue.line ? ` line ${issue.line}` : '';
      const action = issue.recommendedCommand ? ` — try \`${issue.recommendedCommand}\`` : '';
      lines.push(`- ${issue.severity}: ${issue.file}${line} (${issue.code}) — ${issue.message}${action}`);
    }
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- read-only: yes',
    '- project memory mutated: no',
    '- learner memory mutated: no',
    '- raw file contents included: no',
    '- absolute paths included: no',
    '- unsafe learner judgment included: no'
  );

  return `${lines.join('\n')}\n`;
}

function memoryFileSpecs(root: string, learner: string): FileSpec[] {
  return knownMemoryFiles(root, learner).map((spec) => ({
    ...spec,
    requiredShape: requiredShapeFor(spec.key)
  }));
}

function requiredShapeFor(key: MemoryFileKey): ((value: unknown) => string | undefined) | undefined {
  switch (key) {
    case 'project.config':
      return validateProjectConfigShape;
    case 'project.concepts':
      return validateConceptsShape;
    case 'project.evidence':
    case 'learner.signals':
    case 'learner.answers':
    case 'learner.profileUpdates':
      return validateObjectEntryShape;
    case 'project.fileIndex':
      return validateFileIndexShape;
    case 'project.scanRuns':
      return validateScanRunShape;
    case 'learner.preferences':
      return validatePreferencesShape;
    case 'learner.weakTerms':
      return validatePlainObjectShape;
    case 'learner.profile':
      return undefined;
  }
}

async function validateReadableFile(spec: FileSpec): Promise<MemoryValidateIssue[]> {
  try {
    await readFile(spec.path, 'utf8');
    return [];
  } catch (error) {
    return [readIssue(spec, error)];
  }
}

async function validateJsonFile(spec: FileSpec): Promise<MemoryValidateIssue[]> {
  let raw: string;
  try {
    raw = await readFile(spec.path, 'utf8');
  } catch (error) {
    return [readIssue(spec, error)];
  }
  try {
    const parsed = raw.trim() ? JSON.parse(raw) as unknown : undefined;
    const shapeError = spec.requiredShape?.(parsed);
    if (!shapeError) return [];
    return [shapeIssue(spec, shapeError)];
  } catch (error) {
    return [parseIssue(spec, 'invalid-json', error)];
  }
}

async function validateJsonlFile(spec: FileSpec): Promise<MemoryValidateIssue[]> {
  const issues: MemoryValidateIssue[] = [];
  let raw: string;
  try {
    raw = await readFile(spec.path, 'utf8');
  } catch (error) {
    return [readIssue(spec, error)];
  }
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      const shapeError = spec.requiredShape?.(parsed);
      if (shapeError) issues.push(shapeIssue(spec, shapeError, index + 1));
    } catch (error) {
      issues.push(parseIssue(spec, 'invalid-jsonl', error, index + 1));
    }
  }
  return issues;
}

function readIssue(spec: FileSpec, error: unknown): MemoryValidateIssue {
  const code = errorCode(error);
  if (code === 'ENOENT') {
    return {
      severity: 'warning',
      scope: spec.scope,
      file: spec.safePath,
      code: 'missing-file',
      message: `${spec.safePath} is missing.`,
      recommendedCommand: spec.recommendedCommand
    };
  }
  return {
    severity: 'error',
    scope: spec.scope,
    file: spec.safePath,
    code: 'inspect-error',
    message: `Could not inspect known memory file safely. Error code: ${code}.`,
    recommendedCommand: spec.recommendedCommand
  };
}

function parseIssue(spec: FileSpec, code: 'invalid-json' | 'invalid-jsonl', error: unknown, line?: number): MemoryValidateIssue {
  const detail = error instanceof Error ? error.message : 'Unable to parse JSON.';
  return {
    severity: 'error',
    scope: spec.scope,
    file: spec.safePath,
    code,
    message: `Invalid JSON syntax: ${detail}`,
    line,
    recommendedCommand: spec.recommendedCommand
  };
}

function shapeIssue(spec: FileSpec, message: string, line?: number): MemoryValidateIssue {
  return {
    severity: 'error',
    scope: spec.scope,
    file: spec.safePath,
    code: 'invalid-shape',
    message,
    line,
    recommendedCommand: spec.recommendedCommand
  };
}

function validateObjectEntryShape(value: unknown): string | undefined {
  return isPlainObject(value) ? undefined : 'JSONL entry must be an object.';
}

function validateProjectConfigShape(value: unknown): string | undefined {
  if (!isPlainObject(value)) return 'config.json must be an object.';
  if (typeof value.version !== 'string') return 'config.json must include a string version.';
  return undefined;
}

function validateConceptsShape(value: unknown): string | undefined {
  return Array.isArray(value) ? undefined : 'concepts.json must be an array.';
}

function validateFileIndexShape(value: unknown): string | undefined {
  if (!isPlainObject(value)) return 'file-index.json must be an object.';
  if (value.schemaVersion !== 1) return 'file-index.json must include schemaVersion: 1.';
  if (!isPlainObject(value.totals)) return 'file-index.json must include a totals object.';
  if (!Array.isArray(value.files)) return 'file-index.json must include a files array.';
  return undefined;
}

function validateScanRunShape(value: unknown): string | undefined {
  if (!isPlainObject(value)) return 'scan-runs.jsonl entry must be an object.';
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) return 'scan-runs.jsonl entry schemaVersion must be 1 when present.';
  if (value.schemaVersion === 1 && typeof value.scanId !== 'string') return 'scan-runs.jsonl entry with schemaVersion 1 must include scanId.';
  if (value.schemaVersion === 1 && typeof value.scannedAt !== 'string') return 'scan-runs.jsonl entry with schemaVersion 1 must include scannedAt.';
  return undefined;
}

function validatePreferencesShape(value: unknown): string | undefined {
  if (!isPlainObject(value)) return 'preferences.json must be an object.';
  if (!Array.isArray(value.explanationOrder)) return 'preferences.json must include explanationOrder array.';
  if (!Array.isArray(value.avoid)) return 'preferences.json must include avoid array.';
  return undefined;
}

function validatePlainObjectShape(value: unknown): string | undefined {
  return isPlainObject(value) ? undefined : 'File must contain a JSON object.';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}
