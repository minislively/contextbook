import { basename } from 'node:path';
import { learnerPaths, recordAnswer, recordProfileUpdate, recordSignal } from '../storage/user-store.js';
import { readJsonl } from '../storage/fs-utils.js';
import type { ConceptRecord, ConversationCommand, ConversationMemoryEvent, ConversationSignalType, EvidenceLevel, MemorySignalsJson, MemorySignalsSafety } from '../types.js';

const MAX_QUESTION_LENGTH = 240;
const MAX_NOTE_LENGTH = 160;
const MAX_FILES = 5;
const MAX_METADATA_KEYS = 10;
const MAX_RECENT_SIGNALS = 20;

export const memorySignalTypes = [
  'feedback.positive',
  'feedback.confused',
  'format.requested',
  'analogy.accepted',
  'analogy.rejected',
  'term.repeated'
] as const satisfies readonly ConversationSignalType[];

type PrimitiveMetadata = Record<string, string | number | boolean | null | undefined>;

export interface ConversationEventInput {
  signalType?: ConversationSignalType;
  command?: ConversationCommand;
  learner?: string;
  question?: string;
  concept?: Pick<ConceptRecord, 'id' | 'label' | 'evidenceLevel' | 'signals'> | { label: string; evidenceLevel?: EvidenceLevel; signals?: Array<{ file?: string }> };
  evidenceLevel?: EvidenceLevel;
  conceptLabel?: string;
  conceptId?: string;
  evidenceFiles?: string[];
  conceptCount?: number;
  metadata?: PrimitiveMetadata;
}

export function createConversationEvent(input: ConversationEventInput): ConversationMemoryEvent {
  const learner = input.learner ?? 'default';
  const evidenceFiles = input.evidenceFiles ?? input.concept?.signals?.map((signal) => signal.file).filter(isString) ?? [];
  const signalType = input.signalType ?? 'why.answered';
  return stripUndefined({
    schemaVersion: 1 as const,
    kind: 'conversation-memory' as const,
    signalType,
    type: legacyType(signalType),
    command: input.command ?? 'why',
    learner,
    question: sanitizeQuestion(input.question),
    conceptId: input.conceptId ?? conceptId(input.concept),
    conceptLabel: sanitizeShortText(input.conceptLabel ?? input.concept?.label, MAX_NOTE_LENGTH),
    concept: sanitizeShortText(input.conceptLabel ?? input.concept?.label, MAX_NOTE_LENGTH),
    evidenceLevel: input.evidenceLevel ?? input.concept?.evidenceLevel,
    evidenceFiles: uniqueBaselessFiles(evidenceFiles),
    conceptCount: input.conceptCount,
    metadata: sanitizeMetadata(input.metadata)
  });
}

export async function recordConversationSignal(input: ConversationEventInput): Promise<ConversationMemoryEvent> {
  const event = createConversationEvent(input);
  await recordSignal(event, event.learner);
  return event;
}

export async function addExplicitMemorySignal(input: {
  signalType: typeof memorySignalTypes[number];
  learner?: string;
  conceptLabel?: string;
  note?: string;
  format?: string;
  command?: ConversationCommand;
  metadata?: PrimitiveMetadata;
}): Promise<ConversationMemoryEvent> {
  const metadata: PrimitiveMetadata = { ...(input.metadata ?? {}) };
  const note = sanitizeShortText(input.note, MAX_NOTE_LENGTH);
  const format = sanitizeShortText(input.format, 40);
  if (note) metadata.note = note;
  if (format) metadata.format = format;
  return recordConversationSignal({
    signalType: input.signalType,
    command: input.command ?? 'memory.add-signal',
    learner: input.learner ?? 'default',
    conceptLabel: input.conceptLabel,
    metadata
  });
}

