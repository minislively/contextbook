import { formatLearningMoments } from '../format/explanation.js';
import { recordConversationSignal } from '../learner/conversation-memory.js';
import { changedFiles } from '../scan/git-diff.js';
import { readConcepts } from '../storage/project-store.js';
import { rankLearningMoments } from './ranking.js';
import type { ContextbookRuntimeOptions, LearnResult } from '../types.js';

export async function buildLearningMoments(options: ContextbookRuntimeOptions = {}): Promise<LearnResult> {
  const root = options.root ?? process.cwd();
  const concepts = await readConcepts(root);
  const changed = await changedFiles(root);
  const moments = rankLearningMoments(concepts, changed).slice(0, 3);
  const preferredConcepts = moments.map((moment) => moment.concept);
  const markdown = formatLearningMoments(moments, { changedFiles: changed });
  await recordConversationSignal({
    signalType: 'learn.generated',
    command: 'learn',
    learner: options.learner ?? 'default',
    concept: preferredConcepts[0],
    conceptCount: preferredConcepts.length,
    metadata: { changedFiles: changed.size }
  });
  return {
    concepts: preferredConcepts,
    moments,
    changedFiles: [...changed],
    markdown
  };
}
