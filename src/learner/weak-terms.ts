import type { WeakTerms } from '../types.js';
import { readWeakTerms, writeWeakTerms } from '../storage/user-store.js';

export async function markAsked(term: string, learner = 'default'): Promise<void> {
  const terms: WeakTerms = await readWeakTerms(learner);
  const key = term.toLowerCase();
  const previous = terms[key];
  terms[key] = {
    state: previous?.state === 'ready' ? 'ready' : previous ? 'learning' : 'introduced',
    askedCount: (previous?.askedCount ?? 0) + 1,
    missingPieces: previous?.missingPieces,
    bestAnalogy: previous?.bestAnalogy,
    updatedAt: new Date().toISOString()
  };
  await writeWeakTerms(terms, learner);
}
