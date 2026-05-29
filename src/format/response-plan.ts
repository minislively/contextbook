import { readJsonl } from '../storage/fs-utils.js';
import { learnerPaths } from '../storage/user-store.js';
import type { ConversationMemoryEvent, LearnerPreferences } from '../types.js';

const RECENT_SIGNAL_WINDOW = 20;
const ELIGIBLE_SIGNAL_TYPES = new Set(['feedback.confused', 'format.requested']);
const FORMAT_REQUESTS = ['plain', 'project-first', 'interview'] as const;
const SEMANTIC_KEYS = ['project', 'plain', 'developer', 'cs', 'interview'] as const;

type WhyLead = 'project' | 'plain' | 'interview' | 'uncertainty';
type WhyDensity = 'compact' | 'normal' | 'expanded';
type WhyEmphasis = typeof SEMANTIC_KEYS[number];
type WhyFormatRequest = typeof FORMAT_REQUESTS[number];

export interface WhyResponsePlan {
  /** Product-intent render control: which semantic atom should lead the answer. */
  lead: WhyLead;
  /** Product-intent render control: how compressed the answer body should be. */
  density: WhyDensity;
  /** Product-intent render control: preferred atom order after the lead. */
  emphasis: WhyEmphasis[];
  /** Render control: false when interview wording already leads the answer. */
  includeInterviewLine: boolean;
  /** Render control: compact evidence display keeps the visible file list short. */
  evidenceVisibility: 'compact' | 'normal';
  /** Diagnostic labels explaining why the plan was selected; not a renderer control. */
  reasons: string[];
}

export type WhyResponsePlanSignal = Pick<ConversationMemoryEvent, 'signalType' | 'metadata' | 'recordedAt'>;

export async function readEligibleWhyResponseSignals(learner = 'default'): Promise<WhyResponsePlanSignal[]> {
  const events = await readJsonl<Record<string, unknown>>(learnerPaths(learner).signals);
  return eligibleWhyResponseSignals(events);
}

export function eligibleWhyResponseSignals(events: Array<Record<string, unknown>>): WhyResponsePlanSignal[] {
  return events
    .filter((event) => typeof event.signalType === 'string' && ELIGIBLE_SIGNAL_TYPES.has(event.signalType))
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)))
    .slice(0, RECENT_SIGNAL_WINDOW)
    .map((event) => ({
      signalType: event.signalType as WhyResponsePlanSignal['signalType'],
      metadata: objectMetadata(event.metadata),
      recordedAt: typeof event.recordedAt === 'string' ? event.recordedAt : undefined
    }));
}

export function buildWhyResponsePlan(
  preferences: LearnerPreferences,
  eligibleSignals: WhyResponsePlanSignal[] = []
): WhyResponsePlan {
  const reasons = new Set<string>(['narrative-default']);
  const emphasis = normalizeEmphasis(preferences.explanationOrder);
  let lead: WhyLead = defaultLead(emphasis);
  let density: WhyDensity = preferences.outputLength === 'short' ? 'compact' : 'normal';
  let includeInterviewLine = lead !== 'interview';

  if (preferences.outputLength === 'short') reasons.add('preference-short-output');
  if (preferences.avoid?.some((item) => /abstract|lecture/i.test(item))) reasons.add('avoid-abstract-lecture');

  let latestFormat: WhyFormatRequest | undefined;

  for (const signal of eligibleSignals) {
    if (signal.signalType === 'feedback.confused') {
      lead = 'plain';
      density = 'compact';
      reasons.add('recent-confusion-feedback');
      reasons.add('plain-language');
    }
    if (signal.signalType === 'format.requested') {
      const format = typeof signal.metadata?.format === 'string' ? signal.metadata.format : '';
      if (isWhyFormatRequest(format)) {
        reasons.add(`format-requested:${format}`);
        if (!latestFormat) latestFormat = format;
      }
    }
  }

  if (latestFormat === 'plain') {
    lead = 'plain';
    reasons.add('plain-language');
  }
  if (latestFormat === 'project-first') lead = 'project';
  if (latestFormat === 'interview') lead = 'interview';
  includeInterviewLine = lead !== 'interview';

  return {
    lead,
    density,
    emphasis: moveLeadFirst(emphasis, lead),
    includeInterviewLine,
    evidenceVisibility: density === 'compact' ? 'compact' : 'normal',
    reasons: [...reasons]
  };
}

function normalizeEmphasis(order: string[] = []): WhyEmphasis[] {
  const aliases: Record<string, WhyEmphasis> = {
    'project-context': 'project',
    project: 'project',
    plain: 'plain',
    developer: 'developer',
    'developer-term': 'developer',
    cs: 'cs',
    'cs-link': 'cs',
    interview: 'interview',
    'interview-sentence': 'interview'
  };
  const seen = new Set<WhyEmphasis>();
  return [...order.map((key) => aliases[key]).filter(Boolean), ...SEMANTIC_KEYS]
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function defaultLead(emphasis: WhyEmphasis[]): WhyLead {
  const first = emphasis[0];
  return first === 'interview' ? 'interview' : first === 'plain' ? 'plain' : 'project';
}

function moveLeadFirst(emphasis: WhyEmphasis[], lead: WhyLead): WhyEmphasis[] {
  if (lead === 'uncertainty') return emphasis;
  const withoutLead = emphasis.filter((item) => item !== lead);
  return [lead, ...withoutLead];
}

function isWhyFormatRequest(value: string): value is WhyFormatRequest {
  return (FORMAT_REQUESTS as readonly string[]).includes(value);
}

function timestamp(event: Record<string, unknown>): string {
  return typeof event.recordedAt === 'string' ? event.recordedAt : typeof event.answeredAt === 'string' ? event.answeredAt : '';
}

function objectMetadata(value: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, string | number | boolean | null>;
}
