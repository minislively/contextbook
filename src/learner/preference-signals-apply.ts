import { copyFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createConversationEvent } from './conversation-memory.js';
import { classifyPreferenceSignals, preferenceSignalCounts } from './preference-signals.js';
import { ensureLearnerStore, learnerPaths, readPreferences, recordProfileUpdate } from '../storage/user-store.js';
import type {
  ApplyPreferenceSignalChange,
  ApplyPreferenceSignalsResult,
  ApplyPreferenceSignalsSafety,
  ConversationMemoryEvent,
  LearnerPreferences,
  PreferenceSignalCandidate,
  PromptCaptureSource
} from '../types.js';

export interface ApplyPreferenceSignalsOptions {
  prompt: string;
  source?: PromptCaptureSource;
  learner?: string;
  dryRun?: boolean;
}

interface ApplyPreferenceSignalsPlan {
  nextPreferences: LearnerPreferences;
  changes: ApplyPreferenceSignalChange[];
  shouldWrite: boolean;
}

const WRITE_OPERATIONS = new Set<ApplyPreferenceSignalChange['operation']>([
  'set-language',
  'set-output-length',
  'move-explanation-order',
  'append-avoid'
]);

export async function applyPreferenceSignals(options: ApplyPreferenceSignalsOptions): Promise<ApplyPreferenceSignalsResult> {
  const learner = options.learner ?? 'default';
  const source = options.source ?? 'manual';
  const dryRun = options.dryRun ?? false;
  await ensureLearnerStore(learner);

  const preferenceSignals = classifyPreferenceSignals(options.prompt, source);
  const preferences = await readPreferences(learner);
  const plan = planPreferenceSignals(preferenceSignals, preferences);
  const applied = !dryRun && plan.shouldWrite;
  let auditEvent: ConversationMemoryEvent | undefined;
  let backupCreated: string | undefined;

  if (applied) {
    const paths = learnerPaths(learner);
    backupCreated = await backupPreferences(paths.preferences);
    await writeFile(paths.preferences, `${JSON.stringify(plan.nextPreferences, null, 2)}\n`, 'utf8');
    const counts = preferenceSignalCounts(preferenceSignals);
    auditEvent = createConversationEvent({
      signalType: 'profile-update.applied',
      command: 'memory.apply-preference-signals',
      learner,
      conceptLabel: 'Preference Signals',
      metadata: {
        source,
        safeSignals: counts.autoApplySafe,
        signalOnly: counts.signalOnly,
        changes: plan.changes.filter((change) => WRITE_OPERATIONS.has(change.operation)).length,
        file: 'preferences.json'
      }
    });
    await recordProfileUpdate(auditEvent, learner);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    source,
    dryRun,
    applied,
    preferenceSignals,
    changes: plan.changes,
    auditEvent,
    backupCreated: backupCreated ? basename(backupCreated) : undefined,
    safety: applyPreferenceSignalsSafety(applied)
  };
}

export function formatApplyPreferenceSignalsSummary(result: ApplyPreferenceSignalsResult): string {
  const signals = result.preferenceSignals.map((signal) => `- ${signal.dimension}=${signal.value} (${signal.route})`).join('\n') || '- none';
  const changes = result.changes.map((change) => `- ${change.file}: ${change.operation} — ${change.message}`).join('\n') || '- no changes';
  return [
    '# Apply Preference Signals',
    '',
    `- learner: ${result.learner}`,
    `- source: ${result.source}`,
    `- dry run: ${result.dryRun}`,
    `- applied: ${result.applied}`,
    `- audit: ${result.auditEvent?.signalType ?? 'none'}`,
    result.backupCreated ? `- backup: ${result.backupCreated}` : '- backup: none',
    '',
    '## Preference Signals',
    signals,
    '',
    '## Changes',
    changes,
    '',
    '## Safety',
    `- raw transcript included: ${result.safety.rawTranscriptIncluded}`,
    `- raw prompt persisted: ${result.safety.rawPromptPersisted}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated}`,
    `- profile mutated: ${result.safety.profileMutated}`,
    `- preferences mutated: ${result.safety.preferencesMutated}`,
    `- weak terms mutated: ${result.safety.weakTermsMutated}`
  ].join('\n');
}

export function planPreferenceSignals(signals: PreferenceSignalCandidate[], preferences: LearnerPreferences): ApplyPreferenceSignalsPlan {
  let nextPreferences: LearnerPreferences = {
    ...preferences,
    explanationOrder: sanitizeStringArray(preferences.explanationOrder),
    avoid: sanitizeStringArray(preferences.avoid)
  };
  const changes: ApplyPreferenceSignalChange[] = [];

  for (const signal of signals) {
    const result = planPreferenceSignal(signal, nextPreferences);
    nextPreferences = result.nextPreferences;
    changes.push(result.change);
  }

  return {
    nextPreferences,
    changes,
    shouldWrite: changes.some((change) => WRITE_OPERATIONS.has(change.operation))
  };
}

