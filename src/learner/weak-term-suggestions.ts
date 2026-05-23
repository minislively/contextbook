import { learnerPaths, readWeakTerms } from '../storage/user-store.js';
import { readJsonl } from '../storage/fs-utils.js';
import type {
  ConversationMemoryEvent,
  ConversationSignalType,
  LearnerRecommendedAction,
  LearnerWeakTermSummary,
  WeakTermRecord,
  WeakTermSuggestionCandidate,
  WeakTermSuggestionReason,
  WeakTermSuggestionsJson,
  WeakTermSuggestionsSafety
} from '../types.js';

const MAX_CANDIDATES = 10;
const MAX_REASONS = 6;

const SIGNAL_WEIGHTS: Partial<Record<ConversationSignalType, number>> = {
  'feedback.confused': 3,
  'term.repeated': 3,
  'analogy.rejected': 2,
  'format.requested': 1,
  'why.answered': 1,
  'feedback.positive': -1,
  'analogy.accepted': -1
};

const SIGNAL_DETAILS: Partial<Record<ConversationSignalType, string>> = {
  'feedback.confused': 'confusion feedback was explicitly recorded',
  'term.repeated': 'the term was explicitly marked as repeated',
  'analogy.rejected': 'a previous analogy was rejected',
  'format.requested': 'the learner requested a specific explanation format',
  'why.answered': 'the concept was recently asked about',
  'feedback.positive': 'positive feedback reduces review urgency',
  'analogy.accepted': 'an accepted analogy reduces review urgency'
};

const SIGNAL_REASON_CODES: Partial<Record<ConversationSignalType, WeakTermSuggestionReason['code']>> = {
  'feedback.confused': 'confused-feedback',
  'term.repeated': 'repeated-term',
  'analogy.rejected': 'analogy-rejected',
  'format.requested': 'format-requested',
  'why.answered': 'recent-question',
  'feedback.positive': 'positive-feedback',
  'analogy.accepted': 'analogy-accepted'
};

interface CandidateAccumulator {
  term: string;
  normalized: string;
  score: number;
  signalCount: number;
  lastSeenAt?: string;
  reasonCounts: Map<ConversationSignalType, number>;
}

export async function weakTermSuggestionsJson(learner = 'default'): Promise<WeakTermSuggestionsJson> {
  const paths = learnerPaths(learner);
  const [signals, weakTerms] = await Promise.all([
    readJsonl<Record<string, unknown>>(paths.signals),
    readWeakTerms(learner)
  ]);
  const candidates = buildWeakTermSuggestions(signals, weakTerms);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    candidates,
    eventCounts: { signals: signals.length },
    safety: weakTermSuggestionsSafety()
  };
}

export function buildWeakTermSuggestions(
  signals: Array<Record<string, unknown>>,
  weakTerms: Record<string, WeakTermRecord>
): WeakTermSuggestionCandidate[] {
  const candidates = new Map<string, CandidateAccumulator>();

  for (const signal of signals) {
    const signalType = asSignalType(signal.signalType) ?? asSignalType(signal.type);
    if (!signalType || SIGNAL_WEIGHTS[signalType] === undefined) continue;

    const term = conceptLabel(signal);
    if (!term) continue;

    const normalized = normalizeTerm(term);
    const candidate = candidates.get(normalized) ?? {
      term,
      normalized,
      score: 0,
      signalCount: 0,
      lastSeenAt: undefined,
      reasonCounts: new Map<ConversationSignalType, number>()
    };
    candidate.score += SIGNAL_WEIGHTS[signalType] ?? 0;
    candidate.signalCount += 1;
    candidate.lastSeenAt = newest(candidate.lastSeenAt, timestamp(signal));
    candidate.reasonCounts.set(signalType, (candidate.reasonCounts.get(signalType) ?? 0) + 1);
    candidates.set(normalized, candidate);
  }

  for (const [term, record] of Object.entries(weakTerms)) {
    const normalized = normalizeTerm(term);
    const candidate = candidates.get(normalized);
    if (!candidate) continue;
    candidate.score += weakTermContextWeight(record);
  }

  return [...candidates.values()]
    .map((candidate) => toSuggestionCandidate(candidate, weakTerms[candidate.normalized]))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')) || a.term.localeCompare(b.term))
    .slice(0, MAX_CANDIDATES);
}

