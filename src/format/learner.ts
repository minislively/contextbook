import type { LearnerSummary } from '../types.js';
import { bullet } from './markdown.js';

export function formatLearnerSummary(summary: Omit<LearnerSummary, 'markdown'>): string {
  return [
    '# Learner Memory',
    `현재 learner \`${summary.learner}\`의 개인 학습 메모리를 읽어 요약했습니다.`,
    formatMemoryFiles(summary),
    formatPreferences(summary),
    formatWeakTerms(summary),
    formatWeakTermSuggestions(summary),
    formatRecentSignals(summary),
    formatNextActions(summary),
    '## Safety Boundary',
    '- 원문 전체 대화 저장 없음\n- 사용자 능력/성격 단정 없음\n- 자동 프로필 변경 없음\n- repo 안에 개인 learner memory 저장 없음'
  ].join('\n\n') + '\n';
}

function formatMemoryFiles(summary: Omit<LearnerSummary, 'markdown'>): string {
  const rows = summary.memoryFiles.map((file) => {
    const count = typeof file.records === 'number' ? ` · ${file.records} records` : '';
    return `${file.exists ? '✅' : '⚪'} ${file.path}${count}`;
  });
  return `## Memory Files\n${bullet(rows)}`;
}

function formatPreferences(summary: Omit<LearnerSummary, 'markdown'>): string {
  const order = summary.preferences.explanationOrder.length ? summary.preferences.explanationOrder.join(' → ') : 'not set';
  const avoid = summary.preferences.avoid.length ? summary.preferences.avoid.join(', ') : 'not set';
  return `## Preferences\n- explanation order: ${order}\n- avoid: ${avoid}`;
}

function formatWeakTerms(summary: Omit<LearnerSummary, 'markdown'>): string {
  if (summary.topWeakTerms.length === 0) {
    return '## Top Weak Terms\n아직 기록된 weak term이 없습니다.';
  }
  const rows = summary.topWeakTerms.slice(0, 5).map((term, index) => `${index + 1}. ${term.term} (${term.state}, asked ${term.askedCount})`);
  return `## Top Weak Terms\n${rows.join('\n')}`;
}

function formatWeakTermSuggestions(summary: Omit<LearnerSummary, 'markdown'>): string {
  if (summary.weakTermSuggestions.length === 0) {
    return '## Weak-term Suggestions\n아직 review candidate가 없습니다.';
  }
  const rows = summary.weakTermSuggestions.slice(0, 5).map((candidate, index) => {
    const reason = candidate.reasons[0]?.code ?? 'signal';
    return `${index + 1}. ${candidate.term} (${candidate.urgency}, score ${candidate.score}, ${reason})`;
  });
  return `## Weak-term Suggestions\n${rows.join('\n')}\n\n_자동 저장이 아니라 review 후보입니다._`;
}

function formatRecentSignals(summary: Omit<LearnerSummary, 'markdown'>): string {
  if (summary.recentSignals.length === 0) {
    return '## Recent Signals\n아직 기록된 learner signal이 없습니다.';
  }
  const rows = summary.recentSignals.map((event) => {
    const concept = event.conceptLabel ? ` — ${event.conceptLabel}` : '';
    const evidence = event.evidenceLevel ? ` (${event.evidenceLevel})` : '';
    return `- ${event.signalType}${concept}${evidence}`;
  });
  return `## Recent Signals\n${rows.join('\n')}`;
}

function formatNextActions(summary: Omit<LearnerSummary, 'markdown'>): string {
  return `## Next Action Hints\n${bullet(summary.recommendedActions.map((action) => `\`${action.command}\` — ${action.reason}`))}`;
}