function planPreferenceSignal(signal: PreferenceSignalCandidate, preferences: LearnerPreferences): { nextPreferences: LearnerPreferences; change: ApplyPreferenceSignalChange } {
  if (signal.route !== 'auto-apply-safe') {
    return skipped(preferences, signal, 'skip-unsafe-route', `${signal.dimension}=${signal.value} is not auto-apply safe, so it was not written.`);
  }

  if (signal.dimension === 'language' && (signal.value === 'ko' || signal.value === 'en')) {
    return setScalar(preferences, signal, 'preferredLanguage', signal.value, 'set-language', `Set preferredLanguage to ${signal.value}.`);
  }
  if (signal.dimension === 'output.length' && signal.value === 'short') {
    return setScalar(preferences, signal, 'outputLength', 'short', 'set-output-length', 'Set outputLength to short.');
  }
  if (signal.dimension === 'explanation.order' && signal.value === 'project-first') {
    const before = sanitizeStringArray(preferences.explanationOrder);
    const after = moveToFront(before, 'project');
    if (arraysEqual(before, after)) return skipped(preferences, signal, 'skip-identical', 'project is already first in explanationOrder.', before, after);
    return {
      nextPreferences: { ...preferences, explanationOrder: after },
      change: change(signal, 'move-explanation-order', 'Moved project to the front of explanationOrder.', before, after)
    };
  }
  if (signal.dimension === 'explanation.style' && signal.value === 'plain-language') {
    const before = sanitizeStringArray(preferences.explanationOrder);
    const after = ensurePlainNearFront(before);
    if (arraysEqual(before, after)) return skipped(preferences, signal, 'skip-identical', 'plain is already near the front of explanationOrder.', before, after);
    return {
      nextPreferences: { ...preferences, explanationOrder: after },
      change: change(signal, 'move-explanation-order', 'Moved plain near the front of explanationOrder.', before, after)
    };
  }
  if (signal.dimension === 'output.section' && signal.value === 'interview-sentence') {
    const before = sanitizeStringArray(preferences.explanationOrder);
    const after = ensureInArray(before, 'interview-sentence');
    if (arraysEqual(before, after)) return skipped(preferences, signal, 'skip-identical', 'interview-sentence already exists in explanationOrder.', before, after);
    return {
      nextPreferences: { ...preferences, explanationOrder: after },
      change: change(signal, 'move-explanation-order', 'Added interview-sentence to explanationOrder.', before, after)
    };
  }
  if (signal.dimension === 'command.volume' && signal.value === 'fewer-commands') {
    return appendAvoid(preferences, signal, 'too many commands');
  }
  if (signal.dimension === 'avoid' && signal.value === 'abstract-lecture-first') {
    return appendAvoid(preferences, signal, 'abstract lecture first');
  }

  return skipped(preferences, signal, 'unsupported-dimension', `${signal.dimension}=${signal.value} is not in the apply allowlist.`);
}

function setScalar<K extends 'preferredLanguage' | 'outputLength'>(
  preferences: LearnerPreferences,
  signal: PreferenceSignalCandidate,
  key: K,
  value: NonNullable<LearnerPreferences[K]>,
  operation: ApplyPreferenceSignalChange['operation'],
  message: string
): { nextPreferences: LearnerPreferences; change: ApplyPreferenceSignalChange } {
  const before = preferences[key];
  if (before === value) return skipped(preferences, signal, 'skip-identical', `${key} is already ${value}.`, before, value);
  return {
    nextPreferences: { ...preferences, [key]: value },
    change: change(signal, operation, message, before, value)
  };
}

function appendAvoid(preferences: LearnerPreferences, signal: PreferenceSignalCandidate, rule: string): { nextPreferences: LearnerPreferences; change: ApplyPreferenceSignalChange } {
  const before = sanitizeStringArray(preferences.avoid);
  const exists = before.some((item) => normalize(item) === normalize(rule));
  const after = exists ? before : [...before, rule];
  if (exists) return skipped(preferences, signal, 'skip-identical', `avoid already contains ${rule}.`, before, after);
  return {
    nextPreferences: { ...preferences, avoid: after },
    change: change(signal, 'append-avoid', `Added avoid rule: ${rule}.`, before, after)
  };
}

function skipped(
  preferences: LearnerPreferences,
  signal: PreferenceSignalCandidate,
  operation: Extract<ApplyPreferenceSignalChange['operation'], 'skip-identical' | 'skip-unsafe-route' | 'unsupported-dimension'>,
  message: string,
  before?: unknown,
  after?: unknown
): { nextPreferences: LearnerPreferences; change: ApplyPreferenceSignalChange } {
  return { nextPreferences: preferences, change: change(signal, operation, message, before, after) };
}

function change(signal: PreferenceSignalCandidate, operation: ApplyPreferenceSignalChange['operation'], message: string, before?: unknown, after?: unknown): ApplyPreferenceSignalChange {
  return {
    file: 'preferences.json',
    operation,
    before,
    after,
    message,
    signal: {
      dimension: signal.dimension,
      value: signal.value,
      route: signal.route
    }
  };
}

function sanitizeStringArray(values: string[] = []): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalize(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function moveToFront(values: string[], target: string): string[] {
  return [target, ...values.filter((value) => normalize(value) !== normalize(target))];
}

function ensurePlainNearFront(values: string[]): string[] {
  const withoutPlain = values.filter((value) => normalize(value) !== 'plain');
  const projectIndex = withoutPlain.findIndex((value) => normalize(value) === 'project');
  if (projectIndex >= 0) return [...withoutPlain.slice(0, projectIndex + 1), 'plain', ...withoutPlain.slice(projectIndex + 1)];
  return ['plain', ...withoutPlain];
}

function ensureInArray(values: string[], target: string): string[] {
  return values.some((value) => normalize(value) === normalize(target)) ? values : [...values, target];
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function backupPreferences(path: string): Promise<string> {
  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await copyFile(path, backup);
  return backup;
}

function applyPreferenceSignalsSafety(applied: boolean): ApplyPreferenceSignalsSafety {
  return {
    rawTranscriptIncluded: false,
    rawPromptPersisted: false,
    absolutePathsIncluded: false,
    hiddenContentIncluded: false,
    projectMemoryMutated: false,
    profileMutated: false,
    preferencesMutated: applied,
    weakTermsMutated: false,
    unsafeJudgmentIncluded: false
  };
}
