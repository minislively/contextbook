import { readFile } from 'node:fs/promises';
import { learnerPaths, readPreferences } from '../storage/user-store.js';
import { readJsonl } from '../storage/fs-utils.js';
import type {
  ConversationSignalType,
  LearnerPreferences,
  LearnerRecommendedAction,
  ProfileUpdateCandidate,
  ProfileUpdateCandidateReason,
  ProfileUpdateCandidatesJson,
  ProfileUpdateCandidatesSafety
} from '../types.js';

const MAX_CANDIDATES = 8;

type ProfileCandidateKind = 'project-first' | 'avoid-abstract' | 'format-style' | 'accepted-analogy' | 'rejected-analogy' | 'positive-pattern';

interface CandidateAccumulator {
  kind: ProfileCandidateKind;
  targetSection: ProfileUpdateCandidate['targetSection'];
  suggestion: string;
  signalCount: number;
  lastSeenAt?: string;
  reasons: Map<ProfileUpdateCandidateReason['code'], ProfileUpdateCandidateReason>;
}

interface ProfileContext {
  explanationOrder: string[];
  avoid: string[];
  profileSections: string[];
}

export async function profileUpdateCandidatesJson(learner = 'default'): Promise<ProfileUpdateCandidatesJson> {
  const paths = learnerPaths(learner);
  const [signals, preferences, profileText] = await Promise.all([
    readJsonl<Record<string, unknown>>(paths.signals),
    readPreferences(learner),
    readFile(paths.profile, 'utf8').catch(() => '')
  ]);
  const context = profileContext(preferences, profileText);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    candidates: buildProfileUpdateCandidates(signals, context),
    eventCounts: { signals: signals.length },
    safety: profileUpdateCandidatesSafety()
  };
}

