import type { ConceptRecord, ProjectScanRun, ProjectSummary } from '../types.js';
import { bullet } from './markdown.js';

export function formatProjectSummary(summary: Omit<ProjectSummary, 'markdown'>): string {
  const initialized = summary.memoryFiles.some((file) => file.exists);
  const latestScan = summary.recentScanRuns[0];
  const sections = [
    '# Project Memory',
    initialized
      ? '현재 프로젝트의 `.contextbook/project` 메모리를 읽어 요약했습니다.'
      : '아직 이 프로젝트에서 Contextbook 메모리를 찾지 못했습니다.',
    formatMemoryFiles(summary),
    formatTopConcepts(summary.concepts),
    formatRecentScans(summary.recentScanRuns),
    formatNextActions(summary, latestScan)
  ];
  return `${sections.join('\n\n')}\n`;
}

function formatMemoryFiles(summary: Omit<ProjectSummary, 'markdown'>): string {
  const rows = summary.memoryFiles.map((file) => {
    const count = typeof file.records === 'number' ? ` · ${file.records} records` : '';
    return `${file.exists ? '✅' : '⚪'} ${file.path}${count}`;
  });
  return `## Memory Files\n${bullet(rows)}`;
}

function formatTopConcepts(concepts: ConceptRecord[]): string {
  if (concepts.length === 0) {
    return '## Top Concepts\n아직 감지된 개념이 없습니다. `contextbook scan`을 실행하면 코드 근거 기반 개념이 여기에 표시됩니다.';
  }
  const rows = concepts.slice(0, 5).map((concept, index) => {
    const files = [...new Set(concept.signals.map((signal) => signal.file).filter(Boolean))];
    const changed = concept.signals.some((signal) => signal.changed) ? ' · changed-file' : '';
    const fileText = files.length ? ` · ${files.slice(0, 3).join(', ')}` : '';
    return `${index + 1}. ${concept.label} (${concept.evidenceLevel}, ${concept.signals.length} signals${changed})${fileText}`;
  });
  return `## Top Concepts\n${rows.join('\n')}`;
}

function formatRecentScans(scanRuns: ProjectScanRun[]): string {
  if (scanRuns.length === 0) {
    return '## Recent Scan Runs\n아직 scan 기록이 없습니다.';
  }
  const rows = scanRuns.slice(0, 3).map((run) => {
    const warningText = run.warnings.length ? ` · warnings ${run.warnings.length}` : '';
    return `- ${run.scannedAt} · ${run.filesScanned} files · ${run.conceptsDetected} concepts · ${run.evidenceDetected} evidence${warningText}`;
  });
  const warningRows = scanRuns[0]?.warnings.slice(0, 3).map((warning) => `  - ${warning.code}: ${warning.message}`) ?? [];
  const warningSection = warningRows.length ? `\n\n최근 경고:\n${warningRows.join('\n')}` : '';
  return `## Recent Scan Runs\n${rows.join('\n')}${warningSection}`;
}

function formatNextActions(summary: Omit<ProjectSummary, 'markdown'>, latestScan: ProjectScanRun | undefined): string {
  const actions: string[] = [];
  const hasProjectStore = summary.memoryFiles.some((file) => file.exists);
  if (!hasProjectStore) {
    actions.push('`contextbook init`으로 프로젝트 메모리 폴더를 생성하세요.');
  }
  if (!latestScan) {
    actions.push('`contextbook scan`으로 현재 코드에서 학습 개념 근거를 수집하세요.');
  }
  if (summary.concepts.length > 0) {
    actions.push('`contextbook learn`으로 오늘 볼 Learning Moment 1~3개를 뽑으세요.');
    actions.push('`contextbook why "<concept>"`으로 개념을 프로젝트 말/면접 문장으로 풀어보세요.');
  }
  if (latestScan?.warnings.length) {
    actions.push('scan warning이 있는 파일/디렉터리는 의도한 제외인지 확인하세요.');
  }
  return `## Next Action Hints\n${bullet(actions.length ? actions : ['현재 Project Memory가 준비되어 있습니다. 다음 학습은 `contextbook learn`으로 이어가면 됩니다.'])}`;
}
