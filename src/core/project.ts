import { basename } from 'node:path';
import { filterEvidenceFilesForDisplay, rankEvidenceForDisplay, DEFAULT_VISIBLE_EVIDENCE_LIMIT } from '../format/evidence.js';
import { formatProjectSummary } from '../format/project.js';
import { exists } from '../storage/fs-utils.js';
import { projectPaths, readConcepts, readEvidence, readFileIndex, readScanRuns } from '../storage/project-store.js';
import type {
  ConceptRecord,
  ContextbookRuntimeOptions,
  EvidenceLevel,
  ProjectRecommendedAction,
  ProjectMemoryFileStatus,
  ProjectSummary,
  ProjectSummaryConcept,
  ProjectSummaryJson
} from '../types.js';

const evidenceWeight: Record<EvidenceLevel, number> = {
  direct: 3,
  related: 2,
  general: 1
};

export async function buildProjectSummary(options: ContextbookRuntimeOptions = {}): Promise<ProjectSummary> {
  const root = options.root ?? process.cwd();
  const generatedAt = new Date().toISOString();
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
    generatedAt,
    rootName: fileIndex.rootName ?? basename(root),
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

export function toProjectSummaryJson(summary: ProjectSummary): ProjectSummaryJson {
  return {
    schemaVersion: 1,
    generatedAt: summary.generatedAt,
    rootName: summary.rootName,
    memoryFiles: summary.memoryFiles,
    topConcepts: summary.concepts.slice(0, 5).map(toProjectSummaryConcept),
    recentScanRuns: summary.recentScanRuns,
    fileIndexSummary: {
      generatedAt: summary.fileIndex.generatedAt,
      totals: summary.fileIndex.totals,
      sampleFiles: safeSampleFiles(summary.fileIndex.files)
    },
    evidenceCount: summary.evidenceCount,
    recommendedActions: projectRecommendedActions(summary),
    safety: {
      absolutePathsIncluded: false,
      hiddenContentIncluded: false,
      hiddenEvidencePathsFiltered: true,
      maxVisibleEvidenceFiles: DEFAULT_VISIBLE_EVIDENCE_LIMIT,
      profileMutated: false,
      persistedSummaryCreated: false
    }
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

function toProjectSummaryConcept(concept: ConceptRecord): ProjectSummaryConcept {
  return {
    id: concept.id,
    label: concept.label,
    evidenceLevel: concept.evidenceLevel,
    signalCount: concept.signals.length,
    changed: concept.signals.some((signal) => signal.changed),
    files: rankEvidenceForDisplay(concept.signals).visibleFiles,
    connectedConcepts: concept.connectedConcepts,
    interviewQuestion: concept.interviewQuestion
  };
}


function safeSampleFiles(files: ProjectSummary['fileIndex']['files']): ProjectSummary['fileIndex']['files'] {
  const safePaths = new Set(filterEvidenceFilesForDisplay(files.map((file) => file.path), 10));
  return files.filter((file) => safePaths.has(file.path)).slice(0, 10);
}

function projectRecommendedActions(summary: ProjectSummary): ProjectRecommendedAction[] {
  const actions: ProjectRecommendedAction[] = [];
  const hasProjectStore = summary.memoryFiles.some((file) => file.exists);
  if (!hasProjectStore) {
    actions.push({
      command: 'contextbook init',
      reason: 'Create project memory files before scanning this repository.'
    });
  }
  if (summary.recentScanRuns.length === 0) {
    actions.push({
      command: 'contextbook scan',
      reason: 'Collect current project evidence before generating learning moments.'
    });
  }
  if (summary.concepts.length > 0) {
    actions.push({
      command: 'contextbook learn',
      reason: 'Generate 1-3 learning moments from detected project concepts.'
    });
    actions.push({
      command: 'contextbook why "<concept>"',
      reason: 'Explain a detected concept with project evidence and interview wording.'
    });
  }
  if (summary.recentScanRuns[0]?.warnings.length) {
    actions.push({
      command: 'contextbook scan',
      reason: 'Review recent scan warnings and refresh evidence if needed.'
    });
  }
  return actions.length ? actions : [{
    command: 'contextbook learn',
    reason: 'Project Memory is ready for a learning card.'
  }];
}
