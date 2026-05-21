import { findConceptForQuestion, inferGeneralConcept } from '../concepts/mapper.js';
import { formatWhyAnswer } from '../format/explanation.js';
import { markAsked } from '../learner/weak-terms.js';
import { readConcepts } from '../storage/project-store.js';
import { ensureLearnerStore, readPreferences, recordAnswer, recordSignal } from '../storage/user-store.js';

export async function whyCommand(args: string[]): Promise<void> {
  const question = args.join(' ').trim();
  if (!question) throw new Error('Usage: contextbook why "<question>"');
  await ensureLearnerStore('default');
  const concepts = await readConcepts();
  const concept = findConceptForQuestion(question, concepts);
  const fallback = concept ? undefined : inferGeneralConcept(question);
  const label = concept?.label ?? fallback?.label ?? question;
  const preferences = await readPreferences('default');
  const markdown = formatWhyAnswer(question, concept, fallback, preferences);
  await markAsked(label, 'default');
  await recordAnswer({ question, concept: label, evidenceLevel: concept?.evidenceLevel ?? 'general', answeredAt: new Date().toISOString() }, 'default');
  await recordSignal({ type: 'why', question, concept: label, evidenceLevel: concept?.evidenceLevel ?? 'general' }, 'default');
  console.log(markdown);
}
