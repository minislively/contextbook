import { addExplicitMemorySignal } from './conversation-memory.js';
import { classifyPreferenceSignals, preferenceSignalCounts } from './preference-signals.js';
import { buildMemoryContext } from '../core/memory-context.js';
import type {
  ConversationMemoryEvent,
  ConversationSignalType,
  HookSuggestMemoryContext,
  HookSuggestRecommendedAction,
  HookSuggestResult,
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
  includeMemoryContext?: boolean;
  captureSignals?: boolean;
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
  const preferenceSignals = classifyPreferenceSignals(options.prompt, source);
  const capturedSignals: ConversationMemoryEvent[] = [];
  if (options.captureSignals !== false) {
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
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    source,
    capturedSignals,
    preferenceSignals,
    preferenceSignalCounts: preferenceSignalCounts(preferenceSignals),
    skippedReasons: capturedSignals.length || preferenceSignals.length ? [] : candidates.length > 0 && options.captureSignals === false ? ['capture-disabled'] : ['no-explicit-learning-signal'],
    safety: promptCaptureSafety()
  };
}

export async function hookSuggest(options: CapturePromptOptions): Promise<HookSuggestResult> {
  const capture = await capturePromptSignals(options);
  const memoryContext = await hookMemoryContext(options.prompt, capture.learner, options.includeMemoryContext === true);
  const recommendedActions = hookRecommendedActions(capture);
  const actionable = recommendedActions.length > 0 || capture.preferenceSignals.length > 0 || memoryContext.included;
  return {
    schemaVersion: 1,
    generatedAt: capture.generatedAt,
    learner: capture.learner,
    source: capture.source,
    actionable,
    capturedSignalsCount: capture.capturedSignals.length,
    preferenceSignals: capture.preferenceSignals,
    memoryContext,
    recommendedActions,
    additionalContext: actionable ? formatHookAdditionalContext(capture, recommendedActions, memoryContext) : '',
    skippedReasons: actionable ? [] : capture.skippedReasons,
    safety: {
      rawTranscriptIncluded: false,
      rawPromptIncluded: false,
      rawPromptPersisted: false,
      absolutePathsIncluded: false,
      profileMutated: false,
      preferencesMutated: false,
      weakTermsMutated: false,
      projectMemoryMutated: false,
      unsafeJudgmentIncluded: false,
      hookBlocksAgent: false
    }
  };
}

export function formatHookSuggestSummary(result: HookSuggestResult): string {
  if (!result.actionable) return '';
  return result.additionalContext;
}

