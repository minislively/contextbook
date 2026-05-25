import { addExplicitMemorySignal } from './conversation-memory.js';
import type {
  ConversationMemoryEvent,
  ConversationSignalType,
  PromptCaptureResult,
  PromptCaptureSafety,
  PromptCaptureSource,
  PromptSignalCandidate
} from '../types.js';

const MAX_CAPTURED_SIGNALS = 3;
const SOURCE_VALUES = ['manual', 'codex', 'claude-code'] as const satisfies readonly PromptCaptureSource[];

type CaptureSignalType = Extract<ConversationSignalType, 'feedback.positive' | 'feedback.confused' | 'format.requested' | 'analogy.accepted' | 'analogy.rejected'>;

interface CaptureRule {
  signalType: CaptureSignalType;
  code: string;
  note: string;
  format?: string;
  patterns: RegExp[];
}

const RULES: CaptureRule[] = [
  {
    signalType: 'feedback.confused',
    code: 'confusion-explicit',
    note: 'explicit confusion feedback',
    patterns: [/뭔\s*소리/i, /이해\s*(안|못)/i, /모르겠/i, /너무\s*추상/i, /too abstract/i, /confusing/i, /don'?t understand/i]
  },
  {
    signalType: 'format.requested',
    code: 'project-first-requested',
    note: 'project-first explanation requested',
    format: 'project-first',
    patterns: [/프로젝트에\s*빗대/i, /내\s*프로젝트/i, /project[-\s]?first/i, /project context/i]
  },
  {
    signalType: 'format.requested',
    code: 'interview-format-requested',
    note: 'interview wording requested',
    format: 'interview',
    patterns: [/면접\s*(문장|답변|식)/i, /interview/i]
  },
  {
    signalType: 'format.requested',
    code: 'plain-format-requested',
    note: 'plain explanation requested',
    format: 'plain',
    patterns: [/쉽게\s*말/i, /쉬운\s*말/i, /plain language/i, /explain simply/i]
  },
  {
    signalType: 'analogy.accepted',
    code: 'analogy-accepted-explicit',
    note: 'analogy accepted explicitly',
    patterns: [/비유\s*(좋|괜찮|먹힘)/i, /analogy\s*(works|good|helpful)/i]
  },
  {
    signalType: 'analogy.rejected',
    code: 'analogy-rejected-explicit',
    note: 'analogy rejected explicitly',
    patterns: [/비유\s*(별로|이상|안\s*맞)/i, /bad analogy/i, /analogy\s*(bad|wrong|doesn'?t work)/i]
  },
  {
    signalType: 'feedback.positive',
    code: 'positive-feedback-explicit',
    note: 'explicit positive feedback',
    patterns: [/좋다/i, /좋았/i, /이해\s*(됨|됐|했)/i, /good explanation/i, /makes sense/i, /understood/i]
  }
];

export interface CapturePromptOptions {
  prompt: string;
  source?: PromptCaptureSource;
  learner?: string;
}

export function isPromptCaptureSource(value: string): value is PromptCaptureSource {
  return (SOURCE_VALUES as readonly string[]).includes(value);
}

export function classifyPromptSignals(prompt: string, source: PromptCaptureSource = 'manual'): PromptSignalCandidate[] {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return [];
  const seen = new Set<string>();
  const candidates: PromptSignalCandidate[] = [];
  for (const rule of RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(normalized))) continue;
    const key = `${rule.signalType}:${rule.format ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      signalType: rule.signalType,
      note: rule.note,
      format: rule.format,
      source,
      reason: rule.code
    });
    if (candidates.length >= MAX_CAPTURED_SIGNALS) break;
  }
  return candidates;
}

export async function capturePromptSignals(options: CapturePromptOptions): Promise<PromptCaptureResult> {
  const source = options.source ?? 'manual';
  const learner = options.learner ?? 'default';
  const candidates = classifyPromptSignals(options.prompt, source);
  const capturedSignals: ConversationMemoryEvent[] = [];
  for (const candidate of candidates) {
    capturedSignals.push(await addExplicitMemorySignal({
      signalType: candidate.signalType,
      learner,
      note: candidate.note,
      format: candidate.format,
      command: 'memory.capture-prompt',
      metadata: {
        source,
        capturedBy: 'capture-prompt',
        reason: candidate.reason
      }
    }));
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    source,
    capturedSignals,
    skippedReasons: capturedSignals.length ? [] : ['no-explicit-learning-signal'],
    safety: promptCaptureSafety()
  };
}

export function formatPromptCaptureSummary(result: PromptCaptureResult): string {
  const captured = result.capturedSignals.map((signal) => `- ${signal.signalType}${signal.metadata?.format ? ` (${signal.metadata.format})` : ''}`).join('\n') || '- none';
  const skipped = result.skippedReasons.map((reason) => `- ${reason}`).join('\n') || '- none';
  return [
    '# Prompt Signal Capture',
    '',
    `- learner: ${result.learner}`,
    `- source: ${result.source}`,
    `- captured: ${result.capturedSignals.length}`,
    '',
    '## Captured Signals',
    captured,
    '',
    '## Skipped Reasons',
    skipped,
    '',
    '## Safety',
    `- raw transcript included: ${result.safety.rawTranscriptIncluded}`,
    `- raw prompt persisted: ${result.safety.rawPromptPersisted}`,
    `- profile mutated: ${result.safety.profileMutated}`,
    `- weak terms mutated: ${result.safety.weakTermsMutated}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated}`
  ].join('\n');
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}

function promptCaptureSafety(): PromptCaptureSafety {
  return {
    rawTranscriptIncluded: false,
    rawPromptPersisted: false,
    absolutePathsIncluded: false,
    profileMutated: false,
    preferencesMutated: false,
    weakTermsMutated: false,
    projectMemoryMutated: false,
    unsafeJudgmentIncluded: false
  };
}
