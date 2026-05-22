import { mapEvidence } from '../concepts/mapper.js';
import { changedFiles } from '../scan/git-diff.js';
import { readPackageJson } from '../scan/package-json.js';
import { scanProjectFiles } from '../scan/read-files.js';
import { ensureProjectStore, recordScanRun, writeConcepts, writeEvidence, writeFileIndex } from '../storage/project-store.js';
import { recordConversationSignal } from '../learner/conversation-memory.js';
import type { ContextbookRuntimeOptions, ScanResult } from '../types.js';

export async function scanProject(options: ContextbookRuntimeOptions = {}): Promise<ScanResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  await ensureProjectStore(root);
  const scannedAt = new Date().toISOString();
  const { files, fileIndex, warnings } = await scanProjectFiles(root, 500, scannedAt);
  const changed = await changedFiles(root);
  const packageJson = await readPackageJson(root);
  const { concepts, evidence } = mapEvidence(files, { changedFiles: changed, packageJson });
  const scanId = `scan-${scannedAt.replace(/[:.]/g, '-')}`;

  await writeConcepts(concepts, root);
  await writeEvidence(evidence, root);
  await writeFileIndex(fileIndex, root);
  await recordScanRun({
    schemaVersion: 1,
    scanId,
    scannedAt,
    rootName: fileIndex.rootName,
    filesScanned: fileIndex.totals.scanned,
    bytesScanned: fileIndex.totals.bytesScanned,
    changedFiles: changed.size,
    conceptsDetected: concepts.length,
    evidenceDetected: evidence.length,
    warnings
  }, root);
  await recordConversationSignal({
    signalType: 'scan.completed',
    command: 'scan',
    learner,
    conceptCount: concepts.length,
    metadata: { evidence: evidence.length, changedFiles: changed.size, filesScanned: files.length }
  });

  return {
    filesScanned: files.length,
    conceptsDetected: concepts.length,
    evidenceDetected: evidence.length,
    changedFiles: changed.size,
    concepts,
    evidence
  };
}