export function formatWeakTermSuggestionsSummary(summary: WeakTermSuggestionsJson): string {
  const rows = summary.candidates.length
    ? summary.candidates.map((candidate, index) => {
      const reasons = candidate.reasons.map((reason) => `${reason.code} x${reason.count}`).join(', ');
      return `${index + 1}. ${candidate.term} — ${candidate.urgency}, score ${candidate.score} (${reasons})`;
    }).join('\n')
    : '아직 weak-term suggestion 후보가 없습니다.';
  return [
    '# Weak-term Suggestions',
    '',
    `- learner: ${summary.learner}`,
    `- signals read: ${summary.eventCounts.signals}`,
    '- 원칙: suggestion-only, weak-terms/profile 자동 변경 없음, 사용자 능력 단정 없음',
    '',
    rows
  ].join('\n');
}

function toSuggestionCandidate(candidate: CandidateAccumulator, existing?: WeakTermRecord): WeakTermSuggestionCandidate {
  const existingWeakTerm = existing ? toWeakTermSummary(candidate.normalized, existing) : undefined;
  const reasons = [...candidate.reasonCounts.entries()]
    .map(([signalType, count]) => toReason(signalType, count))
    .filter((reason): reason is WeakTermSuggestionReason => Boolean(reason))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.code.localeCompare(b.code))
    .slice(0, MAX_REASONS);
  if (existing) {
    reasons.push({
      code: 'existing-weak-term',
      weight: weakTermContextWeight(existing),
      detail: `already stored as ${existing.state}`,
      count: 1
    });
  }
  return {
    term: candidate.term,
    score: Math.max(0, candidate.score),
    urgency: urgency(candidate.score),
    signalCount: candidate.signalCount,
    lastSeenAt: candidate.lastSeenAt,
    existingWeakTerm,
    reasons,
    recommendedActions: recommendedActions(candidate.term)
  };
}

function toReason(signalType: ConversationSignalType, count: number): WeakTermSuggestionReason | undefined {
  const weight = SIGNAL_WEIGHTS[signalType];
  const code = SIGNAL_REASON_CODES[signalType];
  const detail = SIGNAL_DETAILS[signalType];
  if (weight === undefined || !code || !detail) return undefined;
  return {
    code,
    signalType,
    weight,
    detail,
    count
  };
}

function recommendedActions(term: string): LearnerRecommendedAction[] {
  return [
    {
      command: `contextbook why ${JSON.stringify(term)}`,
      reason: `${term}을 프로젝트 말로 다시 설명해 review 후보인지 확인합니다.`
    },
    {
      command: `contextbook memory add-signal --type feedback.positive --concept ${JSON.stringify(term)}`,
      reason: '설명이 잘 맞으면 positive signal을 남겨 다음 suggestion urgency를 낮출 수 있습니다.'
    }
  ];
}

function toWeakTermSummary(term: string, record: WeakTermRecord): LearnerWeakTermSummary {
  return {
    term,
    state: record.state,
    askedCount: record.askedCount,
    missingPieces: record.missingPieces,
    bestAnalogy: record.bestAnalogy,
    updatedAt: record.updatedAt
  };
}

function conceptLabel(signal: Record<string, unknown>): string | undefined {
  const value = typeof signal.conceptLabel === 'string' ? signal.conceptLabel : typeof signal.concept === 'string' ? signal.concept : undefined;
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, ' ').trim().toLowerCase();
}

function timestamp(signal: Record<string, unknown>): string | undefined {
  return typeof signal.recordedAt === 'string' ? signal.recordedAt : typeof signal.answeredAt === 'string' ? signal.answeredAt : undefined;
}

function newest(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function asSignalType(value: unknown): ConversationMemoryEvent['signalType'] | undefined {
  return typeof value === 'string' && value in SIGNAL_WEIGHTS ? value as ConversationSignalType : undefined;
}

function weakTermContextWeight(record: WeakTermRecord): number {
  if (record.state === 'ready') return -1;
  if (record.state === 'drill') return 2;
  if (record.state === 'learning') return 1;
  return 0;
}

function urgency(score: number): WeakTermSuggestionCandidate['urgency'] {
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function weakTermSuggestionsSafety(): WeakTermSuggestionsSafety {
  return {
    rawTranscriptIncluded: false,
    absolutePathsIncluded: false,
    profileMutated: false,
    weakTermsMutated: false,
    unsafeJudgmentIncluded: false
  };
}
