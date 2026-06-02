import type { ReportConceptSummary, ReportJson } from '../types.js';
import { bullet } from './markdown.js';

export function formatReport(report: ReportJson): string {
  return [
    `# ${report.period.label}`,
    formatPeriodRange(report),
    report.summaryLine,
    formatRecommendedActions(report),
    formatFrequentConcepts(report.frequentConcepts, periodNoun(report)),
    formatReviewCandidates(report.reviewCandidates),
    formatCodeBackedMoments(report.codeBackedMoments),
    formatInterviewQuestions(report),
    formatReferenceStatus(report)
  ].join('\n\n') + '\n';
}


function formatPeriodRange(report: ReportJson): string {
  const start = report.period.start.slice(0, 10);
  const end = displayEndDate(report);
  const range = start === end ? start : `${start} ~ ${end}`;
  return `기간: ${range} (${report.period.timezone})`;
}

function displayEndDate(report: ReportJson): string {
  if (report.period.mode === 'day' || report.period.mode === 'custom') {
    return new Date(Date.parse(report.period.end) - 1).toISOString().slice(0, 10);
  }
  return report.period.end.slice(0, 10);
}

function formatFrequentConcepts(concepts: ReportConceptSummary[], noun: string): string {
  if (concepts.length === 0) return `## ${noun} 핵심 개념\n아직 ${periodParticle(noun)} 기록된 개념이 없습니다.`;
  return `## ${noun} 핵심 개념\n${concepts.map((concept, index) => [
    `${index + 1}. ${concept.label}`,
    `   - 왜 볼 만함: ${conceptReason(concept, index, noun)}`,
    concept.files.length ? `   - 코드 근거: ${concept.files.join(', ')}` : undefined
  ].filter(Boolean).join('\n')).join('\n')}`;
}

function formatReviewCandidates(concepts: ReportConceptSummary[]): string {
  if (concepts.length === 0) return '## 다시 보면 좋은 개념\n아직 복습 후보로 볼 만한 기간 내 신호가 없습니다.';
  return `## 다시 보면 좋은 개념\n${bullet(concepts.map((concept) => `${concept.label} — ${humanReviewReasons(concept.reasons).join(', ')}`))}`;
}

function formatCodeBackedMoments(concepts: ReportConceptSummary[]): string {
  if (concepts.length === 0) return '## 코드 근거가 있는 Learning Moments\n아직 코드 근거가 있는 learning moment가 없습니다.';
  return `## 코드 근거가 있는 Learning Moments\n${bullet(concepts.map((concept) => `${concept.label}${concept.files.length ? ` — ${concept.files.join(', ')}` : ''}`))}`;
}

function formatInterviewQuestions(report: ReportJson): string {
  if (report.interviewQuestions.length === 0) return '## 회상/면접 질문\n아직 생성할 질문이 없습니다.';
  return `## 회상/면접 질문\n${report.interviewQuestions.map((item, index) => `${index + 1}. ${item.question}`).join('\n')}`;
}

function formatRecommendedActions(report: ReportJson): string {
  return `## 바로 할 일\n${bullet(report.recommendedActions.map((action) => `\`${action.command}\` — ${action.reason}`))}`;
}

function formatReferenceStatus(report: ReportJson): string {
  return [
    '## 참고 상태',
    ...humanFreshnessLines(report),
    report.safety.persistedReportCreated
      ? '- 이 보고서는 `.contextbook/reports`에 저장된 복습 아티팩트입니다.'
      : '- 기본 보고서는 읽기 전용이며 `.contextbook/reports`에 파일을 만들지 않습니다. 저장하려면 `contextbook report --save`를 사용하세요.',
    '- 이 보고서는 안전한 학습 신호만 읽으며, 원문 프롬프트나 대화 전문은 포함하지 않습니다.',
    '- 자세한 감사 정보와 원본 코드 값은 `contextbook report --json`에서 확인할 수 있습니다.'
  ].join('\n');
}

function conceptReason(concept: ReportConceptSummary, index: number, noun: string): string {
  if (concept.count > 1 && index === 0) return `${periodParticle(noun)} 가장 자주 반복된 주제입니다.`;
  if (concept.count > 1) return `${periodParticle(noun)} ${concept.count}번 기록된 주제입니다.`;
  if (concept.evidenceLevel === 'direct') return '현재 코드에서 직접 근거를 찾은 주제입니다.';
  if (concept.evidenceLevel === 'related') return '현재 코드 구조와 연결되는 주제입니다.';
  return `${noun} 학습 기록에 등장한 주제입니다.`;
}

function periodNoun(report: ReportJson): string {
  if (report.period.mode === 'day') return '오늘';
  if (report.period.mode === 'week') return '이번 주';
  return '선택한 기간';
}

function periodParticle(noun: string): string {
  return noun === '오늘' ? '오늘' : `${noun}에`;
}

function humanReviewReasons(reasons: string[]): string[] {
  const mapped = reasons.map((reason) => {
    switch (reason) {
      case 'feedback.confused':
        return '최근 헷갈린 기록이 있음';
      case 'term.repeated':
        return '반복해서 다시 나온 용어';
      case 'analogy.rejected':
        return '비유가 잘 맞지 않았던 개념';
      case 'format.requested':
        return '다른 설명 방식이 필요했던 개념';
      case 'why.answered':
        return '최근 질문했던 개념';
      case 'learn.generated':
        return '학습 카드에 나온 개념';
      case 'weak-term':
        return '복습 후보';
      default:
        return '복습 후보';
    }
  });
  return [...new Set(mapped)].sort();
}

function humanFreshnessLines(report: ReportJson): string[] {
  const lines: string[] = [];
  if (!report.freshness.projectScannedAt) {
    lines.push('- 프로젝트 스캔 기록이 아직 없습니다. 먼저 `contextbook scan`을 실행해보세요.');
  } else if (report.freshness.staleHints.includes('git-unavailable')) {
    lines.push('- 현재 Git 상태를 확인하지 못해 스캔 최신성을 완전히 판단할 수 없습니다. 자세한 내용은 `contextbook report --json`에서 확인하세요.');
  } else if (report.freshness.workingTreeChanged && report.freshness.changedFilesSinceScan > 0) {
    lines.push('- 프로젝트 스캔 이후 코드 상태가 달라졌을 수 있습니다. 필요하면 `contextbook scan`을 다시 실행하세요.');
  } else if (report.freshness.workingTreeChanged) {
    lines.push('- 최근 스캔은 현재 Git 상태와 다른 시점에 만들어졌습니다. 현재 미커밋 변경 파일은 없지만, 정확도를 위해 필요하면 `contextbook scan`을 다시 실행하세요.');
  } else {
    lines.push('- 프로젝트 스캔 상태는 현재 코드와 맞습니다.');
  }
  if (report.freshness.warnings.length > 0) {
    lines.push('- 최근 스캔에서 일부 파일이 제외되었거나 주의할 점이 있었습니다. 자세한 내용은 `contextbook report --json`에서 확인하세요.');
  }
  return lines;
}
