import type { WeakTermRecord, WeakTerms } from '../types.js';
import { readWeakTerms, writeWeakTerms } from '../storage/user-store.js';

export function weakTermKey(term: string): string {
  return term.toLowerCase();
}

export function weakTermForLabel(terms: WeakTerms, label: string): WeakTermRecord | undefined {
  return terms[weakTermKey(label)];
}

export async function markAsked(term: string, learner = 'default'): Promise<void> {
  const terms: WeakTerms = await readWeakTerms(learner);
  const key = weakTermKey(term);
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
