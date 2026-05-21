import type { ConceptRecord, EvidenceRecord, EvidenceLevel } from '../types.js';
import { conceptRules } from './rules.js';

const rank: Record<EvidenceLevel, number> = { general: 0, related: 1, direct: 2 };

export function mapEvidence(files: { file: string; content: string }[]): { concepts: ConceptRecord[]; evidence: EvidenceRecord[] } {
  const now = new Date().toISOString();
  const evidence: EvidenceRecord[] = [];

  for (const item of files) {
    for (const rule of conceptRules) {
      for (const match of rule.match(item.content, item.file)) {
        evidence.push({
          conceptId: rule.id,
          evidenceLevel: rule.evidenceLevel,
          file: item.file,
          line: match.line,
          signal: match.signal,
          reason: rule.reason,
          detectedAt: now
        });
      }
    }
  }

  const byConcept = new Map<string, EvidenceRecord[]>();
  for (const record of evidence) {
    const list = byConcept.get(record.conceptId) ?? [];
    list.push(record);
    byConcept.set(record.conceptId, list);
  }

  const concepts: ConceptRecord[] = [...byConcept.entries()].map(([id, signals]) => {
    const rule = conceptRules.find((candidate) => candidate.id === id)!;
    const evidenceLevel = signals.reduce<EvidenceLevel>((best, current) => rank[current.evidenceLevel] > rank[best] ? current.evidenceLevel : best, 'general');
    return {
      id,
      label: rule.label,
      evidenceLevel,
      signals,
      connectedConcepts: rule.connectedConcepts,
      interviewQuestion: rule.interviewQuestion,
      updatedAt: now
    };
  });

  concepts.sort((a, b) => rank[b.evidenceLevel] - rank[a.evidenceLevel] || b.signals.length - a.signals.length || a.label.localeCompare(b.label));
  return { concepts, evidence };
}

export function findConceptForQuestion(question: string, concepts: ConceptRecord[]): ConceptRecord | undefined {
  const normalized = question.toLowerCase();
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  for (const rule of conceptRules) {
    if (!conceptIds.has(rule.id)) continue;
    if (rule.aliases.some((alias) => normalized.includes(alias.toLowerCase()))) {
      return concepts.find((concept) => concept.id === rule.id);
    }
  }
  return concepts[0];
}

export function conceptMetadata(id: string) {
  return conceptRules.find((rule) => rule.id === id);
}

export function inferGeneralConcept(question: string) {
  const normalized = question.toLowerCase();
  return conceptRules.find((rule) => rule.aliases.some((alias) => normalized.includes(alias.toLowerCase())));
}
