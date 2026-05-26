import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createConversationEvent } from './conversation-memory.js';
import { ensureLearnerStore, learnerPaths, readPreferences, recordProfileUpdate } from '../storage/user-store.js';
import { readJsonl } from '../storage/fs-utils.js';
import type {
  ConversationMemoryEvent,
  LearnerPreferences,
  PreferenceHistoryCommand,
  PreferenceHistoryEntry,
  PreferenceHistoryResult,
  PreferenceHistorySafety,
  UndoPreferenceUpdateChange,
  UndoPreferenceUpdateResult,
  UndoPreferenceUpdateSafety
} from '../types.js';

export interface UndoPreferenceUpdateOptions {
  learner?: string;
  entryRef: string;
  dryRun?: boolean;
  yes?: boolean;
}

const HISTORY_COMMANDS = new Set<PreferenceHistoryCommand>([
  'memory.apply-profile-update',
  'memory.apply-preference-signals',
  'profile.reset',
  'memory.undo-preference-update'
]);

export async function preferenceHistoryJson(learner = 'default'): Promise<PreferenceHistoryResult> {
  await ensureLearnerStore(learner);
  const paths = learnerPaths(learner);
  const [events, backupEntries] = await Promise.all([
    readJsonl<Record<string, unknown>>(paths.profileUpdates),
    readdir(paths.base).catch(() => [] as string[])
  ]);
  const backups = new Set(backupEntries.filter(isPreferenceBackup));
  const entries = events
    .filter(isHistoryEvent)
    .map((event) => toHistoryEntry(event, backups))
    .filter((entry): entry is PreferenceHistoryEntry => Boolean(entry))
    .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt))
    .map((entry, index) => ({ ...entry, index: index + 1 }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    entries,
    eventCounts: {
      profileUpdates: events.length,
      undoableEntries: entries.filter((entry) => entry.canUndo).length
    },
    safety: preferenceHistorySafety()
  };
}

export function formatPreferenceHistorySummary(result: PreferenceHistoryResult): string {
  const entries = result.entries.map((entry) => [
    `## ${entry.index}. ${entry.command}`,
    `- id: ${entry.id}`,
    `- applied: ${entry.appliedAt}`,
    `- backup: ${entry.backup || 'none'}`,
    `- can undo: ${entry.canUndo}`,
    `- summary: ${entry.summary}`
  ].join('\n')).join('\n\n') || '- no preference history yet';
  return [
    '# Preference History',
    '',
    `- learner: ${result.learner}`,
    `- entries: ${result.entries.length}`,
    `- undoable entries: ${result.eventCounts.undoableEntries}`,
    '- 원칙: backup basename만 표시, raw prompt 저장 없음, undo도 audit 기록',
    '',
    entries
  ].join('\n');
}

export async function undoPreferenceUpdate(options: UndoPreferenceUpdateOptions): Promise<UndoPreferenceUpdateResult> {
  const learner = options.learner ?? 'default';
  const dryRun = options.dryRun ?? false;
  const yes = options.yes ?? false;
  await ensureLearnerStore(learner);
  if (!dryRun && !yes) throw new Error('Usage: contextbook memory undo-preference-update --entry <id|index> (--dry-run|--yes) [--json]');

  const history = await preferenceHistoryJson(learner);
  const entry = resolveHistoryEntry(history.entries, options.entryRef);
  if (!entry) throw new Error(`Preference history entry not found: ${options.entryRef}`);
  if (!entry.canUndo || !entry.backup) throw new Error(`Preference history entry is not undoable: ${entry.id}`);

  const targetPreferences = await readBackupPreferences(learner, entry.backup);
  const currentPreferences = sanitizePreferences(await readPreferences(learner));
  const identical = preferencesEqual(currentPreferences, targetPreferences);
  const change: UndoPreferenceUpdateChange = {
    file: 'preferences.json',
    operation: identical ? 'skip-identical' : 'restore-snapshot',
    before: currentPreferences,
    after: targetPreferences,
    message: identical ? 'Selected backup already matches current preferences.' : 'Restore preferences from selected backup snapshot.'
  };
  const applied = !dryRun && yes && !identical;
  let backupCreated: string | undefined;
  let auditEvent: ConversationMemoryEvent | undefined;

  if (applied) {
    const paths = learnerPaths(learner);
    backupCreated = await backupPreferences(paths.preferences);
    await writeFile(paths.preferences, `${JSON.stringify(targetPreferences, null, 2)}\n`, 'utf8');
    auditEvent = createConversationEvent({
      signalType: 'profile-update.applied',
      command: 'memory.undo-preference-update',
      learner,
      conceptLabel: 'Preference History Undo',
      metadata: {
        entryId: entry.id,
        restoredBackup: entry.backup,
        backup: basename(backupCreated),
        file: 'preferences.json'
      }
    });
    await recordProfileUpdate(auditEvent, learner);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    dryRun,
    applied,
    entry,
    changes: [change],
    auditEvent,
    backupCreated: backupCreated ? basename(backupCreated) : undefined,
    safety: undoPreferenceUpdateSafety(applied)
  };
}

