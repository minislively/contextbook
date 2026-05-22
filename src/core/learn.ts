import { formatLearningMoments } from '../format/explanation.js';
import { preferChangedFiles } from '../scan/file-signals.js';
import { changedFiles } from '../scan/git-diff.js';
import { readConcepts } from '../storage/project-store.js';
import type { ContextbookRuntimeOptions, LearnResult } from '../types.js';

export async function buildLearningMoments(options: ContextbookRuntimeOptions = {}): Promise<LearnResult> {
  const root = options.root ?? process.cwd();
  const concepts = await readConcepts(root);
  const changed = await changedFiles(root);
  const preferredConcepts = preferChangedFiles(concepts, changed);
  return {
    concepts: preferredConcepts,
    changedFiles: [...changed],
    markdown: formatLearningMoments(preferredConcepts)
  };
}
