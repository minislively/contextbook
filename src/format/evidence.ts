import { basename } from 'node:path';
import type { EvidenceRecord } from '../types.js';

export const DEFAULT_VISIBLE_EVIDENCE_LIMIT = 3;

export interface EvidenceDisplayOptions {
  changedFiles?: Set<string>;
  limit?: number;
}

export interface EvidenceDisplayResult {
  visibleFiles: string[];
  hiddenFiles: string[];
  primarySignal?: EvidenceRecord;
}

export function rankEvidenceForDisplay(signals: EvidenceRecord[], options: EvidenceDisplayOptions = {}): EvidenceDisplayResult {
  const limit = options.limit ?? DEFAULT_VISIBLE_EVIDENCE_LIMIT;
  const rankedSignals = [...signals]
    .filter((signal) => Boolean(signal.file))
    .sort((left, right) => evidenceSignalRank(left, options.changedFiles) - evidenceSignalRank(right, options.changedFiles)
      || String(left.file).localeCompare(String(right.file)));

  const visibleFiles: string[] = [];
  const hiddenFiles = new Set<string>();
  let primarySignal: EvidenceRecord | undefined;

  for (const signal of rankedSignals) {
    const file = signal.file;
    if (!file) continue;
    if (isHiddenEvidenceFile(file)) {
      hiddenFiles.add(file);
      continue;
    }
    if (!primarySignal) primarySignal = signal;
    if (!visibleFiles.includes(file)) {
      if (visibleFiles.length < limit) visibleFiles.push(file);
      else hiddenFiles.add(file);
    }
  }

  return {
    visibleFiles,
    hiddenFiles: [...hiddenFiles].sort(),
    primarySignal
  };
}

export function filterEvidenceFilesForDisplay(files: string[], limit = DEFAULT_VISIBLE_EVIDENCE_LIMIT): string[] {
  const visibleFiles: string[] = [];
  const rankedFiles = [...new Set(files.filter(Boolean))]
    .filter((file) => !isHiddenEvidenceFile(file))
    .map(safeEvidenceFilePath)
    .filter(Boolean)
    .sort((left, right) => evidenceFileRank(left) - evidenceFileRank(right) || left.localeCompare(right));
  for (const file of rankedFiles) {
    if (visibleFiles.length >= limit) break;
    visibleFiles.push(file);
  }
  return visibleFiles;
}

export function safeEvidenceFilePath(file = ''): string {
  const normalized = file.replace(/\\/g, '/');
  return normalized.startsWith('/') ? basename(normalized) : normalized;
}

export function isHiddenEvidenceFile(file = ''): boolean {
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

function evidenceSignalRank(signal: EvidenceRecord, changedFiles?: Set<string>): number {
  const file = signal.file ?? '';
  const liveChanged = changedFiles?.has(file) ? 0 : 100;
  const persistedChanged = !changedFiles && signal.changed ? 0 : 100;
  return Math.min(liveChanged, persistedChanged) + evidenceFileRank(file);
}

function evidenceFileRank(file = ''): number {
  if (isHiddenEvidenceFile(file)) return 10_000;
  if (file.startsWith('src/')) return 10;
  if (file === 'package.json' || /(^|\/)[^/]*(config|rc)\.[cm]?[jt]s(on)?$/i.test(file)) return 20;
  if (file === 'README.md') return 30;
  if (file.startsWith('docs/')) return 40;
  if (/test|spec|smoke/i.test(file) || file.startsWith('scripts/')) return 50;
  return 35;
}
