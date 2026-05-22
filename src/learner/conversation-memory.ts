import { basename } from 'node:path';
import { learnerPaths, recordAnswer, recordProfileUpdate, recordSignal } from '../storage/user-store.js';
import { readJsonl } from '../storage/fs-utils.js';
import type { ConceptRecord, ConversationCommand, ConversationMemoryEvent, ConversationSignalType, EvidenceLevel } from '../types.js';

const MAX_QUESTION_LENGTH = 240;
const MAX_FILES = 5;
const MAX_METADATA_KEYS = 10;

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
  return stripUndefined({
    schemaVersion: 1 as const,
    kind: 'conversation-memory' as const,
    signalType: input.signalType ?? 'why.answered',
    type: legacyType(input.signalType ?? 'why.answered'),
    command: input.command ?? 'why',
    learner,
    question: sanitizeQuestion(input.question),
    conceptId: input.conceptId ?? conceptId(input.concept),
    conceptLabel: input.conceptLabel ?? input.concept?.label,
    concept: input.conceptLabel ?? input.concept?.label,
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

function formatConversationEvent(event: Record<string, unknown>): string {
  const signal = String(event.signalType ?? event.type ?? 'unknown');
  const concept = typeof event.conceptLabel === 'string' ? ` — ${event.conceptLabel}` : typeof event.concept === 'string' ? ` — ${event.concept}` : '';
  const evidence = typeof event.evidenceLevel === 'string' ? ` (${event.evidenceLevel})` : '';
  return `- ${signal}${concept}${evidence}`;
}

function sanitizeQuestion(question: string | undefined): string | undefined {
  if (!question) return undefined;
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.length > MAX_QUESTION_LENGTH ? `${normalized.slice(0, MAX_QUESTION_LENGTH - 1)}…` : normalized;
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
    .map(([key, value]) => [key, value ?? null] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
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

function legacyType(signalType: ConversationSignalType): string {
  const map: Record<ConversationSignalType, string> = {
    'scan.completed': 'scan',
    'learn.generated': 'learn',
    'why.answered': 'why',
    'profile.viewed': 'profile.view',
    'profile.diff.viewed': 'profile.diff',
    'profile.edit.path-shown': 'profile.edit.path-shown',
    'profile.edited': 'profile.edit',
    'profile.reset': 'profile.reset'
  };
  return map[signalType];
}
