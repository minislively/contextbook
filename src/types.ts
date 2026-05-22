export type EvidenceLevel = 'direct' | 'related' | 'general';

export interface EvidenceRecord {
  conceptId: string;
  evidenceLevel: EvidenceLevel;
  file?: string;
  line?: number;
  signal: string;
  reason: string;
  detectedAt: string;
  changed?: boolean;
  source?: 'content' | 'package' | 'file-name' | 'function-name';
}

export interface ConceptRecord {
  id: string;
  label: string;
  evidenceLevel: EvidenceLevel;
  signals: EvidenceRecord[];
  connectedConcepts: string[];
  interviewQuestion: string;
  updatedAt: string;
}

export interface ProjectConfig {
  version: string;
  learner: string;
  createdAt: string;
}

export interface LearnerPreferences {
  explanationOrder: string[];
  avoid: string[];
}

export interface WeakTermRecord {
  state: 'unseen' | 'introduced' | 'learning' | 'drill' | 'ready';
  askedCount: number;
  missingPieces?: string[];
  bestAnalogy?: string;
  updatedAt: string;
}

export type WeakTerms = Record<string, WeakTermRecord>;

export interface ContextbookRuntimeOptions {
  root?: string;
  learner?: string;
}

export interface ScanResult {
  filesScanned: number;
  conceptsDetected: number;
  evidenceDetected: number;
  changedFiles: number;
  concepts: ConceptRecord[];
  evidence: EvidenceRecord[];
}

export interface LearnResult {
  concepts: ConceptRecord[];
  changedFiles: string[];
  markdown: string;
}

export interface WhyResult {
  question: string;
  concept: string;
  evidenceLevel: EvidenceLevel;
  markdown: string;
}