export async function memorySignalsJson(learner = 'default'): Promise<MemorySignalsJson> {
  const paths = learnerPaths(learner);
  const signals = await readJsonl<Record<string, unknown>>(paths.signals);
  const recentSignals = signals
    .filter((event) => event.kind === 'conversation-memory' || typeof event.signalType === 'string' || typeof event.type === 'string')
    .sort((a, b) => String(b.recordedAt ?? b.answeredAt ?? '').localeCompare(String(a.recordedAt ?? a.answeredAt ?? '')))
    .slice(0, MAX_RECENT_SIGNALS)
    .map(toSafeConversationEvent);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    signalTypes: [...memorySignalTypes],
    recentSignals,
    eventCounts: { signals: signals.length },
    safety: memorySignalsSafety()
  };
}

export function formatMemorySignalsSummary(summary: MemorySignalsJson): string {
  const recent = summary.recentSignals.slice(0, 10).map(formatConversationEvent).join('\n') || '- 아직 기록된 memory signal 없음';
  return [
    '# Memory Signals',
    '',
    `- learner: ${summary.learner}`,
    `- recorded signals: ${summary.eventCounts.signals}`,
    `- allowed types: ${summary.signalTypes.join(', ')}`,
    '- 원칙: append-only, 원문 전체 대화 저장 없음, 사용자 능력/성격 단정 없음, 자동 프로필 변경 없음',
    '',
    '최근 signals:',
    recent
  ].join('\n');
}

export async function recordConversationAnswer(input: ConversationEventInput): Promise<ConversationMemoryEvent> {
  const event = createConversationEvent({ ...input, signalType: 'why.answered', command: 'why' });
  await recordAnswer({ ...event, answeredAt: new Date().toISOString() }, event.learner);
  await recordSignal(event, event.learner);
  return event;
}

export async function recordConversationProfileUpdate(input: ConversationEventInput): Promise<ConversationMemoryEvent> {
  const event = createConversationEvent(input);
  await recordProfileUpdate(event, event.learner);
  await recordSignal(event, event.learner);
  return event;
}

export async function conversationMemoryMarkdown(learner = 'default'): Promise<string> {
  const paths = learnerPaths(learner);
  const [signals, answers, profileUpdates] = await Promise.all([
    readJsonl<Record<string, unknown>>(paths.signals),
    readJsonl<Record<string, unknown>>(paths.answers),
    readJsonl<Record<string, unknown>>(paths.profileUpdates)
  ]);
  const events = [...signals, ...answers, ...profileUpdates]
    .filter((event) => event.kind === 'conversation-memory' || typeof event.type === 'string')
    .sort((a, b) => String(b.recordedAt ?? b.answeredAt ?? '').localeCompare(String(a.recordedAt ?? a.answeredAt ?? '')));
  const structured = events.filter((event) => event.kind === 'conversation-memory').length;
  const recent = events.slice(0, 5).map(formatConversationEvent).join('\n') || '- 아직 기록된 conversation signal 없음';
  return [
    '## Conversation Memory',
    '',
    `- 저장 위치: \`${paths.signals}\`, \`${paths.answers}\`, \`${paths.profileUpdates}\``,
    `- 기록된 이벤트: ${events.length}개 (${structured}개 structured v1)`,
    '- 원칙: 원문 전체 대화 저장 없음, 사용자 능력/성격 단정 없음, 자동 프로필 변경 없음',
    '',
    '최근 이벤트:',
    recent
  ].join('\n');
}

