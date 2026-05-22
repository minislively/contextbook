import { buildLearningMoments } from '../core/learn.js';

export async function learnCommand(): Promise<void> {
  const result = await buildLearningMoments();
  console.log(result.markdown);
}
