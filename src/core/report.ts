import { basename } from 'node:path';
import { formatReport } from '../format/report.js';
import { rankEvidenceForDisplay } from '../format/evidence.js';
import { gitWorkingTreeState } from '../scan/git-diff.js';
import { readJsonl } from '../storage/fs-utils.js';
import { learnerPaths, readWeakTerms } from '../storage/user-store.js';
import { readConcepts, readFileIndex, readScanRuns } from '../storage/project-store.js';
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
  ReportResult
} from '../types.js';

export interface ReportBuildOptions extends ContextbookRuntimeOptions {
  args?: string[];
  now?: Date;
}

interface ConceptBucket {
  id?: string;
  label: string;
  count: number;
  reasons: Set<string>;
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
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)
    .map((bucket) => toReportConcept(bucket, conceptMap));

  const reviewCandidates = reviewBuckets(signals, weakTerms, period)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)
    .map((bucket) => toReportConcept(bucket, conceptMap));

  const codeBackedMoments = codeBackedConcepts(concepts, buckets)
    .slice(0, 5)
    .map((concept) => conceptToReportConcept(concept, buckets.get(concept.id)?.count ?? concept.signals.length, ['code evidence']));

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

export function parseReportArgs(args: string[]): { json: boolean; mode: ReportPeriodMode; since?: string; until?: string } {
  let json = false;
  let mode: ReportPeriodMode = 'week';
  let explicitPeriodFlag: ReportPeriodMode | undefined;
  let since: string | undefined;
  let until: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
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
  return { json, mode, since, until };
}

export function reportUsage(): string {
  return 'Usage: contextbook report [--day|--week|--since <date> --until <date>] [--json]';
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
    const key = event.conceptId ?? label.toLowerCase();
    const bucket = buckets.get(key) ?? { id: event.conceptId, label, count: 0, reasons: new Set<string>() };
    bucket.count += 1;
    bucket.reasons.add(event.signalType);
    buckets.set(key, bucket);
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
    addBucket(buckets, event.conceptId ?? label.toLowerCase(), event.conceptId, label, event.signalType);
  }
  for (const [term, record] of Object.entries(weakTerms)) {
    if (!inPeriod(record.updatedAt, period)) continue;
    addBucket(buckets, term.toLowerCase(), undefined, term, 'weak-term');
  }
  return [...buckets.values()];
}

function addBucket(buckets: Map<string, ConceptBucket>, key: string, id: string | undefined, label: string, reason: string): void {
  const bucket = buckets.get(key) ?? { id, label, count: 0, reasons: new Set<string>() };
  bucket.count += 1;
  bucket.reasons.add(reason);
  buckets.set(key, bucket);
}

function toReportConcept(bucket: ConceptBucket, conceptMap: Map<string, ConceptRecord>): ReportConceptSummary {
  const concept = bucket.id ? conceptMap.get(bucket.id) : undefined;
  if (concept) return conceptToReportConcept(concept, bucket.count, [...bucket.reasons]);
  return {
    id: bucket.id,
    label: bucket.label,
    count: bucket.count,
    files: [],
    reasons: [...bucket.reasons].sort()
  };
}

function codeBackedConcepts(concepts: ConceptRecord[], buckets: Map<string, ConceptBucket>): ConceptRecord[] {
  return [...concepts]
    .filter((concept) => concept.evidenceLevel !== 'general')
    .sort((a, b) => {
      const countDelta = (buckets.get(b.id)?.count ?? 0) - (buckets.get(a.id)?.count ?? 0);
      if (countDelta !== 0) return countDelta;
      const changedDelta = Number(b.signals.some((signal) => signal.changed)) - Number(a.signals.some((signal) => signal.changed));
      if (changedDelta !== 0) return changedDelta;
      return b.signals.length - a.signals.length || a.label.localeCompare(b.label);
    });
}

function conceptToReportConcept(concept: ConceptRecord, count: number, reasons: string[]): ReportConceptSummary {
  return {
    id: concept.id,
    label: concept.label,
    count,
    evidenceLevel: concept.evidenceLevel,
    files: rankEvidenceForDisplay(concept.signals).visibleFiles,
    reasons: [...new Set(reasons)].sort()
  };
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
