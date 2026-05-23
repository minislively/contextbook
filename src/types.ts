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

export type LearningMomentReasonCode =
  | 'changed-file'
  | 'direct-evidence'
  | 'related-evidence'
  | 'multiple-signals'
  | 'source-variety'
  | 'stable-fallback';

export interface LearningMomentReason {
  code: LearningMomentReasonCode;
  label: string;
  detail: string;
}

export interface RankedLearningMoment {
  concept: ConceptRecord;
  score: number;
  reasons: LearningMomentReason[];
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

export type ProjectFileIndexStatus = 'scanned' | 'skipped';

export type ProjectFileIndexKind = 'file' | 'directory';

export type ProjectFileSkipReason =
  | 'hidden-dir'
  | 'ignored-dir'
  | 'unsupported-extension'
  | 'large-file'
  | 'unreadable-file'
  | 'max-files-reached';

export interface ProjectFileIndexEntry {
  path: string;
  kind: ProjectFileIndexKind;
  status: ProjectFileIndexStatus;
  sizeBytes?: number;
  reason?: ProjectFileSkipReason;
}

export interface ProjectFileIndex {
  schemaVersion: 1;
  generatedAt?: string;
  rootName?: string;
  totals: {
    scanned: number;
    skipped: number;
    bytesScanned: number;
  };
  files: ProjectFileIndexEntry[];
}

export type ProjectMemoryFileName = 'config' | 'concepts' | 'evidence' | 'fileIndex' | 'scanRuns';

export interface ProjectMemoryFileStatus {
  name: ProjectMemoryFileName;
  path: string;
  exists: boolean;
  records?: number;
}

export interface ProjectSummaryConcept {
  id: string;
  label: string;
  evidenceLevel: EvidenceLevel;
  signalCount: number;
  changed: boolean;
  files: string[];
  connectedConcepts: string[];
  interviewQuestion: string;
}

export interface ProjectFileIndexSummary {
  generatedAt?: string;
  totals: ProjectFileIndex['totals'];
  sampleFiles: ProjectFileIndexEntry[];
}

export interface ProjectRecommendedAction {
  command: string;
  reason: string;
}

export interface ProjectSummarySafety {
  absolutePathsIncluded: false;
  hiddenContentIncluded: false;
  profileMutated: false;
  persistedSummaryCreated: false;
}

export interface ProjectSummaryJson {
  schemaVersion: 1;
  generatedAt: string;
  rootName?: string;
  memoryFiles: ProjectMemoryFileStatus[];
  topConcepts: ProjectSummaryConcept[];
  recentScanRuns: ProjectScanRun[];
  fileIndexSummary: ProjectFileIndexSummary;
  evidenceCount: number;
  recommendedActions: ProjectRecommendedAction[];
  safety: ProjectSummarySafety;
}

export interface ProjectSummary {
  generatedAt: string;
  rootName?: string;
  memoryFiles: ProjectMemoryFileStatus[];
  concepts: ConceptRecord[];
  recentScanRuns: ProjectScanRun[];
  fileIndex: ProjectFileIndex;
  evidenceCount: number;
  markdown: string;
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

export type LearnerMemoryFileName = 'profile' | 'preferences' | 'weakTerms' | 'signals' | 'answers' | 'profileUpdates';

export interface LearnerMemoryFileStatus {
  name: LearnerMemoryFileName;
  path: string;
  exists: boolean;
  records?: number;
}

export interface LearnerWeakTermSummary extends WeakTermRecord {
  term: string;
}

export interface LearnerRecommendedAction {
  command: string;
  reason: string;
}

export type WeakTermSuggestionReasonCode =
  | 'confused-feedback'
  | 'repeated-term'
  | 'analogy-rejected'
  | 'format-requested'
  | 'recent-question'
  | 'positive-feedback'
  | 'analogy-accepted'
  | 'existing-weak-term';

export interface WeakTermSuggestionReason {
  code: WeakTermSuggestionReasonCode;
  signalType?: ConversationSignalType;
  weight: number;
  detail: string;
  count: number;
}

export interface WeakTermSuggestionCandidate {
  term: string;
  score: number;
  urgency: 'low' | 'medium' | 'high';
  signalCount: number;
  lastSeenAt?: string;
  existingWeakTerm?: LearnerWeakTermSummary;
  reasons: WeakTermSuggestionReason[];
  recommendedActions: LearnerRecommendedAction[];
}

export interface WeakTermSuggestionsSafety {
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  profileMutated: false;
  weakTermsMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface WeakTermSuggestionsJson {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  candidates: WeakTermSuggestionCandidate[];
  eventCounts: {
    signals: number;
  };
  safety: WeakTermSuggestionsSafety;
}

export type ProfileUpdateCandidateTarget = 'Preferred Explanation' | 'Avoid' | 'Analogy Notes';

export type ProfileUpdateCandidateReasonCode =
  | 'project-first-requested'
  | 'abstract-confusion'
  | 'format-requested'
  | 'analogy-accepted'
  | 'analogy-rejected'
  | 'positive-feedback';

export interface ProfileUpdateCandidateReason {
  code: ProfileUpdateCandidateReasonCode;
  signalType?: ConversationSignalType;
  detail: string;
  count: number;
}

export interface ProfileUpdateCandidate {
  targetSection: ProfileUpdateCandidateTarget;
  suggestion: string;
  confidence: 'low' | 'medium' | 'high';
  signalCount: number;
  lastSeenAt?: string;
  currentContext: {
    explanationOrder: string[];
    avoid: string[];
    profileSections: string[];
  };
  reasons: ProfileUpdateCandidateReason[];
  recommendedActions: LearnerRecommendedAction[];
}

export interface ProfileUpdateCandidatesSafety {
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  profileMutated: false;
  preferencesMutated: false;
  weakTermsMutated: false;
  profileUpdatesMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface ProfileUpdateCandidatesJson {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  candidates: ProfileUpdateCandidate[];
  eventCounts: {
    signals: number;
  };
  safety: ProfileUpdateCandidatesSafety;
}

export interface LearnerSummarySafety {
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  profileMutated: false;
  preferencesMutated: false;
  weakTermsMutated: false;
  profileUpdatesMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface LearnerSummaryJson {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  memoryFiles: LearnerMemoryFileStatus[];
  preferences: LearnerPreferences;
  profileSections: string[];
  topWeakTerms: LearnerWeakTermSummary[];
  weakTermSuggestions: WeakTermSuggestionCandidate[];
  profileUpdateCandidates: ProfileUpdateCandidate[];
  recentSignals: ConversationMemoryEvent[];
  eventCounts: {
    signals: number;
    answers: number;
    profileUpdates: number;
  };
  recommendedActions: LearnerRecommendedAction[];
  safety: LearnerSummarySafety;
}

export interface LearnerSummary extends Omit<LearnerSummaryJson, 'schemaVersion'> {
  markdown: string;
}

export type ConversationCommand = 'scan' | 'learn' | 'why' | 'profile' | 'profile.diff' | 'profile.edit' | 'profile.reset' | 'memory.add-signal' | 'memory.signals' | 'memory.suggest-weak-terms' | 'memory.suggest-profile-updates';

export type ConversationSignalType =
  | 'scan.completed'
  | 'learn.generated'
  | 'why.answered'
  | 'profile.viewed'
  | 'profile.diff.viewed'
  | 'profile.edit.path-shown'
  | 'profile.edited'
  | 'profile.reset'
  | 'feedback.positive'
  | 'feedback.confused'
  | 'format.requested'
  | 'analogy.accepted'
  | 'analogy.rejected'
  | 'term.repeated';


export interface MemorySignalsSafety {
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  profileMutated: false;
  weakTermsMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface MemorySignalsJson {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  signalTypes: ConversationSignalType[];
  recentSignals: ConversationMemoryEvent[];
  eventCounts: {
    signals: number;
  };
  safety: MemorySignalsSafety;
}

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
  moments: RankedLearningMoment[];
  changedFiles: string[];
  markdown: string;
}

export interface WhyResult {
  question: string;
  concept: string;
  evidenceLevel: EvidenceLevel;
  markdown: string;
}
