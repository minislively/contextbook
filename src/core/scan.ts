import { basename } from 'node:path';
import { mapEvidence } from '../concepts/mapper.js';
import { changedFiles } from '../scan/git-diff.js';
import { readPackageJson } from '../scan/package-json.js';
import { readProjectFiles } from '../scan/read-files.js';
import { ensureProjectStore, recordScanRun, writeConcepts, writeEvidence } from '../storage/project-store.js';
import { recordConversationSignal } from '../learner/conversation-memory.js';
import type { ContextbookRuntimeOptions, ScanResult } from '../types.js';

export async function scanProject(options: ContextbookRuntimeOptions = {}): Promise<ScanResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  await ensureProjectStore(root);
  const files = await readProjectFiles(root);
  const changed = await changedFiles(root);
  const packageJson = await readPackageJson(root);
  const { concepts, evidence } = mapEvidence(files, { changedFiles: changed, packageJson });
  const scannedAt = new Date().toISOString();
  const scanId = `scan-${scannedAt.replace(/[:.]/g, '-')}`;
  const bytesScanned = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);

  await writeConcepts(concepts, root);
  await writeEvidence(evidence, root);
  await recordScanRun({
    schemaVersion: 1,
    scanId,
    scannedAt,
    rootName: basename(root),
    filesScanned: files.length,
    bytesScanned,
    changedFiles: changed.size,
    conceptsDetected: concepts.length,
    evidenceDetected: evidence.length,
    warnings: []
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