function toSafeConversationEvent(event: Record<string, unknown>): ConversationMemoryEvent {
  return stripUndefined({
    schemaVersion: 1 as const,
    kind: 'conversation-memory' as const,
    signalType: isConversationSignalType(event.signalType) ? event.signalType : 'why.answered',
    type: typeof event.type === 'string' ? event.type : undefined,
    command: isConversationCommand(event.command) ? event.command : 'why',
    learner: typeof event.learner === 'string' ? event.learner : 'default',
    conceptId: sanitizeShortText(typeof event.conceptId === 'string' ? event.conceptId : undefined, 80),
    conceptLabel: sanitizeShortText(typeof event.conceptLabel === 'string' ? event.conceptLabel : typeof event.concept === 'string' ? event.concept : undefined, MAX_NOTE_LENGTH),
    concept: sanitizeShortText(typeof event.concept === 'string' ? event.concept : undefined, MAX_NOTE_LENGTH),
    evidenceLevel: isEvidenceLevel(event.evidenceLevel) ? event.evidenceLevel : undefined,
    evidenceFiles: Array.isArray(event.evidenceFiles) ? event.evidenceFiles.filter((file): file is string => typeof file === 'string').slice(0, MAX_FILES) : undefined,
    conceptCount: typeof event.conceptCount === 'number' ? event.conceptCount : undefined,
    metadata: sanitizeMetadata(event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) ? event.metadata as PrimitiveMetadata : undefined),
    recordedAt: typeof event.recordedAt === 'string' ? event.recordedAt : typeof event.answeredAt === 'string' ? event.answeredAt : undefined
  });
}

function formatConversationEvent(event: unknown): string {
  const record = event && typeof event === 'object' ? event as Record<string, unknown> : {};
  const signal = String(record.signalType ?? record.type ?? 'unknown');
  const concept = typeof record.conceptLabel === 'string' ? ` — ${record.conceptLabel}` : typeof record.concept === 'string' ? ` — ${record.concept}` : '';
  const evidence = typeof record.evidenceLevel === 'string' ? ` (${record.evidenceLevel})` : '';
  return `- ${signal}${concept}${evidence}`;
}

function sanitizeQuestion(question: string | undefined): string | undefined {
  return sanitizeShortText(question, MAX_QUESTION_LENGTH);
}

function sanitizeShortText(text: string | undefined, maxLength: number): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function uniqueBaselessFiles(files: string[]): string[] | undefined {
  const safe = [...new Set(files.filter(Boolean))]
    .filter((file) => !file.includes('..'))
    .slice(0, MAX_FILES)
    .map((file) => file.startsWith('/') ? basename(file) : file);
  return safe.length ? safe : undefined;
}

function sanitizeMetadata(metadata: PrimitiveMetadata | undefined): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata)
    .slice(0, MAX_METADATA_KEYS)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null)
    .map(([key, value]) => [key, typeof value === 'string' ? sanitizeShortText(value, MAX_NOTE_LENGTH) ?? '' : value ?? null] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function memorySignalsSafety(): MemorySignalsSafety {
  return {
    rawTranscriptIncluded: false,
    absolutePathsIncluded: false,
    profileMutated: false,
    weakTermsMutated: false,
    unsafeJudgmentIncluded: false
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function conceptId(concept: ConversationEventInput['concept']): string | undefined {
  return concept && 'id' in concept ? concept.id : undefined;
}

function isConversationSignalType(value: unknown): value is ConversationSignalType {
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

function isConversationCommand(value: unknown): value is ConversationCommand {
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
    || value === 'memory.context';
}

function isEvidenceLevel(value: unknown): value is EvidenceLevel {
  return value === 'direct' || value === 'related' || value === 'general';
}

function legacyType(signalType: ConversationSignalType): string {
  const map: Record<ConversationSignalType, string> = {
    'scan.completed': 'scan',
    'learn.generated': 'learn',
    'why.answered': 'why',
    'profile.viewed': 'profile.view',
    'profile.diff.viewed': 'profile.diff',
    'profile.edit.path-shown': 'profile.edit.path-shown',
    'profile.edited': 'profile.edit',
    'profile.reset': 'profile.reset',
    'feedback.positive': 'feedback.positive',
    'feedback.confused': 'feedback.confused',
    'format.requested': 'format.requested',
    'analogy.accepted': 'analogy.accepted',
    'analogy.rejected': 'analogy.rejected',
    'term.repeated': 'term.repeated',
    'profile-update.applied': 'profile-update.applied'
  };
  return map[signalType];
}
