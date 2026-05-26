import { readFile } from 'node:fs/promises';
import { defaultPreferences, ensureLearnerStore, learnerPaths, readPreferences, readWeakTerms } from '../storage/user-store.js';
import { exists, readJsonl } from '../storage/fs-utils.js';
import { formatLearnerSummary } from '../format/learner.js';
import { buildProfileUpdateCandidates } from '../learner/profile-update-candidates.js';
import { buildWeakTermSuggestions } from '../learner/weak-term-suggestions.js';
import type { ConversationMemoryEvent, LearnerMemoryFileName, LearnerMemoryFileStatus, LearnerRecommendedAction, LearnerSummary, LearnerSummaryJson, LearnerSummarySafety, LearnerWeakTermSummary } from '../types.js';

const MAX_WEAK_TERMS = 10;
const MAX_RECENT_SIGNALS = 5;

export async function buildLearnerSummary(learner = 'default'): Promise<LearnerSummary> {
  await ensureLearnerStore(learner);
  const paths = learnerPaths(learner);
  const [preferences, weakTerms, signals, answers, profileUpdates, profileText] = await Promise.all([
    readPreferences(learner),
    readWeakTerms(learner),
    readJsonl<Record<string, unknown>>(paths.signals),
    readJsonl<Record<string, unknown>>(paths.answers),
    readJsonl<Record<string, unknown>>(paths.profileUpdates),
    readFile(paths.profile, 'utf8').catch(() => '')
  ]);

  const topWeakTerms = Object.entries(weakTerms)
    .sort((a, b) => b[1].askedCount - a[1].askedCount || String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))
    .slice(0, MAX_WEAK_TERMS)
    .map(([term, record]): LearnerWeakTermSummary => ({
      term,
      state: record.state,
      askedCount: record.askedCount,
      missingPieces: record.missingPieces,
      bestAnalogy: record.bestAnalogy,
      updatedAt: record.updatedAt
    }));

  const eventRecords = [...signals, ...answers, ...profileUpdates]
    .filter((event) => event.kind === 'conversation-memory' || typeof event.type === 'string' || typeof event.signalType === 'string')
    .sort((a, b) => String(b.recordedAt ?? b.answeredAt ?? '').localeCompare(String(a.recordedAt ?? a.answeredAt ?? '')));
  const recentSignals = eventRecords.slice(0, MAX_RECENT_SIGNALS).map(toRecentSignal);
  const weakTermSuggestions = buildWeakTermSuggestions(signals, weakTerms);
  const profileSections = extractProfileSections(profileText);
  const activePreferences = preferences ?? defaultPreferences;
  const profileUpdateCandidates = buildProfileUpdateCandidates(signals, {
    explanationOrder: activePreferences.explanationOrder,
    avoid: activePreferences.avoid,
    profileSections
  });
  const memoryFiles = await buildMemoryFiles(learner, {
    profile: 1,
    preferences: 1,
    weakTerms: Object.keys(weakTerms).length,
    signals: signals.length,
    answers: answers.length,
    profileUpdates: profileUpdates.length
  });

  const summaryWithoutMarkdown = {
    generatedAt: new Date().toISOString(),
    learner,
    memoryFiles,
    preferences: activePreferences,
    profileSections,
    topWeakTerms,
    weakTermSuggestions,
    profileUpdateCandidates,
    recentSignals,
    eventCounts: {
      signals: signals.length,
      answers: answers.length,
      profileUpdates: profileUpdates.length
    },
    recommendedActions: recommendedActions(topWeakTerms, recentSignals),
    safety: learnerSafety()
  } satisfies Omit<LearnerSummary, 'markdown'>;

  return {
    ...summaryWithoutMarkdown,
    markdown: formatLearnerSummary(summaryWithoutMarkdown)
  };
}

export function toLearnerSummaryJson(summary: LearnerSummary): LearnerSummaryJson {
  return {
    schemaVersion: 1,
    generatedAt: summary.generatedAt,
    learner: summary.learner,
    memoryFiles: summary.memoryFiles,
    preferences: summary.preferences,
    profileSections: summary.profileSections,
    topWeakTerms: summary.topWeakTerms,
    weakTermSuggestions: summary.weakTermSuggestions,
    profileUpdateCandidates: summary.profileUpdateCandidates,
    recentSignals: summary.recentSignals,
    eventCounts: summary.eventCounts,
    recommendedActions: summary.recommendedActions,
    safety: summary.safety
  };
}

async function buildMemoryFiles(learner: string, counts: Record<LearnerMemoryFileName, number>): Promise<LearnerMemoryFileStatus[]> {
  const paths = learnerPaths(learner);
  const entries: Array<[LearnerMemoryFileName, string]> = [
    ['profile', paths.profile],
    ['preferences', paths.preferences],
    ['weakTerms', paths.weakTerms],
    ['signals', paths.signals],
    ['answers', paths.answers],
    ['profileUpdates', paths.profileUpdates]
  ];
  return Promise.all(entries.map(async ([name, path]) => ({
    name,
    path: displayLearnerPath(path, learner),
    exists: await exists(path),
    records: counts[name]
  })));
}

