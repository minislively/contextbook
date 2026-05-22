import type { ConceptRecord, EvidenceRecord, EvidenceLevel } from '../types.js';
import { conceptRules } from './rules.js';

const rank: Record<EvidenceLevel, number> = { general: 0, related: 1, direct: 2 };
const packageConceptHints: Record<string, string> = {
  zustand: 'zustand-state',
  axios: 'http-async',
  react: 'context-api'
};

export interface MapEvidenceOptions {
  changedFiles?: Set<string>;
  packageJson?: Record<string, unknown> | null;
}

export function mapEvidence(files: { file: string; content: string }[], options: MapEvidenceOptions = {}): { concepts: ConceptRecord[]; evidence: EvidenceRecord[] } {
  const now = new Date().toISOString();
  const evidence: EvidenceRecord[] = [];
  const changedFiles = options.changedFiles ?? new Set<string>();

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
          detectedAt: now,
          changed: changedFiles.has(item.file),
          source: 'content'
        });
      }
    }
    evidence.push(...fileAndFunctionEvidence(item, now, changedFiles));
  }

  evidence.push(...packageEvidence(options.packageJson, now));

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
      signals: signals.sort((a, b) => Number(Boolean(b.changed)) - Number(Boolean(a.changed))),
      connectedConcepts: rule.connectedConcepts,
      interviewQuestion: rule.interviewQuestion,
      updatedAt: now
    };
  });

  concepts.sort((a, b) => {
    const aChanged = a.signals.some((signal) => signal.changed) ? 1 : 0;
    const bChanged = b.signals.some((signal) => signal.changed) ? 1 : 0;
    return bChanged - aChanged || rank[b.evidenceLevel] - rank[a.evidenceLevel] || b.signals.length - a.signals.length || a.label.localeCompare(b.label);
  });
  return { concepts, evidence };
}

function fileAndFunctionEvidence(item: { file: string; content: string }, now: string, changedFiles: Set<string>): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  const haystack = `${item.file}\n${extractFunctionNames(item.content).join('\n')}`.toLowerCase();
  const add = (conceptId: string, signal: string, reason: string, source: 'file-name' | 'function-name') => {
    const rule = conceptRules.find((candidate) => candidate.id === conceptId);
    if (!rule) return;
    records.push({
      conceptId,
      evidenceLevel: rule.evidenceLevel,
      file: item.file,
      signal,
      reason,
      detectedAt: now,
      changed: changedFiles.has(item.file),
      source
    });
  };
  if (/sse($|[^a-z])|(^|[^a-z])sse|eventsource|event-source/.test(haystack)) add('sse', 'file/function name mentions SSE/EventSource', 'File or function naming suggests SSE/event handling responsibility.', haystack.includes(item.file.toLowerCase()) ? 'file-name' : 'function-name');
  if (/websocket|web-socket/.test(haystack)) add('websocket', 'file/function name mentions WebSocket', 'File or function naming suggests WebSocket realtime communication.', 'file-name');
  if (/cleanup|lifecycle|dispose|unsubscribe/.test(haystack)) add('use-effect-cleanup', 'file/function name mentions cleanup/lifecycle', 'File or function naming suggests cleanup or resource lifecycle responsibility.', 'function-name');
  if (/node|edge|graph|dag/.test(haystack) && (/nodes/.test(item.content) || /edges/.test(item.content) || /graph|dag/.test(haystack))) add('graph-dag', 'file/function name mentions graph nodes/edges', 'File or function naming suggests graph or dependency modeling.', 'file-name');
  return records;
}

function extractFunctionNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(/(?:function\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1] ?? '');
  }
  for (const match of content.matchAll(/export\s+function\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1] ?? '');
  }
  return [...names].filter(Boolean);
}

function packageEvidence(packageJson: Record<string, unknown> | null | undefined, now: string): EvidenceRecord[] {
  if (!packageJson) return [];
  const deps = {
    ...objectValue(packageJson.dependencies),
    ...objectValue(packageJson.devDependencies),
    ...objectValue(packageJson.peerDependencies)
  };
  return Object.keys(deps).flatMap((dep) => {
    const conceptId = packageConceptHints[dep.toLowerCase()];
    const rule = conceptId ? conceptRules.find((candidate) => candidate.id === conceptId) : undefined;
    if (!rule) return [];
    return [{
      conceptId,
      evidenceLevel: conceptId === 'context-api' ? 'related' as const : rule.evidenceLevel,
      file: 'package.json',
      signal: `package dependency: ${dep}`,
      reason: `package.json dependency ${dep} suggests ${rule.label}.`,
      detectedAt: now,
      changed: false,
      source: 'package' as const
    }];
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
