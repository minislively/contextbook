import { mapEvidence } from '../concepts/mapper.js';
import { changedFiles } from '../scan/git-diff.js';
import { readPackageJson } from '../scan/package-json.js';
import { readProjectFiles } from '../scan/read-files.js';
import { ensureProjectStore, writeConcepts, writeEvidence } from '../storage/project-store.js';
import { recordSignal } from '../storage/user-store.js';
import type { ContextbookRuntimeOptions, ScanResult } from '../types.js';

export async function scanProject(options: ContextbookRuntimeOptions = {}): Promise<ScanResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  await ensureProjectStore(root);
  const files = await readProjectFiles(root);
  const changed = await changedFiles(root);
  const packageJson = await readPackageJson(root);
  const { concepts, evidence } = mapEvidence(files, { changedFiles: changed, packageJson });

  await writeConcepts(concepts, root);
  await writeEvidence(evidence, root);
  await recordSignal({ type: 'scan', concepts: concepts.length, evidence: evidence.length, changedFiles: changed.size }, learner);

  return {
    filesScanned: files.length,
    conceptsDetected: concepts.length,
    evidenceDetected: evidence.length,
    changedFiles: changed.size,
    concepts,
    evidence
  };
}
