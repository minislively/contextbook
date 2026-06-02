import { basename, join, relative } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { formatReport } from '../format/report.js';
import { rankEvidenceForDisplay } from '../format/evidence.js';
import { gitWorkingTreeState } from '../scan/git-diff.js';
import { ensureDir, readJsonl } from '../storage/fs-utils.js';
import { learnerPaths, readWeakTerms } from '../storage/user-store.js';
import { projectPaths, readConcepts, readFileIndex, readScanRuns } from '../storage/project-store.js';
import type {
  ConceptRecord,
  ContextbookRuntimeOptions,
  ConversationMemoryEvent,
  ProjectRecommendedAction,
  ReportConceptSummary,
  ReportFreshness,
  ReportJson,
  ReportPeriod,
  ReportPeriodMode,
  ReportResult,
  SavedReportArtifact
} from '../types.js';

export interface ReportBuildOptions extends ContextbookRuntimeOptions {
  args?: string[];
  now?: Date;
}

interface ConceptBucket {
  id?: string;
  label: string;
  rawCount: number;
  episodeCount: number;
  score: number;
  reasons: Set<string>;
  episodeKeys: Set<string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildReport(options: ReportBuildOptions = {}): Promise<ReportResult> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const period = resolveReportPeriod(options.args ?? [], now);
  const [concepts, scanRuns, fileIndex, signals, weakTerms] = await Promise.all([
    readConcepts(root),
    readScanRuns(root),
    readFileIndex(root),
    readJsonl<Record<string, unknown>>(learnerPaths(learner).signals),
    readWeakTerms(learner)
  ]);

  const conceptMap = new Map(concepts.map((concept) => [concept.id, concept]));
  const buckets = aggregateSignals(signals, period);
  const frequentConcepts = [...buckets.values()]
    .sort(compareBuckets)
    .slice(0, 5)
    .map((bucket) => toReportConcept(bucket, conceptMap));

  const reviewCandidates = reviewBuckets(signals, weakTerms, period)
    .sort(compareBuckets)
    .slice(0, 5)
    .map((bucket) => toReportConcept(bucket, conceptMap));

  const codeBackedMoments = codeBackedConcepts(concepts, buckets)
    .slice(0, 5)
    .map((concept) => conceptToReportConcept(concept, buckets.get(concept.id) ?? conceptFallbackBucket(concept), ['code evidence']));

  const interviewQuestions = codeBackedMoments
    .map((item) => {
      const concept = item.id ? conceptMap.get(item.id) : undefined;
      return concept?.interviewQuestion ? { concept: item.label, question: concept.interviewQuestion } : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 5);

  const freshness = await reportFreshness(root, scanRuns);
  const recommendedActions = recommendedActionsForReport(reviewCandidates, codeBackedMoments);
  const summaryLine = summaryLineForReport(codeBackedMoments, frequentConcepts, period);

  const report: ReportJson = {
    schemaVersion: 1,
    generatedAt,
    period,
    rootName: fileIndex.rootName ?? basename(root),
    learner,
    frequentConcepts,
    reviewCandidates,
    codeBackedMoments,
    interviewQuestions,
    summaryLine,
    recommendedActions,
    freshness,
    safety: reportSafety()
  };
  return {
    ...report,
    markdown: formatReport(report)
  };
}

export function resolveReportPeriod(args: string[], now = new Date()): ReportPeriod {
  const parsed = parseReportArgs(args);
  const endNow = new Date(now.toISOString());
  if (parsed.mode === 'day') {
    const start = utcDayStart(endNow);
    const end = new Date(start.getTime() + DAY_MS);
    return period('Daily Contextbook Report', start, end, 'day');
  }
  if (parsed.mode === 'custom') {
    if (!parsed.since || !parsed.until) throw new Error(reportUsage());
    const start = parseUtcDate(parsed.since, '--since');
    const until = parseUtcDate(parsed.until, '--until');
    const end = new Date(until.getTime() + DAY_MS);
    if (end <= start) throw new Error(reportUsage());
    return period('Contextbook Report', start, end, 'custom');
  }
  const start = new Date(endNow.getTime() - 7 * DAY_MS);
  return period('Weekly Contextbook Report', start, endNow, 'week');
}

export function parseReportArgs(args: string[]): { json: boolean; save: boolean; mode: ReportPeriodMode; since?: string; until?: string } {
  let json = false;
  let save = false;
  let mode: ReportPeriodMode = 'week';
  let explicitPeriodFlag: ReportPeriodMode | undefined;
  let since: string | undefined;
  let until: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--save') {
      save = true;
    } else if (arg === '--week') {
      if (explicitPeriodFlag || since || until) throw new Error(reportUsage());
      explicitPeriodFlag = 'week';
      mode = 'week';
    } else if (arg === '--day') {
      if (explicitPeriodFlag || since || until) throw new Error(reportUsage());
      explicitPeriodFlag = 'day';
      mode = 'day';
    } else if (arg === '--since') {
      if (explicitPeriodFlag || since) throw new Error(reportUsage());
      since = args[++index];
      mode = 'custom';
    } else if (arg === '--until') {
      if (explicitPeriodFlag || until) throw new Error(reportUsage());
      until = args[++index];
      mode = 'custom';
    } else {
      throw new Error(reportUsage());
    }
  }
  if (mode === 'custom' && (!since || !until)) throw new Error(reportUsage());
  return { json, save, mode, since, until };
}

