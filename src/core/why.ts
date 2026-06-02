import { findConceptForQuestion, inferGeneralConcept } from '../concepts/mapper.js';
import { formatWhyAnswer } from '../format/explanation.js';
import { buildWhyResponsePlan, readEligibleWhyResponseSignals } from '../format/response-plan.js';
import { recordConversationAnswer } from '../learner/conversation-memory.js';
import { markAsked, weakTermForLabel } from '../learner/weak-terms.js';
import { readConcepts } from '../storage/project-store.js';
import { ensureLearnerStore, readPreferences, readWeakTerms } from '../storage/user-store.js';
import type { ContextbookRuntimeOptions, WhyResult } from '../types.js';

export interface WhyTarget {
  label: string;
  id?: string;
}

export async function answerWhy(question: string, options: ContextbookRuntimeOptions = {}): Promise<WhyResult> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) throw new Error('Usage: contextbook why "<question>"');

  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  await ensureLearnerStore(learner);
  const concepts = await readConcepts(root);
  const concept = findConceptForQuestion(trimmedQuestion, concepts);
  const fallback = concept ? undefined : inferGeneralConcept(trimmedQuestion);
  return answerResolvedWhy(trimmedQuestion, concept, fallback, learner);
}

export async function answerWhyTarget(target: WhyTarget, options: ContextbookRuntimeOptions = {}): Promise<WhyResult> {
  const trimmedQuestion = target.label.trim();
  if (!trimmedQuestion) throw new Error('Usage: contextbook why --from-report <index> [--day|--week|--since <date> --until <date>]');

  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  await ensureLearnerStore(learner);
  const concepts = await readConcepts(root);
  const concept = (target.id ? concepts.find((item) => item.id === target.id) : undefined)
    ?? findConceptForQuestion(trimmedQuestion, concepts);
  const fallback = concept ? undefined : inferGeneralConcept(trimmedQuestion);
  return answerResolvedWhy(trimmedQuestion, concept, fallback, learner);
}

async function answerResolvedWhy(
  trimmedQuestion: string,
  concept: Awaited<ReturnType<typeof readConcepts>>[number] | undefined,
  fallback: ReturnType<typeof inferGeneralConcept> | undefined,
  learner: string
): Promise<WhyResult> {
  const label = concept?.label ?? fallback?.label ?? trimmedQuestion;
  const evidenceLevel = concept?.evidenceLevel ?? 'general';
  const preferences = await readPreferences(learner);
  const weakTerms = await readWeakTerms(learner);
  const weakTerm = weakTermForLabel(weakTerms, label);
  const eligibleSignals = await readEligibleWhyResponseSignals(learner);
  const responsePlan = buildWhyResponsePlan(preferences, eligibleSignals, {
    question: trimmedQuestion,
    evidenceLevel,
    weakTerm
  });
  const markdown = formatWhyAnswer(trimmedQuestion, concept, fallback, preferences, responsePlan);

  await markAsked(label, learner);
  await recordConversationAnswer({ question: trimmedQuestion, concept: concept ?? fallback ?? { label, evidenceLevel }, learner });

  return {
    question: trimmedQuestion,
    concept: label,
    evidenceLevel,
    markdown
  };
}