export function formatPromptCaptureSummary(result: PromptCaptureResult): string {
  const captured = result.capturedSignals.map((signal) => `- ${signal.signalType}${signal.metadata?.format ? ` (${signal.metadata.format})` : ''}`).join('\n') || '- none';
  const preferenceSignals = result.preferenceSignals.map((signal) => `- ${signal.dimension}=${signal.value} (${signal.route}, ${signal.scope}, ${signal.policy})`).join('\n') || '- none';
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
    '## Preference Signals',
    preferenceSignals,
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

function hookRecommendedActions(result: PromptCaptureResult): HookSuggestRecommendedAction[] {
  const actions: HookSuggestRecommendedAction[] = [];
  if (result.capturedSignals.length > 0) {
    actions.push({
      command: 'contextbook memory suggest-profile-updates --json',
      reason: 'Captured conversation-memory signals may produce profile update candidates.',
      approvalRequired: true
    });
  }
  if (result.preferenceSignals.length > 0) {
    actions.push({
      command: `contextbook memory apply-preference-signals --prompt "<current user prompt>" --source ${result.source} --dry-run`,
      reason: 'Preference signals were detected; preview exact preference changes before asking for approval.',
      approvalRequired: true
    });
  }
  return actions;
}

async function hookMemoryContext(prompt: string, learner: string, forced: boolean): Promise<HookSuggestMemoryContext> {
  const trigger = forced ? 'forced' : memoryContextTrigger(prompt);
  if (trigger === 'none') return emptyHookMemoryContext();
  const context = await buildMemoryContext({ learner });
  return {
    included: true,
    trigger,
    projectConcepts: context.project.topConcepts.slice(0, 5).map((concept) => concept.label),
    learnerPreferences: {
      preferredLanguage: context.learnerMemory.preferences.preferredLanguage,
      explanationOrder: context.learnerMemory.preferences.explanationOrder.slice(0, 6),
      avoid: context.learnerMemory.preferences.avoid.slice(0, 5)
    },
    weakTerms: context.learnerMemory.topWeakTerms.slice(0, 5).map((term) => term.term),
    profileUpdateCandidateCount: context.suggestions.profileUpdates.candidates.length,
    recommendedActions: context.recommendedActions.slice(0, 5).map((action) => action.command)
  };
}

function memoryContextTrigger(prompt: string): HookSuggestMemoryContext['trigger'] {
  const normalized = normalizePrompt(prompt);
  if (!normalized) return 'none';
  if (/contextbook/i.test(normalized) || /컨텍스트북/i.test(normalized)) return 'explicit-contextbook';
  if (/(learning moment|learning card|learn the concepts|what can i learn)/i.test(normalized)) return 'learning-question';
  if (/(학습\s*(카드|모먼트|메모)|배울\s*개념|개념.*(설명|정리)|면접\s*(문장|답변)|왜\s*(필요|해야|중요)|why\s+)/i.test(normalized)) return 'learning-question';
  return 'none';
}

function emptyHookMemoryContext(): HookSuggestMemoryContext {
  return {
    included: false,
    trigger: 'none',
    projectConcepts: [],
    learnerPreferences: {
      explanationOrder: [],
      avoid: []
    },
    weakTerms: [],
    profileUpdateCandidateCount: 0,
    recommendedActions: []
  };
}

function formatHookAdditionalContext(result: PromptCaptureResult, actions: HookSuggestRecommendedAction[], memoryContext: HookSuggestMemoryContext): string {
  const preferenceSignals = result.preferenceSignals
    .slice(0, 5)
    .map((signal) => `- ${signal.dimension}=${signal.value} (${signal.intent}, ${signal.scope}, ${signal.policy})`)
    .join('\n') || '- none';
  const captured = result.capturedSignals
    .slice(0, 3)
    .map((signal) => `- ${signal.signalType}${signal.metadata?.format ? ` (${signal.metadata.format})` : ''}`)
    .join('\n') || '- none';
  const commands = actions
    .map((action) => `- \`${action.command}\` — ${action.reason}${action.approvalRequired ? ' Apply only after explicit user approval.' : ''}`)
    .join('\n') || '- none';
  const memoryContextLines = memoryContext.included ? [
    '## Read-only Memory Context',
    `- trigger: ${memoryContext.trigger}`,
    `- project concepts: ${memoryContext.projectConcepts.join(', ') || 'none'}`,
    `- explanation order: ${memoryContext.learnerPreferences.explanationOrder.join(' → ') || 'none'}`,
    `- preferred language: ${memoryContext.learnerPreferences.preferredLanguage ?? 'unspecified'}`,
    `- avoid: ${memoryContext.learnerPreferences.avoid.join(', ') || 'none'}`,
    `- weak terms: ${memoryContext.weakTerms.join(', ') || 'none'}`,
    `- profile update candidates: ${memoryContext.profileUpdateCandidateCount}`,
    `- recommended commands: ${memoryContext.recommendedActions.join('; ') || 'none'}`,
    ''
  ] : [];
  return [
    '# Contextbook Hook Suggestion',
    '',
    'Contextbook detected learning/preference signals from the current prompt. This is suggestion-only context.',
    '',
    '## Detected Preference Signals',
    preferenceSignals,
    '',
    '## Captured Learning Signals',
    captured,
    '',
    '## Suggested Next Actions',
    commands,
    '',
    ...memoryContextLines,
    '## Safety Contract',
    '- Do not auto-apply profile or preference updates from this hook.',
    '- Do not quote or persist the raw prompt.',
    '- Use dry-run preview first; apply only after explicit user approval.',
    '- Hook failures must not block the agent.'
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
