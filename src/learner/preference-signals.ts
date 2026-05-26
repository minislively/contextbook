import type {
  PreferenceApplyRoute,
  PreferenceConfidence,
  PreferenceExplicitness,
  PreferencePolarity,
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

export function classifyPreferenceSignals(prompt: string, source: PromptCaptureSource = 'manual'): PreferenceSignalCandidate[] {
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
      source
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

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}
