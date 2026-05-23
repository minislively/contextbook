import type { ConceptRecord, EvidenceLevel, LearningMomentReason, RankedLearningMoment } from '../types.js';

const evidenceWeight: Record<EvidenceLevel, number> = {
  direct: 30,
  related: 15,
  general: 0
};

export function rankLearningMoments(concepts: ConceptRecord[], changedFiles: Set<string>): RankedLearningMoment[] {
  return concepts
    .map((concept) => rankConcept(concept, changedFiles))
    .sort((a, b) => {
      const aChanged = hasChangedEvidence(a.concept, changedFiles) ? 1 : 0;
      const bChanged = hasChangedEvidence(b.concept, changedFiles) ? 1 : 0;
      if (aChanged !== bChanged) return bChanged - aChanged;

      const scoreDifference = b.score - a.score;
      if (scoreDifference !== 0) return scoreDifference;

      const labelDifference = stableCompare(a.concept.label, b.concept.label);
      if (labelDifference !== 0) return labelDifference;
      return stableCompare(a.concept.id, b.concept.id);
    });
}

function rankConcept(concept: ConceptRecord, changedFiles: Set<string>): RankedLearningMoment {
  const changed = hasChangedEvidence(concept, changedFiles);
  const signalCount = cappedSignalCount(concept);
  const sources = sourceVariety(concept);
  const score = (changed ? 100 : 0) + evidenceWeight[concept.evidenceLevel] + signalCount * 2 + sources * 2;
  const reasons = buildReasons(concept, changed, signalCount, sources);
  return { concept, score, reasons };
}

function buildReasons(concept: ConceptRecord, changed: boolean, signalCount: number, sources: number): LearningMomentReason[] {
  const reasons: LearningMomentReason[] = [];
  if (changed) {
    reasons.push({
      code: 'changed-file',
      label: '변경 파일 근거',
      detail: '최근 변경된 파일에서 이 개념 신호가 발견됐습니다.'
    });
  }

  if (concept.evidenceLevel === 'direct') {
    reasons.push({
      code: 'direct-evidence',
      label: '직접 근거',
      detail: '프로젝트에서 직접적인 코드 신호를 찾았습니다.'
    });
  } else if (concept.evidenceLevel === 'related') {
    reasons.push({
      code: 'related-evidence',
      label: '관련 근거',
      detail: '직접 사용은 아니지만 관련 구조나 패턴이 프로젝트에 있습니다.'
    });
  }

  if (signalCount >= 2) {
    reasons.push({
      code: 'multiple-signals',
      label: '반복 신호',
      detail: '여러 신호가 같은 개념을 가리키고 있습니다.'
    });
  }

  if (sources >= 2) {
    reasons.push({
      code: 'source-variety',
      label: '근거 출처 다양성',
      detail: '코드 내용, 패키지, 파일명 등 여러 종류의 근거가 연결됩니다.'
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      code: 'stable-fallback',
      label: '안정적 후보',
      detail: '현재 프로젝트 근거 중 학습 카드에 포함할 수 있는 안정적인 후보입니다.'
    });
  }

  return reasons;
}

function hasChangedEvidence(concept: ConceptRecord, changedFiles: Set<string>): boolean {
  return concept.signals.some((signal) => signal.changed || (signal.file ? changedFiles.has(signal.file) : false));
}

function cappedSignalCount(concept: ConceptRecord): number {
  return Math.min(concept.signals.length, 5);
}

function sourceVariety(concept: ConceptRecord): number {
  return Math.min(new Set(concept.signals.map((signal) => signal.source ?? 'content')).size, 5);
}

function stableCompare(left: string, right: string): number {
  const normalizedLeft = left.normalize('NFC');
  const normalizedRight = right.normalize('NFC');
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}