export function formatUndoPreferenceUpdateSummary(result: UndoPreferenceUpdateResult): string {
  const changes = result.changes.map((change) => `- ${change.file}: ${change.operation} — ${change.message}`).join('\n') || '- no changes';
  return [
    '# Undo Preference Update',
    '',
    `- learner: ${result.learner}`,
    `- dry run: ${result.dryRun}`,
    `- applied: ${result.applied}`,
    `- entry: ${result.entry.id}`,
    `- target backup: ${result.entry.backup}`,
    result.backupCreated ? `- backup created: ${result.backupCreated}` : '- backup created: none',
    `- audit: ${result.auditEvent?.signalType ?? 'none'}`,
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

function toHistoryEntry(event: Record<string, unknown>, backups: Set<string>): PreferenceHistoryEntry | undefined {
  const command = event.command as PreferenceHistoryCommand;
  const metadata = sanitizeMetadata(event.metadata);
  const backup = typeof metadata.backup === 'string'
    ? basename(metadata.backup)
    : typeof metadata.preferencesBackup === 'string'
      ? basename(metadata.preferencesBackup)
      : '';
  const appliedAt = typeof event.recordedAt === 'string' ? event.recordedAt : typeof event.answeredAt === 'string' ? event.answeredAt : '';
  if (!appliedAt) return undefined;
  const canUndo = Boolean(backup && backups.has(backup));
  return {
    id: stableHistoryId(appliedAt, command, backup),
    index: 0,
    appliedAt,
    command,
    file: 'preferences.json',
    backup,
    canUndo,
    summary: historySummary(command, metadata),
    metadata
  };
}

function isHistoryEvent(event: Record<string, unknown>): boolean {
  return typeof event.command === 'string' && HISTORY_COMMANDS.has(event.command as PreferenceHistoryCommand);
}

function historySummary(command: PreferenceHistoryCommand, metadata: Record<string, string | number | boolean | null>): string {
  if (command === 'memory.apply-preference-signals') return `applied ${metadata.changes ?? 0} safe preference signal change(s)`;
  if (command === 'memory.apply-profile-update') return `applied profile update candidate ${metadata.candidateId ?? 'unknown'}`;
  if (command === 'memory.undo-preference-update') return `restored ${metadata.restoredBackup ?? 'a previous preferences snapshot'}`;
  if (command === 'profile.reset') return 'reset learner preferences to defaults';
  return 'preference update';
}

function stableHistoryId(appliedAt: string, command: PreferenceHistoryCommand, backup: string): string {
  return `preference-history:${safeIdPart(appliedAt)}:${safeIdPart(command)}:${safeIdPart(backup || 'none')}`;
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function resolveHistoryEntry(entries: PreferenceHistoryEntry[], ref: string): PreferenceHistoryEntry | undefined {
  const trimmed = ref.trim();
  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 1) return entries[asNumber - 1];
  return entries.find((entry) => entry.id === trimmed);
}

async function readBackupPreferences(learner: string, backup: string): Promise<LearnerPreferences> {
  if (!isPreferenceBackup(backup)) throw new Error(`Invalid preference backup basename: ${backup}`);
  const paths = learnerPaths(learner);
  const raw = await readFile(join(paths.base, backup), 'utf8');
  return sanitizePreferences(JSON.parse(raw));
}

function sanitizePreferences(value: unknown): LearnerPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid preferences snapshot: expected object');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.explanationOrder)) throw new Error('Invalid preferences snapshot: explanationOrder is required');
  if (!Array.isArray(record.avoid)) throw new Error('Invalid preferences snapshot: avoid is required');
  const explanationOrder = sanitizeStringArray(record.explanationOrder);
  const avoid = sanitizeStringArray(record.avoid);
  const preferences: LearnerPreferences = { explanationOrder, avoid };
  if (record.preferredLanguage === 'ko' || record.preferredLanguage === 'en') preferences.preferredLanguage = record.preferredLanguage;
  if (record.outputLength === 'short' || record.outputLength === 'default') preferences.outputLength = record.outputLength;
  return preferences;
}

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : '').filter(Boolean) : [];
}

function preferencesEqual(left: LearnerPreferences, right: LearnerPreferences): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPreferenceBackup(value: string): boolean {
  return basename(value) === value && value.startsWith('preferences.json.bak-');
}

function sanitizeMetadata(metadata: unknown): Record<string, string | number | boolean | null> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const entries: Array<[string, string | number | boolean | null]> = [];
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (typeof value === 'string') entries.push([key, basename(value.replace(/\s+/g, ' ').trim())]);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

async function backupPreferences(path: string): Promise<string> {
  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await copyFile(path, backup);
  return backup;
}

function preferenceHistorySafety(): PreferenceHistorySafety {
  return {
    rawTranscriptIncluded: false,
    rawPromptPersisted: false,
    absolutePathsIncluded: false,
    hiddenContentIncluded: false,
    projectMemoryMutated: false,
    profileMutated: false,
    preferencesMutated: false,
    weakTermsMutated: false,
    unsafeJudgmentIncluded: false
  };
}

function undoPreferenceUpdateSafety(applied: boolean): UndoPreferenceUpdateSafety {
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
