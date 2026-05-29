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

export function isHiddenEvidenceFile(file = ''): boolean {
  return file.startsWith('docs/private/')
    || file.startsWith('.contextbook/')
    || file.startsWith('.omx/')
    || file.startsWith('dist/')
    || file.includes('/node_modules/')
    || file === 'node_modules';
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