export function reportUsage(): string {
  return 'Usage: contextbook report [--day|--week|--since <date> --until <date>] [--json] [--save]';
}

export async function saveReportArtifact(result: ReportResult, options: { root?: string; json?: boolean } = {}): Promise<{ report: ReportResult; artifact: SavedReportArtifact }> {
  const root = options.root ?? process.cwd();
  const format = options.json ? 'json' : 'markdown';
  const persistedReport = withPersistedReportSafety(result);
  const reportsDir = projectPaths(root).reports;
  await ensureDir(reportsDir);
  const filename = reportArtifactFilename(persistedReport, format);
  const path = join(reportsDir, filename);
  const content = format === 'json'
    ? `${JSON.stringify(stripMarkdown(persistedReport), null, 2)}\n`
    : persistedReport.markdown;
  await writeFile(path, content, 'utf8');
  return {
    report: persistedReport,
    artifact: {
      path: relative(root, path).split('\\').join('/'),
      format
    }
  };
}

function withPersistedReportSafety(result: ReportResult): ReportResult {
  const report = {
    ...result,
    safety: {
      ...result.safety,
      persistedReportCreated: true
    }
  };
  return {
    ...report,
    markdown: formatReport(report)
  };
}

function stripMarkdown(result: ReportResult): ReportJson {
  const { markdown: _markdown, ...json } = result;
  return json;
}

function reportArtifactFilename(report: ReportResult, format: 'markdown' | 'json'): string {
  const stamp = report.generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const extension = format === 'json' ? 'json' : 'md';
  return `${stamp}-${report.period.mode}.${extension}`;
}

function period(label: string, start: Date, end: Date, mode: ReportPeriodMode): ReportPeriod {
  return {
    label,
    start: start.toISOString(),
    end: end.toISOString(),
    timezone: 'UTC',
    mode
  };
}

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseUtcDate(value: string | undefined, name: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(reportUsage());
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return date;
}

function aggregateSignals(signals: Record<string, unknown>[], period: ReportPeriod): Map<string, ConceptBucket> {
  const buckets = new Map<string, ConceptBucket>();
  for (const signal of signals) {
    const event = toEvent(signal);
    if (!event || !inPeriod(event.recordedAt, period)) continue;
    const label = conceptLabel(event);
    if (!label) continue;
    addSignalEvent(buckets, event, label);
  }
  return buckets;
}

function reviewBuckets(signals: Record<string, unknown>[], weakTerms: Record<string, { updatedAt: string }>, period: ReportPeriod): ConceptBucket[] {
  const buckets = new Map<string, ConceptBucket>();
  for (const signal of signals) {
    const event = toEvent(signal);
    if (!event || !inPeriod(event.recordedAt, period)) continue;
    if (event.signalType !== 'feedback.confused' && event.signalType !== 'term.repeated' && event.signalType !== 'analogy.rejected') continue;
    const label = conceptLabel(event);
    if (!label) continue;
    addSignalEvent(buckets, event, label);
  }
  for (const [term, record] of Object.entries(weakTerms)) {
    if (!inPeriod(record.updatedAt, period)) continue;
    addManualBucket(buckets, normalizeConceptLabel(term), undefined, term, 'weak-term', 5);
  }
  return [...buckets.values()];
}

