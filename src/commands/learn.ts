import { preferChangedFiles } from '../scan/file-signals.js';
import { changedFiles } from '../scan/git-diff.js';
import { formatLearningMoments } from '../format/explanation.js';
import { readConcepts } from '../storage/project-store.js';

export async function learnCommand(): Promise<void> {
  const concepts = await readConcepts();
  const changed = await changedFiles();
  console.log(formatLearningMoments(preferChangedFiles(concepts, changed)));
}
