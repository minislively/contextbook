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

export type ProjectScanWarningCode =
  | 'max-files-reached'
  | 'unreadable-file'
  | 'large-file-skipped'
  | 'binary-or-invalid-utf8'
  | 'scan-partial';

export interface ProjectScanWarning {
  code: ProjectScanWarningCode;
  message: string;
  file?: string;
}

export interface ProjectScanRun {
  schemaVersion: 1;
  scanId: string;
  scannedAt: string;
  rootName?: string;
  filesScanned: number;
  bytesScanned: number;
  changedFiles: number;
  conceptsDetected: number;
  evidenceDetected: number;
  warnings: ProjectScanWarning[];
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

export type ConversationCommand = 'scan' | 'learn' | 'why' | 'profile' | 'profile.diff' | 'profile.edit' | 'profile.reset';

export type ConversationSignalType =
  | 'scan.completed'
  | 'learn.generated'
  | 'why.answered'
  | 'profile.viewed'
  | 'profile.diff.viewed'
  | 'profile.edit.path-shown'
  | 'profile.edited'
  | 'profile.reset';

export interface ConversationMemoryEvent {
  schemaVersion: 1;
  kind: 'conversation-memory';
  signalType: ConversationSignalType;
  /** Backward-compatible alias used by v0.1 JSONL readers before structured conversation memory. */
  type?: string;
  command: ConversationCommand;
  learner: string;
  question?: string;
  conceptId?: string;
  conceptLabel?: string;
  /** Backward-compatible alias for answers.jsonl readers. */
  concept?: string;
  evidenceLevel?: EvidenceLevel;
  evidenceFiles?: string[];
  conceptCount?: number;
  metadata?: Record<string, string | number | boolean | null>;
  recordedAt?: string;
}

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