function addSignalEvent(buckets: Map<string, ConceptBucket>, event: ConversationMemoryEvent, label: string): void {
  const key = conceptKey(event, label);
  const bucket = buckets.get(key) ?? emptyBucket(event.conceptId, label);
  bucket.rawCount += 1;
  bucket.reasons.add(event.signalType);
  const episodeKey = signalEpisodeKey(event, key);
  if (shouldAddEpisode(bucket, event, episodeKey)) {
    bucket.episodeKeys.add(episodeStorageKey(bucket, event, episodeKey));
    bucket.episodeCount += 1;
    bucket.score += signalWeight(event.signalType);
  }
  buckets.set(key, bucket);
}

function addManualBucket(buckets: Map<string, ConceptBucket>, key: string, id: string | undefined, label: string, reason: string, score: number): void {
  const bucket = buckets.get(key) ?? emptyBucket(id, label);
  bucket.rawCount += 1;
  bucket.episodeCount += 1;
  bucket.score += score;
  bucket.reasons.add(reason);
  buckets.set(key, bucket);
}

function toReportConcept(bucket: ConceptBucket, conceptMap: Map<string, ConceptRecord>): ReportConceptSummary {
  const concept = bucket.id ? conceptMap.get(bucket.id) : undefined;
  if (concept) return conceptToReportConcept(concept, bucket, [...bucket.reasons]);
  return {
    id: bucket.id,
    label: bucket.label,
    count: bucket.episodeCount,
    rawCount: bucket.rawCount,
    episodeCount: bucket.episodeCount,
    score: bucket.score,
    files: [],
    reasons: [...bucket.reasons].sort()
  };
}

function codeBackedConcepts(concepts: ConceptRecord[], buckets: Map<string, ConceptBucket>): ConceptRecord[] {
  return [...concepts]
    .filter((concept) => concept.evidenceLevel !== 'general')
    .sort((a, b) => {
      const scoreDelta = ((buckets.get(b.id)?.score ?? 0) + 2) - ((buckets.get(a.id)?.score ?? 0) + 2);
      if (scoreDelta !== 0) return scoreDelta;
      const countDelta = (buckets.get(b.id)?.episodeCount ?? 0) - (buckets.get(a.id)?.episodeCount ?? 0);
      if (countDelta !== 0) return countDelta;
      const changedDelta = Number(b.signals.some((signal) => signal.changed)) - Number(a.signals.some((signal) => signal.changed));
      if (changedDelta !== 0) return changedDelta;
      return b.signals.length - a.signals.length || a.label.localeCompare(b.label);
    });
}

function conceptToReportConcept(concept: ConceptRecord, bucket: ConceptBucket, reasons: string[]): ReportConceptSummary {
  return {
    id: concept.id,
    label: concept.label,
    count: bucket.episodeCount,
    rawCount: bucket.rawCount,
    episodeCount: bucket.episodeCount,
    score: bucket.score + 2,
    evidenceLevel: concept.evidenceLevel,
    files: rankEvidenceForDisplay(concept.signals).visibleFiles,
    reasons: [...new Set(reasons)].sort()
  };
}

function emptyBucket(id: string | undefined, label: string): ConceptBucket {
  return { id, label, rawCount: 0, episodeCount: 0, score: 0, reasons: new Set<string>(), episodeKeys: new Set<string>() };
}

function conceptFallbackBucket(concept: ConceptRecord): ConceptBucket {
  return { id: concept.id, label: concept.label, rawCount: 0, episodeCount: 0, score: 0, reasons: new Set<string>(), episodeKeys: new Set<string>() };
}

function compareBuckets(a: ConceptBucket, b: ConceptBucket): number {
  return b.score - a.score || b.episodeCount - a.episodeCount || a.label.localeCompare(b.label);
}

function conceptKey(event: ConversationMemoryEvent, label: string): string {
  return event.conceptId ?? normalizeConceptLabel(label);
}

function normalizeConceptLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function signalEpisodeKey(event: ConversationMemoryEvent, key: string): string {
  const day = event.recordedAt?.slice(0, 10) ?? 'unknown-day';
  if (isAutomaticSignal(event.signalType)) {
    return `${key}:${event.signalType}:${event.command ?? ''}:${day}`;
  }
  return `${key}:${event.signalType}:${day}`;
}

function shouldAddEpisode(bucket: ConceptBucket, event: ConversationMemoryEvent, episodeKey: string): boolean {
  if (isAutomaticSignal(event.signalType)) return !bucket.episodeKeys.has(episodeKey);
  return explicitEpisodeCount(bucket, episodeKey) < 2;
}

