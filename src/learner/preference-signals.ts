import type {
  PreferenceApplyRoute,
  PreferenceConfidence,
  PreferenceExplicitness,
  PreferenceIntent,
  PreferencePolicy,
  PreferencePolarity,
  PreferenceRisk,
  PreferenceScope,
  PreferenceScopeEvidenceCode,
  PreferenceSignalCandidate,
  PreferenceSignalCounts,
  PromptCaptureSource
} from '../types.js';

interface PreferenceRule {
  dimension: string;
  value: string;
  polarity: PreferencePolarity;
  explicitness: PreferenceExplicitness;
  confidence: PreferenceConfidence;
  route: PreferenceApplyRoute;
  reason: string;
  patterns: RegExp[];
}

export interface PreferenceSignalContext {
  explicitApplyCommand?: boolean;
}

interface PreferenceIntentPolicy {
  intent: PreferenceIntent;
  scope: PreferenceScope;
  risk: PreferenceRisk;
  policy: PreferencePolicy;
  scopeEvidence: PreferenceScopeEvidenceCode[];
}

const RULES: PreferenceRule[] = [
  {
    dimension: 'avoid',
    value: 'abstract-lecture-first',
    polarity: 'negative',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly asks to avoid abstract or lecture-first explanations',
    patterns: [/너무\s*추상/i, /추상적/i, /추상\s*(용어|설명)/i, /강의식/i, /abstract/i, /lecture[-\s]?first/i]
  },
  {
    dimension: 'explanation.order',
    value: 'project-first',
    polarity: 'positive',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly asks for project-first explanation',
    patterns: [/내\s*프로젝트/i, /프로젝트(의|를|에|랑|에서|\s)*(코드\s*)?(기준|맥락|상황)/i, /프로젝트에\s*빗대/i, /project[-\s]?first/i, /project context/i]
  },
  {
    dimension: 'explanation.style',
    value: 'plain-language',
    polarity: 'positive',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly asks for simple/plain wording',
    patterns: [/쉽게\s*(말|설명)/i, /쉬운\s*말/i, /쉽게$/i, /plain language/i, /explain simply/i, /simple explanation/i]
  },
  {
    dimension: 'output.section',
    value: 'interview-sentence',
    polarity: 'positive',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly asks for interview-ready wording',
    patterns: [/면접\s*(문장|답변|식|용)/i, /interview\s*(sentence|answer|wording)/i]
  },
  {
    dimension: 'output.length',
    value: 'short',
    polarity: 'positive',
    explicitness: 'explicit',
    confidence: 'medium',
    route: 'auto-apply-safe',
    reason: 'explicitly asks for shorter or compressed output',
    patterns: [/짧게/i, /압축/i, /간결/i, /요약/i, /short/i, /concise/i, /compress/i]
  },
  {
    dimension: 'command.volume',
    value: 'fewer-commands',
    polarity: 'negative',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly asks to avoid too many commands',
    patterns: [/명령어.{0,12}(너무\s*)?(많|불편|싫)/i, /(too many|fewer|less).{0,16}commands/i, /commands?.{0,16}(too many|overwhelming)/i]
  },
  {
    dimension: 'language',
    value: 'ko',
    polarity: 'positive',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly prefers Korean output',
    patterns: [/한국어(로|가|를)?/i, /한글(로|이)?/i, /영어보다\s*한국어/i, /in korean/i, /korean/i]
  },
  {
    dimension: 'language',
    value: 'en',
    polarity: 'positive',
    explicitness: 'explicit',
    confidence: 'high',
    route: 'auto-apply-safe',
    reason: 'explicitly prefers English output',
    patterns: [/영어로/i, /영문으로/i, /in english/i, /english/i]
  },
  {
    dimension: 'self-assessment',
    value: 'self-disclosed-friction',
    polarity: 'neutral',
    explicitness: 'explicit',
    confidence: 'medium',
    route: 'signal-only',
    reason: 'self-assessment is kept out of automatic preference updates',
    patterns: [/나는.{0,8}(초보|입문|못해|못해서|이해력.{0,6}낮)/i, /내가.{0,8}(초보|입문|못해|못해서|이해력.{0,6}낮)/i, /cs를?\s*못/i, /이해력.{0,8}낮/i, /\b(i am|i'm).{0,12}(beginner|bad at|not good at)/i]
  }
];

const TASK_LOCAL_PATTERNS = [/이번\s*(답변|턴|질문|한번|엔|에는)?만/i, /지금(은|만)?/i, /이번엔/i, /for this (answer|turn|time)/i, /this time/i, /just this once/i];
const UNCERTAINTY_PATTERNS = [/나을까/i, /괜찮을까/i, /맞을까/i, /어떻게\s*생각/i, /추천/i, /should i/i, /would it be better/i, /what do you think/i];
const EXPLICIT_PREFERENCE_PATTERNS = [/내\s*선호/i, /나는.{0,12}(좋아|선호|싫어|불편)/i, /나한테/i, /i\s*prefer/i, /my preference/i, /i\s*(like|hate)/i];
const STYLE_CONTINUITY_PATTERNS = [/계속\s*(이렇게|그렇게)/i, /이\s*스타일\s*유지/i, /앞으로도/i, /기본값/i, /default/i, /keep\s*(this|that)/i];
const CORRECTION_PATTERNS = [/그게\s*아니/i, /아니\s*(그|이)?/i, /별로/i, /too\s*(long|abstract|many)/i, /not\s*like\s*that/i, /instead/i];

export function classifyPreferenceSignals(prompt: string, source: PromptCaptureSource = 'manual', context: PreferenceSignalContext = {}): PreferenceSignalCandidate[] {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return [];
  const seen = new Set<string>();
  const candidates: PreferenceSignalCandidate[] = [];
  for (const rule of RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(normalized))) continue;
    const key = `${rule.dimension}:${rule.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      dimension: rule.dimension,
      value: rule.value,
      polarity: rule.polarity,
      explicitness: rule.explicitness,
      confidence: rule.confidence,
      route: rule.route,
      reason: rule.reason,
      source,
      ...classifyIntentPolicy(normalized, rule, context)
    });
  }
  return candidates;
}

export function preferenceSignalCounts(signals: PreferenceSignalCandidate[]): PreferenceSignalCounts {
  return {
    autoApplySafe: signals.filter((signal) => signal.route === 'auto-apply-safe').length,
    candidateOnly: signals.filter((signal) => signal.route === 'candidate-only').length,
    signalOnly: signals.filter((signal) => signal.route === 'signal-only').length,
    ignored: signals.filter((signal) => signal.route === 'ignore').length
  };
}

function classifyIntentPolicy(normalized: string, rule: PreferenceRule, context: PreferenceSignalContext): PreferenceIntentPolicy {
  const evidence: PreferenceScopeEvidenceCode[] = ['slot-detected'];
  const taskLocal = matchesAny(TASK_LOCAL_PATTERNS, normalized);
  const uncertainty = matchesAny(UNCERTAINTY_PATTERNS, normalized);
  const explicitPreference = matchesAny(EXPLICIT_PREFERENCE_PATTERNS, normalized);
  const styleContinuity = matchesAny(STYLE_CONTINUITY_PATTERNS, normalized);
  const correction = matchesAny(CORRECTION_PATTERNS, normalized);
  const negativeConstraint = rule.polarity === 'negative' || rule.dimension === 'avoid' || rule.dimension === 'command.volume';

  if (taskLocal) evidence.push('task-local-cue');
  if (uncertainty) evidence.push('uncertainty-cue');
  if (explicitPreference) evidence.push('explicit-preference-framing');
  if (styleContinuity) evidence.push('style-continuity');
  if (correction) evidence.push('correction-feedback');
  if (negativeConstraint) evidence.push('negative-constraint');
  if (context.explicitApplyCommand) evidence.push('explicit-apply-command');

  if (rule.dimension === 'self-assessment') {
    return {
      intent: 'unsafe-self-assessment',
      scope: 'turn-local',
      risk: 'high',
      policy: 'observe-only',
      scopeEvidence: uniqueEvidence([...evidence, 'unsafe-self-assessment'])
    };
  }

  if (taskLocal) {
    return {
      intent: 'turn-format-request',
      scope: 'turn-local',
      risk: 'medium',
      policy: 'observe-only',
      scopeEvidence: uniqueEvidence(evidence)
    };
  }

  if (uncertainty) {
    return {
      intent: 'meta-question',
      scope: 'turn-local',
      risk: 'medium',
      policy: 'observe-only',
      scopeEvidence: uniqueEvidence(evidence)
    };
  }

  if (context.explicitApplyCommand && rule.route === 'auto-apply-safe') {
    return {
      intent: explicitPreference || styleContinuity || negativeConstraint ? 'preference-statement' : 'session-style-request',
      scope: 'persistent-explicit',
      risk: 'low',
      policy: 'apply-eligible',
      scopeEvidence: uniqueEvidence(evidence)
    };
  }

  if (correction) {
    return {
      intent: 'correction-feedback',
      scope: negativeConstraint ? 'persistent-candidate' : 'session-local',
      risk: negativeConstraint ? 'low' : 'medium',
      policy: negativeConstraint ? 'dry-run-only' : 'suggest-only',
      scopeEvidence: uniqueEvidence(evidence)
    };
  }

  if (explicitPreference || styleContinuity || negativeConstraint) {
    return {
      intent: 'preference-statement',
      scope: 'persistent-candidate',
      risk: 'low',
      policy: 'dry-run-only',
      scopeEvidence: uniqueEvidence(evidence)
    };
  }

  return {
    intent: 'session-style-request',
    scope: 'session-local',
    risk: 'medium',
    policy: 'suggest-only',
    scopeEvidence: uniqueEvidence(evidence)
  };
}

function matchesAny(patterns: RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function uniqueEvidence(evidence: PreferenceScopeEvidenceCode[]): PreferenceScopeEvidenceCode[] {
  return [...new Set(evidence)];
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}