export function buildProfileUpdateCandidates(
  signals: Array<Record<string, unknown>>,
  context: ProfileContext
): ProfileUpdateCandidate[] {
  const candidates = new Map<ProfileCandidateKind, CandidateAccumulator>();

  for (const signal of signals) {
    const signalType = asSignalType(signal.signalType) ?? asSignalType(signal.type);
    if (!signalType) continue;
    const metadata = objectMetadata(signal.metadata);
    const format = stringValue(metadata?.format);
    const note = stringValue(metadata?.note);

    if (signalType === 'format.requested') {
      if (isProjectFirst(format) || isProjectFirst(note)) {
        addReason(candidates, 'project-first', 'Preferred Explanation', 'Prefer project context before abstract terminology.', 'project-first-requested', signalType, 'project-first explanation was explicitly requested', signal);
      } else if (format) {
        addReason(candidates, 'format-style', 'Preferred Explanation', `Consider preserving the requested explanation format: ${format}.`, 'format-requested', signalType, `format requested: ${format}`, signal);
      }
    }

    if (signalType === 'feedback.confused' && includesAbstract(note)) {
      addReason(candidates, 'avoid-abstract', 'Avoid', 'Avoid abstract lecture-first explanations unless project context is already established.', 'abstract-confusion', signalType, 'confusion feedback mentioned abstract explanation', signal);
    }

    if (signalType === 'analogy.accepted') {
      const concept = conceptLabel(signal);
      addReason(candidates, 'accepted-analogy', 'Analogy Notes', `Keep using accepted analogies${concept ? ` for ${concept}` : ''} when explaining related concepts.`, 'analogy-accepted', signalType, 'an analogy was explicitly accepted', signal);
    }

    if (signalType === 'analogy.rejected') {
      const concept = conceptLabel(signal);
      addReason(candidates, 'rejected-analogy', 'Analogy Notes', `Avoid reusing rejected analogies${concept ? ` for ${concept}` : ''} unless the user asks for them again.`, 'analogy-rejected', signalType, 'an analogy was explicitly rejected', signal);
    }

    if (signalType === 'feedback.positive') {
      addReason(candidates, 'positive-pattern', 'Preferred Explanation', 'Preserve explanation styles that received explicit positive feedback.', 'positive-feedback', signalType, 'positive feedback was explicitly recorded', signal);
    }
  }

  return [...candidates.values()]
    .map((candidate) => toProfileUpdateCandidate(candidate, context))
    .sort((a, b) => confidenceScore(b.confidence) - confidenceScore(a.confidence) || b.signalCount - a.signalCount || String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')))
    .slice(0, MAX_CANDIDATES);
}

export function formatProfileUpdateCandidatesSummary(summary: ProfileUpdateCandidatesJson): string {
  const rows = summary.candidates.length
    ? summary.candidates.map((candidate, index) => {
      const reasons = candidate.reasons.map((reason) => `${reason.code} x${reason.count}`).join(', ');
      return `${index + 1}. ${candidate.targetSection} — ${candidate.confidence}\n   ${candidate.suggestion}\n   reasons: ${reasons}`;
    }).join('\n')
    : '아직 profile update candidate가 없습니다.';
  return [
    '# Profile Update Candidates',
    '',
    `- learner: ${summary.learner}`,
    `- signals read: ${summary.eventCounts.signals}`,
    '- 원칙: suggestion-only, profile/preferences 자동 변경 없음, 사용자 능력 단정 없음',
    '',
    rows
  ].join('\n');
}

function addReason(
  candidates: Map<ProfileCandidateKind, CandidateAccumulator>,
  kind: ProfileCandidateKind,
  targetSection: ProfileUpdateCandidate['targetSection'],
  suggestion: string,
  code: ProfileUpdateCandidateReason['code'],
  signalType: ConversationSignalType,
  detail: string,
  signal: Record<string, unknown>
): void {
  const candidate = candidates.get(kind) ?? {
    kind,
    targetSection,
    suggestion,
    signalCount: 0,
    lastSeenAt: undefined,
    reasons: new Map<ProfileUpdateCandidateReason['code'], ProfileUpdateCandidateReason>()
  };
  candidate.signalCount += 1;
  candidate.lastSeenAt = newest(candidate.lastSeenAt, timestamp(signal));
  const previous = candidate.reasons.get(code);
  candidate.reasons.set(code, {
    code,
    signalType,
    detail,
    count: (previous?.count ?? 0) + 1
  });
  candidates.set(kind, candidate);
}

function toProfileUpdateCandidate(candidate: CandidateAccumulator, context: ProfileContext): ProfileUpdateCandidate {
  return {
    targetSection: candidate.targetSection,
    suggestion: candidate.suggestion,
    confidence: confidence(candidate.signalCount),
    signalCount: candidate.signalCount,
    lastSeenAt: candidate.lastSeenAt,
    currentContext: context,
    reasons: [...candidate.reasons.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    recommendedActions: recommendedActions(candidate.targetSection)
  };
}

function recommendedActions(targetSection: ProfileUpdateCandidate['targetSection']): LearnerRecommendedAction[] {
  return [
    {
      command: 'contextbook profile',
      reason: `${targetSection} 후보를 현재 profile과 비교해 사람이 직접 확인합니다.`
    },
    {
      command: 'contextbook profile edit',
      reason: '후보가 맞다고 판단될 때만 명시적으로 profile을 수정합니다.'
    }
  ];
}

function profileContext(preferences: LearnerPreferences, profileText: string): ProfileContext {
  return {
    explanationOrder: preferences.explanationOrder,
    avoid: preferences.avoid,
    profileSections: profileText
      .split(/\r?\n/)
      .filter((line) => /^##\s+/.test(line))
      .map((line) => line.replace(/^##\s+/, '').trim())
      .filter(Boolean)
      .slice(0, 10)
  };
}

function conceptLabel(signal: Record<string, unknown>): string | undefined {
  const value = typeof signal.conceptLabel === 'string' ? signal.conceptLabel : typeof signal.concept === 'string' ? signal.concept : undefined;
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function objectMetadata(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || undefined : undefined;
}

function asSignalType(value: unknown): ConversationSignalType | undefined {
  return typeof value === 'string' && [
    'feedback.positive',
    'feedback.confused',
    'format.requested',
    'analogy.accepted',
    'analogy.rejected'
  ].includes(value) ? value as ConversationSignalType : undefined;
}

function timestamp(signal: Record<string, unknown>): string | undefined {
  return typeof signal.recordedAt === 'string' ? signal.recordedAt : typeof signal.answeredAt === 'string' ? signal.answeredAt : undefined;
}

function newest(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function isProjectFirst(value: string | undefined): boolean {
  return Boolean(value && /project[- ]?first|project context|프로젝트.*먼저|프로젝트.*우선/i.test(value));
}

function includesAbstract(value: string | undefined): boolean {
  return Boolean(value && /abstract|lecture first|too theoretical|추상|강의식/i.test(value));
}

function confidence(signalCount: number): ProfileUpdateCandidate['confidence'] {
  if (signalCount >= 3) return 'high';
  if (signalCount >= 2) return 'medium';
  return 'low';
}

function confidenceScore(value: ProfileUpdateCandidate['confidence']): number {
  return value === 'high' ? 3 : value === 'medium' ? 2 : 1;
}

function profileUpdateCandidatesSafety(): ProfileUpdateCandidatesSafety {
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
