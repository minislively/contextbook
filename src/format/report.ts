import type { ReportConceptSummary, ReportJson } from '../types.js';
import { bullet } from './markdown.js';

export function formatReport(report: ReportJson): string {
  return [
    `# ${report.period.label}`,
    formatMeta(report),
    formatFrequentConcepts(report.frequentConcepts),
    formatReviewCandidates(report.reviewCandidates),
    formatCodeBackedMoments(report.codeBackedMoments),
    formatInterviewQuestions(report),
    '## 이번 기간 한 줄 요약',
    report.summaryLine,
    formatRecommendedActions(report),
    formatFreshness(report)
  ].join('\n\n') + '\n';
}

function formatMeta(report: ReportJson): string {
  return [
    `- period: ${report.period.start} → ${report.period.end}`,
    `- timezone: ${report.period.timezone}`,
    `- project: ${report.rootName ?? 'unknown'}`,
    `- learner: ${report.learner}`,
    '- source: learner signals-only snapshot; answers.jsonl is intentionally excluded in this MVP to avoid double-counting paired answer/signal events',
    `- evidence freshness: ${report.freshness.staleHints.length ? report.freshness.staleHints.join(', ') : 'current'}`
  ].join('\n');
}

function formatFrequentConcepts(concepts: ReportConceptSummary[]): string {
  if (concepts.length === 0) return '## 이번 기간 자주 나온 개념\n아직 기간 안에 기록된 개념 신호가 없습니다.';
  return `## 이번 기간 자주 나온 개념\n${concepts.map((concept, index) => `${index + 1}. ${concept.label} — ${concept.count} signals${concept.evidenceLevel ? `, ${concept.evidenceLevel} evidence` : ''}`).join('\n')}`;
}

function formatReviewCandidates(concepts: ReportConceptSummary[]): string {
  if (concepts.length === 0) return '## 다시 보면 좋은 개념\n아직 복습 후보로 볼 만한 기간 내 신호가 없습니다.';
  return `## 다시 보면 좋은 개념\n${bullet(concepts.map((concept) => `${concept.label} — ${concept.reasons.join(', ')}`))}`;
}

function formatCodeBackedMoments(concepts: ReportConceptSummary[]): string {
  if (concepts.length === 0) return '## 코드 근거가 있는 Learning Moments\n아직 코드 근거가 있는 learning moment가 없습니다.';
  return `## 코드 근거가 있는 Learning Moments\n${bullet(concepts.map((concept) => `${concept.label}${concept.files.length ? ` — ${concept.files.join(', ')}` : ''}`))}`;
}

function formatInterviewQuestions(report: ReportJson): string {
  if (report.interviewQuestions.length === 0) return '## 면접 질문 모음\n아직 생성할 면접 질문이 없습니다.';
  return `## 면접 질문 모음\n${report.interviewQuestions.map((item, index) => `${index + 1}. ${item.question}`).join('\n')}`;
}

function formatRecommendedActions(report: ReportJson): string {
  return `## 다음 복습 액션\n${bullet(report.recommendedActions.map((action) => `\`${action.command}\` — ${action.reason}`))}`;
}

function formatFreshness(report: ReportJson): string {
  const warnings = report.freshness.warnings.length
    ? bullet(report.freshness.warnings)
    : '- 없음';
  return [
    '## Freshness',
    `- project scanned at: ${report.freshness.projectScannedAt ?? 'unknown'}`,
    `- working tree changed: ${report.freshness.workingTreeChanged}`,
    `- changed files since scan: ${report.freshness.changedFilesSinceScan}`,
    'warnings:',
    warnings,
    '',
    '## Safety',
    '- read-only: true',
    '- raw prompt/transcript included: false',
    '- unsafe learner judgment included: false',
    '- persisted report created: false'
  ].join('\n');
}
