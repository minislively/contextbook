import type { EvidenceRecord } from '../types.js';

export type EvidenceQualityClass = 'primary' | 'secondary' | 'support' | 'rule-definition' | 'hidden';

const codeExtensionPattern = /\.(?:[cm]?[jt]sx?|json|mdx?|vue|svelte)$/i;
const supportFilePattern = /(^|\/)(?:__tests__|__fixtures__|__mocks__|fixtures?|mocks?|tests?|examples?|scripts)\//i;
const supportNamePattern = /\.(?:test|spec|smoke|fixture|mock)\.[cm]?[jt]sx?$/i;
const configPattern = /(^|\/)[^/]*(?:config|rc)\.[cm]?[jt]s(?:on)?$/i;
const primaryDirPattern = /^(?:src|app|lib|packages|components|hooks|stores)\//;
const ruleDefinitionFiles = new Set([
  'src/concepts/rules.ts',
  'src/concepts/mapper.ts',
  'src/format/explanation.ts',
  'src/format/response-plan.ts'
]);

export function evidenceQualityClass(file = ''): EvidenceQualityClass {
  const normalized = normalizeEvidenceFile(file);
  if (!normalized || isHiddenEvidenceFile(normalized)) return 'hidden';
  if (isRuleDefinitionFile(normalized)) return 'rule-definition';
  if (isSupportEvidenceFile(normalized)) return 'support';
  if (isSecondaryEvidenceFile(normalized)) return 'secondary';
  if (isPrimaryEvidenceFile(normalized)) return 'primary';
  return codeExtensionPattern.test(normalized) ? 'primary' : 'secondary';
}

export function evidenceQualityRank(file = ''): number {
  switch (evidenceQualityClass(file)) {
    case 'primary': return 0;
    case 'secondary': return 100;
    case 'support': return 200;
    case 'rule-definition': return 300;
    case 'hidden': return 10_000;
  }
}

export function bestEvidenceQualityRank(signals: EvidenceRecord[]): number {
  return Math.min(...signals.map((signal) => evidenceQualityRank(signal.file)), 10_000);
}

export function hasPrimaryEvidence(signals: EvidenceRecord[]): boolean {
  return signals.some((signal) => evidenceQualityClass(signal.file) === 'primary');
}

export function hasChangedPrimaryEvidence(signals: EvidenceRecord[], changedFiles: Set<string>): boolean {
  return signals.some((signal) => evidenceQualityClass(signal.file) === 'primary' && (signal.changed || (signal.file ? changedFiles.has(signal.file) : false)));
}

function normalizeEvidenceFile(file = ''): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isRuleDefinitionFile(file: string): boolean {
  return ruleDefinitionFiles.has(file) || file.startsWith('templates/prompts/');
}

function isSupportEvidenceFile(file: string): boolean {
  return supportFilePattern.test(file) || supportNamePattern.test(file);
}

function isSecondaryEvidenceFile(file: string): boolean {
  return file === 'package.json'
    || /^readme(?:\.[^.]+)?$/i.test(file)
    || file.startsWith('docs/')
    || configPattern.test(file);
}

function isPrimaryEvidenceFile(file: string): boolean {
  return primaryDirPattern.test(file);
}

function isHiddenEvidenceFile(file = ''): boolean {
  const normalized = file.replace(/\\/g, '/');
  return normalized.startsWith('docs/private/')
    || normalized.includes('/docs/private/')
    || normalized.startsWith('.contextbook/')
    || normalized.includes('/.contextbook/')
    || normalized === '.contextbook'
    || normalized.startsWith('.omx/')
    || normalized.includes('/.omx/')
    || normalized === '.omx'
    || normalized.startsWith('dist/')
    || normalized.includes('/dist/')
    || normalized === 'dist'
    || normalized.includes('/node_modules/')
    || normalized.startsWith('node_modules/')
    || normalized === 'node_modules';
}
