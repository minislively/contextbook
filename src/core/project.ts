import { basename } from 'node:path';
import { formatProjectSummary } from '../format/project.js';
import { exists } from '../storage/fs-utils.js';
import { projectPaths, readConcepts, readEvidence, readFileIndex, readScanRuns } from '../storage/project-store.js';
import type { ConceptRecord, ContextbookRuntimeOptions, EvidenceLevel, ProjectMemoryFileStatus, ProjectSummary } from '../types.js';

const evidenceWeight: Record<EvidenceLevel, number> = {
  direct: 3,
  related: 2,
  general: 1
};

export async function buildProjectSummary(options: ContextbookRuntimeOptions = {}): Promise<ProjectSummary> {
  const root = options.root ?? process.cwd();
  const [concepts, evidence, scanRuns, fileIndex] = await Promise.all([
    readConcepts(root),
    readEvidence(root),
    readScanRuns(root),
    readFileIndex(root)
  ]);
  const memoryFiles = await projectMemoryFileStatuses(root, {
    concepts: concepts.length,
    evidence: evidence.length,
    fileIndex: fileIndex.files.length,
    scanRuns: scanRuns.length
  });
  const sortedConcepts = [...concepts].sort(compareConcepts);
  const recentScanRuns = [...scanRuns].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)).slice(0, 3);
  const summary = {
    memoryFiles,
    concepts: sortedConcepts,
    recentScanRuns,
    fileIndex,
    evidenceCount: evidence.length
  };
  return {
    ...summary,
    markdown: formatProjectSummary(summary)
  };
}

async function projectMemoryFileStatuses(
  root: string,
  records: Partial<Record<ProjectMemoryFileStatus['name'], number>>
): Promise<ProjectMemoryFileStatus[]> {
  const paths = projectPaths(root);
  const files: Array<{ name: ProjectMemoryFileStatus['name']; path: string }> = [
    { name: 'config', path: paths.config },
    { name: 'concepts', path: paths.concepts },
    { name: 'evidence', path: paths.evidence },
    { name: 'fileIndex', path: paths.fileIndex },
    { name: 'scanRuns', path: paths.scanRuns }
  ];
  return Promise.all(files.map(async (file) => ({
    name: file.name,
    path: `.contextbook/project/${basename(file.path)}`,
    exists: await exists(file.path),
    records: records[file.name]
  })));
}

function compareConcepts(a: ConceptRecord, b: ConceptRecord): number {
  const changedDelta = Number(b.signals.some((signal) => signal.changed)) - Number(a.signals.some((signal) => signal.changed));
  if (changedDelta !== 0) return changedDelta;
  const evidenceDelta = evidenceWeight[b.evidenceLevel] - evidenceWeight[a.evidenceLevel];
  if (evidenceDelta !== 0) return evidenceDelta;
  const signalDelta = b.signals.length - a.signals.length;
  if (signalDelta !== 0) return signalDelta;
  const updatedDelta = b.updatedAt.localeCompare(a.updatedAt);
  if (updatedDelta !== 0) return updatedDelta;
  return a.label.localeCompare(b.label);
}
