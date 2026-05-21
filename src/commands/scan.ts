import { mapEvidence } from '../concepts/mapper.js';
import { changedFiles } from '../scan/git-diff.js';
import { readPackageJson } from '../scan/package-json.js';
import { readProjectFiles } from '../scan/read-files.js';
import { ensureProjectStore, writeConcepts, writeEvidence } from '../storage/project-store.js';
import { recordSignal } from '../storage/user-store.js';

export async function scanCommand(): Promise<void> {
  await ensureProjectStore();
  const files = await readProjectFiles();
  const changed = await changedFiles();
  const packageJson = await readPackageJson();
  const { concepts, evidence } = mapEvidence(files, { changedFiles: changed, packageJson });
  await writeConcepts(concepts);
  await writeEvidence(evidence);
  await recordSignal({ type: 'scan', concepts: concepts.length, evidence: evidence.length, changedFiles: changed.size }, 'default');
  console.log(`Scanned ${files.length} files.`);
  console.log(`Detected ${concepts.length} concepts and ${evidence.length} evidence records.`);
  if (changed.size) console.log(`Changed files considered: ${changed.size}`);
}