function episodeStorageKey(bucket: ConceptBucket, event: ConversationMemoryEvent, episodeKey: string): string {
  if (isAutomaticSignal(event.signalType)) return episodeKey;
  return `${episodeKey}:${explicitEpisodeCount(bucket, episodeKey) + 1}`;
}

function explicitEpisodeCount(bucket: ConceptBucket, episodeKey: string): number {
  return [...bucket.episodeKeys].filter((key) => key.startsWith(`${episodeKey}:`)).length;
}

function isAutomaticSignal(signalType: string): boolean {
  return signalType === 'why.answered' || signalType === 'learn.generated' || signalType === 'scan.completed';
}

function signalWeight(signalType: string): number {
  switch (signalType) {
    case 'feedback.confused':
      return 8;
    case 'analogy.rejected':
      return 6;
    case 'term.repeated':
      return 5;
    case 'format.requested':
      return 3;
    case 'feedback.positive':
    case 'analogy.accepted':
      return 2;
    case 'why.answered':
    case 'learn.generated':
      return 1;
    default:
      return 0;
  }
}

function toEvent(value: Record<string, unknown>): ConversationMemoryEvent | undefined {
  if (typeof value.signalType !== 'string') return undefined;
  return value as unknown as ConversationMemoryEvent;
}

function conceptLabel(event: ConversationMemoryEvent): string | undefined {
  return event.conceptLabel ?? event.concept;
}

function inPeriod(value: string | undefined, period: ReportPeriod): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && time >= Date.parse(period.start) && time < Date.parse(period.end);
}

async function reportFreshness(root: string, scanRuns: Awaited<ReturnType<typeof readScanRuns>>): Promise<ReportFreshness> {
  const latestScan = [...scanRuns].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))[0];
  const workingTree = await gitWorkingTreeState(root);
  const workingTreeChanged = Boolean(latestScan && workingTree.available && latestScan.workingTreeFingerprint && latestScan.workingTreeFingerprint !== workingTree.fingerprint);
  const warnings = latestScan?.warnings.map((warning) => `${warning.code}: ${warning.message}`) ?? [];
  const staleHints: string[] = [];
  if (!latestScan) staleHints.push('project-not-scanned');
  if (!workingTree.available) {
    warnings.push('git-unavailable: Working tree state is unavailable; freshness may be incomplete.');
    staleHints.push('git-unavailable');
  }
  if (workingTreeChanged) staleHints.push('working-tree-changed');
  if (warnings.length > 0) staleHints.push('scan-has-warnings');
  return {
    projectScannedAt: latestScan?.scannedAt,
    workingTreeChanged,
    changedFilesSinceScan: workingTreeChanged ? Math.max(0, workingTree.changedFileCount - (latestScan?.changedFiles ?? 0)) : 0,
    warnings,
    staleHints
  };
}

function recommendedActionsForReport(reviewCandidates: ReportConceptSummary[], moments: ReportConceptSummary[]): ProjectRecommendedAction[] {
  const concept = reviewCandidates[0] ?? moments[0];
  const actions: ProjectRecommendedAction[] = [];
  if (concept) {
    actions.push({ command: 'contextbook why "<concept>"', reason: `${concept.label} 복습 후보를 프로젝트 근거와 면접 문장으로 다시 확인합니다.` });
  }
  actions.push({ command: 'contextbook learn', reason: '최근 코드에서 다음 learning moment를 다시 추천받습니다.' });
  return actions;
}

function summaryLineForReport(moments: ReportConceptSummary[], frequent: ReportConceptSummary[], period: ReportPeriod): string {
  const labels = (moments.length ? moments : frequent).slice(0, 3).map((item) => item.label);
  const phrase = periodPhrase(period);
  if (labels.length === 0) return `${phrase} 보고서로 요약할 충분한 개념 신호가 아직 없습니다.`;
  return `${phrase} ${labels.join(', ')}이 핵심 학습 흐름이었습니다.`;
}

function periodPhrase(period: ReportPeriod): string {
  if (period.mode === 'day') return '오늘은';
  if (period.mode === 'week') return '이번 주에는';
  return '선택한 기간에는';
}

function reportSafety() {
  return {
    rawTranscriptIncluded: false,
    rawPromptIncluded: false,
    absolutePathsIncluded: false,
    hiddenEvidencePathsFiltered: true,
    profileMutated: false,
    preferencesMutated: false,
    weakTermsMutated: false,
    projectMemoryMutated: false,
    persistedReportCreated: false,
    unsafeJudgmentIncluded: false
  } as const;
}
