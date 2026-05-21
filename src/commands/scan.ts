import { mapEvidence } from '../concepts/mapper.js';
import { changedFiles } from '../scan/git-diff.js';
import { readProjectFiles } from '../scan/read-files.js';
import { ensureProjectStore, writeConcepts, writeEvidence } from '../storage/project-store.js';

export async function scanCommand(): Promise<void> {
  await ensureProjectStore();
  const files = await readProjectFiles();
  const changed = await changedFiles();
  const { concepts, evidence } = mapEvidence(files);
  await writeConcepts(concepts);
  await writeEvidence(evidence);
  console.log(`Scanned ${files.length} files.`);
  console.log(`Detected ${concepts.length} concepts and ${evidence.length} evidence records.`);
  if (changed.size) console.log(`Changed files considered: ${changed.size}`);
}