function toRecentSignal(event: Record<string, unknown>): ConversationMemoryEvent {
  return stripUndefined({
    schemaVersion: 1 as const,
    kind: 'conversation-memory' as const,
    signalType: isConversationSignalType(event.signalType) ? event.signalType : 'why.answered',
    type: typeof event.type === 'string' ? event.type : undefined,
    command: isConversationCommand(event.command) ? event.command : 'why',
    learner: typeof event.learner === 'string' ? event.learner : 'default',
    conceptId: typeof event.conceptId === 'string' ? event.conceptId : undefined,
    conceptLabel: typeof event.conceptLabel === 'string' ? event.conceptLabel : typeof event.concept === 'string' ? event.concept : undefined,
    concept: typeof event.concept === 'string' ? event.concept : undefined,
    evidenceLevel: isEvidenceLevel(event.evidenceLevel) ? event.evidenceLevel : undefined,
    evidenceFiles: Array.isArray(event.evidenceFiles) ? event.evidenceFiles.filter((file): file is string => typeof file === 'string').slice(0, 5) : undefined,
    conceptCount: typeof event.conceptCount === 'number' ? event.conceptCount : undefined,
    recordedAt: typeof event.recordedAt === 'string' ? event.recordedAt : typeof event.answeredAt === 'string' ? event.answeredAt : undefined
  });
}

function recommendedActions(topWeakTerms: LearnerWeakTermSummary[], recentSignals: ConversationMemoryEvent[]): LearnerRecommendedAction[] {
  const actions: LearnerRecommendedAction[] = [];
  if (topWeakTerms.length === 0) {
    actions.push({ command: 'contextbook why "<concept>"', reason: '질문한 개념이 생기면 weak terms와 answers memory가 쌓입니다.' });
  } else {
    const first = topWeakTerms[0];
    actions.push({ command: `contextbook why "${first.term}"`, reason: `${first.term}은 최근 학습 메모리에 ${first.askedCount}회 기록된 개념입니다.` });
  }
  if (recentSignals.length === 0) {
    actions.push({ command: 'contextbook learn', reason: '프로젝트에서 배울 개념을 먼저 추천받으면 learner memory에 안전한 학습 이벤트가 기록됩니다.' });
  }
  actions.push({ command: 'contextbook profile', reason: '현재 learner profile과 conversation memory 요약을 사람이 직접 확인할 수 있습니다.' });
  return actions;
}

function extractProfileSections(profile: string): string[] {
  return profile
    .split(/\r?\n/)
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function displayLearnerPath(path: string, learner: string): string {
  const marker = `.contextbook/learners/${learner}/`;
  const index = path.lastIndexOf(marker);
  return index >= 0 ? `~/${path.slice(index)}` : path.split('/').pop() ?? path;
}

function learnerSafety(): LearnerSummarySafety {
  return {
    rawTranscriptIncluded: false,
    absolutePathsIncluded: false,
    profileMutated: false,
    preferencesMutated: false,
    weakTermsMutated: false,
    profileUpdatesMutated: false,
    unsafeJudgmentIncluded: false
  };
}

function isConversationSignalType(value: unknown): value is ConversationMemoryEvent['signalType'] {
  return value === 'scan.completed'
    || value === 'learn.generated'
    || value === 'why.answered'
    || value === 'profile.viewed'
    || value === 'profile.diff.viewed'
    || value === 'profile.edit.path-shown'
    || value === 'profile.edited'
    || value === 'profile.reset'
    || value === 'feedback.positive'
    || value === 'feedback.confused'
    || value === 'format.requested'
    || value === 'analogy.accepted'
    || value === 'analogy.rejected'
    || value === 'term.repeated'
    || value === 'profile-update.applied';
}

function isConversationCommand(value: unknown): value is ConversationMemoryEvent['command'] {
  return value === 'scan'
    || value === 'learn'
    || value === 'why'
    || value === 'profile'
    || value === 'profile.diff'
    || value === 'profile.edit'
    || value === 'profile.reset'
    || value === 'memory.add-signal'
    || value === 'memory.capture-prompt'
    || value === 'memory.signals'
    || value === 'memory.suggest-weak-terms'
    || value === 'memory.suggest-profile-updates'
    || value === 'memory.apply-profile-update'
    || value === 'memory.apply-preference-signals'
    || value === 'memory.context';
}

function isEvidenceLevel(value: unknown): value is ConversationMemoryEvent['evidenceLevel'] {
  return value === 'direct' || value === 'related' || value === 'general';
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
