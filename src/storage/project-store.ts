import { join } from 'node:path';
import type { ConceptRecord, EvidenceRecord, ProjectConfig, ProjectFileIndex, ProjectScanRun } from '../types.js';
import { appendJsonl, ensureDir, readJson, writeIfMissing, writeJson } from './fs-utils.js';

export function projectRoot(): string {
  return process.cwd();
}

export function contextbookDir(root = projectRoot()): string {
  return join(root, '.contextbook');
}

export const projectPaths = (root = projectRoot()) => {
  const base = contextbookDir(root);
  return {
    base,
    project: join(base, 'project'),
    prompts: join(base, 'prompts'),
    config: join(base, 'project', 'config.json'),
    concepts: join(base, 'project', 'concepts.json'),
    evidence: join(base, 'project', 'evidence.jsonl'),
    fileIndex: join(base, 'project', 'file-index.json'),
    scanRuns: join(base, 'project', 'scan-runs.jsonl'),
    learnPrompt: join(base, 'prompts', 'learn.md'),
    whyPrompt: join(base, 'prompts', 'why.md')
  };
};

export async function ensureProjectStore(root = projectRoot()): Promise<void> {
  const paths = projectPaths(root);
  await ensureDir(paths.project);
  await ensureDir(paths.prompts);
  const now = new Date().toISOString();
  await writeIfMissing(paths.config, JSON.stringify({ version: '0.1.0', learner: 'default', createdAt: now } satisfies ProjectConfig, null, 2) + '\n');
  await writeIfMissing(paths.concepts, '[]\n');
  await writeIfMissing(paths.evidence, '');
  await writeIfMissing(paths.fileIndex, JSON.stringify(defaultFileIndex(), null, 2) + '\n');
  await writeIfMissing(paths.scanRuns, '');
  await writeIfMissing(paths.learnPrompt, '# Contextbook learn prompt\n\nRecommend 1-3 learning moments from project evidence.\n');
  await writeIfMissing(paths.whyPrompt, '# Contextbook why prompt\n\nExplain using project context, plain language, developer terms, CS link, and interview sentence.\n');
}

export async function readConcepts(root = projectRoot()): Promise<ConceptRecord[]> {
  return readJson<ConceptRecord[]>(projectPaths(root).concepts, []);
}

export async function writeConcepts(concepts: ConceptRecord[], root = projectRoot()): Promise<void> {
  await writeJson(projectPaths(root).concepts, concepts);
}

export async function writeEvidence(records: EvidenceRecord[], root = projectRoot()): Promise<void> {
  const lines = records.map((record) => JSON.stringify(record)).join('\n');
  await ensureDir(projectPaths(root).project);
  await import('node:fs/promises').then(({ writeFile }) => writeFile(projectPaths(root).evidence, lines ? `${lines}\n` : '', 'utf8'));
}

export function defaultFileIndex(): ProjectFileIndex {
  return {
    schemaVersion: 1,
    totals: {
      scanned: 0,
      skipped: 0,
      bytesScanned: 0
    },
    files: []
  };
}

export async function writeFileIndex(index: ProjectFileIndex, root = projectRoot()): Promise<void> {
  await writeJson(projectPaths(root).fileIndex, index);
}

export async function recordScanRun(run: ProjectScanRun, root = projectRoot()): Promise<void> {
  await appendJsonl(projectPaths(root).scanRuns, run);
}
