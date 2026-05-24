import { memorySignalsJson } from '../learner/conversation-memory.js';
import { profileUpdateCandidatesJson } from '../learner/profile-update-candidates.js';
import { weakTermSuggestionsJson } from '../learner/weak-term-suggestions.js';
import { buildProjectSummary, toProjectSummaryJson } from './project.js';
import { buildLearnerSummary, toLearnerSummaryJson } from './learner.js';
import type {
  ContextbookRuntimeOptions,
  LearnerRecommendedAction,
  MemoryContextFreshness,
  MemoryContextJson,
  MemoryContextRecommendedAction,
  MemoryContextSafety,
  MemoryContextStaleHint,
  ProjectRecommendedAction
} from '../types.js';

export async function buildMemoryContext(options: ContextbookRuntimeOptions = {}): Promise<MemoryContextJson> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const generatedAt = new Date().toISOString();
  const [projectSummary, learnerSummary, conversation, weakTerms, profileUpdates] = await Promise.all([
    buildProjectSummary({ root, learner }),
    buildLearnerSummary(learner),
    memorySignalsJson(learner),
    weakTermSuggestionsJson(learner),
    profileUpdateCandidatesJson(learner)
  ]);
  const project = toProjectSummaryJson(projectSummary);
  const learnerMemory = toLearnerSummaryJson(learnerSummary);
  const freshness = memoryContextFreshness(generatedAt, project, conversation);
  return {
    schemaVersion: 1,
    generatedAt,
    rootName: project.rootName,
    learner,
    project,
    learnerMemory,
    conversation,
    suggestions: {
      weakTerms,
      profileUpdates
    },
    freshness,
    recommendedActions: recommendedActions(project.recommendedActions, learnerMemory.recommendedActions, freshness.staleHints),
    safety: memoryContextSafety()
  };
}

export function formatMemoryContextSummary(context: MemoryContextJson): string {
  const actions = context.recommendedActions.slice(0, 5)
    .map((action) => `- \`${action.command}\` — ${action.reason} (${action.source})`)
    .join('\n') || '- 없음';
  const staleHints = context.freshness.staleHints
    .map((hint) => `- ${hint.code}: ${hint.message}`)
    .join('\n') || '- 없음';
  return [
    '# Contextbook Memory Context',
    '',
    `- project concepts: ${context.project.topConcepts.length}`,
    `- learner signals: ${context.conversation.eventCounts.signals}`,
    `- weak-term candidates: ${context.suggestions.weakTerms.candidates.length}`,
    `- profile update candidates: ${context.suggestions.profileUpdates.candidates.length}`,
    '- safety: read-only, no raw transcript, no profile/preferences/weak-term mutation',
    '',
    '## Freshness',
    staleHints,
    '',
    '## Next Actions',
    actions
  ].join('\n');
}

function memoryContextFreshness(
  contextGeneratedAt: string,
  project: MemoryContextJson['project'],
  conversation: MemoryContextJson['conversation']
): MemoryContextFreshness {
  const latestScan = project.recentScanRuns[0];
  const staleHints: MemoryContextStaleHint[] = [];
  if (!project.memoryFiles.some((file) => file.exists)) {
    staleHints.push({
      code: 'project-not-initialized',
      message: 'Project Memory files are missing.',
      recommendedCommand: 'contextbook init'
    });
  }
  if (!latestScan) {
    staleHints.push({
      code: 'project-not-scanned',
      message: 'No project scan run was found.',
      recommendedCommand: 'contextbook scan'
    });
  }
  if (latestScan?.warnings.length) {
    staleHints.push({
      code: 'scan-has-warnings',
      message: 'Latest scan has warnings that may affect context quality.',
      recommendedCommand: 'contextbook scan'
    });
  }
  if (conversation.eventCounts.signals === 0) {
    staleHints.push({
      code: 'no-learner-signals',
      message: 'No explicit learner memory signals have been recorded yet.',
      recommendedCommand: 'contextbook memory add-signal --type feedback.confused --concept "<concept>"'
    });
  }
  return {
    projectScannedAt: latestScan?.scannedAt,
    signalsGeneratedAt: conversation.generatedAt,
    contextGeneratedAt,
    staleHints
  };
}

function recommendedActions(
  projectActions: ProjectRecommendedAction[],
  learnerActions: LearnerRecommendedAction[],
  staleHints: MemoryContextStaleHint[]
): MemoryContextRecommendedAction[] {
  const actions: MemoryContextRecommendedAction[] = [
    ...staleHints.map((hint) => ({
      command: hint.recommendedCommand,
      reason: hint.message,
      source: 'freshness' as const
    })),
    ...projectActions.map((action) => ({ ...action, source: 'project' as const })),
    ...learnerActions.map((action) => ({ ...action, source: 'learner' as const }))
  ];
  return dedupeActions(actions);
}

function dedupeActions(actions: MemoryContextRecommendedAction[]): MemoryContextRecommendedAction[] {
  const byCommand = new Map<string, MemoryContextRecommendedAction>();
  for (const action of actions) {
    if (byCommand.has(action.command)) continue;
    byCommand.set(action.command, action);
  }
  return [...byCommand.values()];
}

function memoryContextSafety(): MemoryContextSafety {
  return {
    rawTranscriptIncluded: false,
    absolutePathsIncluded: false,
    hiddenContentIncluded: false,
    profileMutated: false,
    preferencesMutated: false,
    weakTermsMutated: false,
    profileUpdatesMutated: false,
    projectMemoryMutated: false,
    persistedSummaryCreated: false,
    unsafeJudgmentIncluded: false
  };
}
