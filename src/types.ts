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
  workingTreeFingerprint?: string;
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
  preferredLanguage?: 'ko' | 'en';
  outputLength?: 'short' | 'default';
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
  id: string;
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

export type ApplyProfileUpdateOperation = 'append-preference' | 'append-avoid' | 'skip-identical' | 'unsupported-target';

export interface ApplyProfileUpdateChange {
  file: 'preferences.json' | 'profile.md';
  operation: ApplyProfileUpdateOperation;
  before?: string[];
  after?: string[];
  message: string;
}

export interface ApplyProfileUpdateSafety {
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  hiddenContentIncluded: false;
  projectMemoryMutated: false;
  weakTermsMutated: false;
  profileMutated: false;
  preferencesMutated: boolean;
  unsafeJudgmentIncluded: false;
}

export interface ApplyProfileUpdateResult {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  applied: boolean;
  dryRun: boolean;
  candidate: ProfileUpdateCandidate;
  changes: ApplyProfileUpdateChange[];
  auditEvent?: ConversationMemoryEvent;
  backupCreated?: string;
  safety: ApplyProfileUpdateSafety;
}

export type ApplyPreferenceSignalOperation =
  | 'set-language'
  | 'set-output-length'
  | 'move-explanation-order'
  | 'append-avoid'
  | 'skip-identical'
  | 'skip-unsafe-route'
  | 'unsupported-dimension';

export interface ApplyPreferenceSignalChange {
  file: 'preferences.json';
  operation: ApplyPreferenceSignalOperation;
  before?: unknown;
  after?: unknown;
  message: string;
  signal?: {
    dimension: string;
    value: string;
    route: PreferenceApplyRoute;
  };
}

export interface ApplyPreferenceSignalsSafety {
  rawTranscriptIncluded: false;
  rawPromptPersisted: false;
  absolutePathsIncluded: false;
  hiddenContentIncluded: false;
  projectMemoryMutated: false;
  profileMutated: false;
  preferencesMutated: boolean;
  weakTermsMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface ApplyPreferenceSignalsResult {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  source: PromptCaptureSource;
  dryRun: boolean;
  applied: boolean;
  preferenceSignals: PreferenceSignalCandidate[];
  changes: ApplyPreferenceSignalChange[];
  auditEvent?: ConversationMemoryEvent;
  backupCreated?: string;
  safety: ApplyPreferenceSignalsSafety;
}

export type PreferenceHistoryCommand = 'memory.apply-profile-update' | 'memory.apply-preference-signals' | 'profile.reset' | 'memory.undo-preference-update';

export interface PreferenceHistoryEntry {
  id: string;
  index: number;
  appliedAt: string;
  command: PreferenceHistoryCommand;
  file: 'preferences.json';
  backup: string;
  canUndo: boolean;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface PreferenceHistorySafety {
  rawTranscriptIncluded: false;
  rawPromptPersisted: false;
  absolutePathsIncluded: false;
  hiddenContentIncluded: false;
  projectMemoryMutated: false;
  profileMutated: false;
  preferencesMutated: false;
  weakTermsMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface PreferenceHistoryResult {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  entries: PreferenceHistoryEntry[];
  eventCounts: {
    profileUpdates: number;
    undoableEntries: number;
  };
  safety: PreferenceHistorySafety;
}

export type UndoPreferenceUpdateOperation = 'restore-snapshot' | 'skip-identical';

export interface UndoPreferenceUpdateChange {
  file: 'preferences.json';
  operation: UndoPreferenceUpdateOperation;
  before?: LearnerPreferences;
  after?: LearnerPreferences;
  message: string;
}

export interface UndoPreferenceUpdateSafety {
  rawTranscriptIncluded: false;
  rawPromptPersisted: false;
  absolutePathsIncluded: false;
  hiddenContentIncluded: false;
  projectMemoryMutated: false;
  profileMutated: false;
  preferencesMutated: boolean;
  weakTermsMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface UndoPreferenceUpdateResult {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  dryRun: boolean;
  applied: boolean;
  entry: PreferenceHistoryEntry;
  changes: UndoPreferenceUpdateChange[];
  auditEvent?: ConversationMemoryEvent;
  backupCreated?: string;
  safety: UndoPreferenceUpdateSafety;
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

export type ConversationCommand = 'scan' | 'learn' | 'why' | 'profile' | 'profile.diff' | 'profile.edit' | 'profile.reset' | 'memory.add-signal' | 'memory.capture-prompt' | 'memory.signals' | 'memory.suggest-weak-terms' | 'memory.suggest-profile-updates' | 'memory.apply-profile-update' | 'memory.apply-preference-signals' | 'memory.preference-history' | 'memory.undo-preference-update' | 'memory.context';

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
  | 'term.repeated'
  | 'profile-update.applied';

export type PromptCaptureSource = 'manual' | 'codex' | 'claude-code';

export type PreferenceApplyRoute = 'auto-apply-safe' | 'candidate-only' | 'signal-only' | 'ignore';
export type PreferencePolarity = 'positive' | 'negative' | 'neutral';
export type PreferenceExplicitness = 'explicit' | 'implicit';
export type PreferenceConfidence = 'low' | 'medium' | 'high';
export type PreferenceIntent =
  | 'task-command'
  | 'turn-format-request'
  | 'session-style-request'
  | 'preference-statement'
  | 'correction-feedback'
  | 'meta-question'
  | 'unsafe-self-assessment';
export type PreferenceScope = 'turn-local' | 'session-local' | 'persistent-candidate' | 'persistent-explicit';
export type PreferenceRisk = 'low' | 'medium' | 'high';
export type PreferencePolicy = 'observe-only' | 'suggest-only' | 'dry-run-only' | 'apply-eligible';
export type PreferenceScopeEvidenceCode =
  | 'slot-detected'
  | 'explicit-preference-framing'
  | 'style-continuity'
  | 'negative-constraint'
  | 'correction-feedback'
  | 'task-local-cue'
  | 'uncertainty-cue'
  | 'unsafe-self-assessment'
  | 'explicit-apply-command';

export interface PreferenceSignalCandidate {
  dimension: string;
  value: string;
  polarity: PreferencePolarity;
  explicitness: PreferenceExplicitness;
  confidence: PreferenceConfidence;
  route: PreferenceApplyRoute;
  reason: string;
  source: PromptCaptureSource;
  intent: PreferenceIntent;
  scope: PreferenceScope;
  risk: PreferenceRisk;
  policy: PreferencePolicy;
  scopeEvidence: PreferenceScopeEvidenceCode[];
}

export interface PreferenceSignalCounts {
  autoApplySafe: number;
  candidateOnly: number;
  signalOnly: number;
  ignored: number;
}

export interface PromptSignalCandidate {
  signalType: Extract<ConversationSignalType, 'feedback.positive' | 'feedback.confused' | 'format.requested' | 'analogy.accepted' | 'analogy.rejected'>;
  note: string;
  format?: string;
  source: PromptCaptureSource;
  reason: string;
}

export interface PromptCaptureSafety {
  rawTranscriptIncluded: false;
  rawPromptPersisted: false;
  absolutePathsIncluded: false;
  profileMutated: false;
  preferencesMutated: false;
  weakTermsMutated: false;
  projectMemoryMutated: false;
  unsafeJudgmentIncluded: false;
}

export interface PromptCaptureResult {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  source: PromptCaptureSource;
  capturedSignals: ConversationMemoryEvent[];
  preferenceSignals: PreferenceSignalCandidate[];
  preferenceSignalCounts: PreferenceSignalCounts;
  skippedReasons: string[];
  safety: PromptCaptureSafety;
}

export interface HookSuggestRecommendedAction {
  command: string;
  reason: string;
  approvalRequired: boolean;
}

export interface HookSuggestMemoryContext {
  included: boolean;
  trigger: 'explicit-contextbook' | 'learning-question' | 'forced' | 'none';
  projectConcepts: string[];
  learnerPreferences: {
    preferredLanguage?: string;
    explanationOrder: string[];
    avoid: string[];
  };
  weakTerms: string[];
  profileUpdateCandidateCount: number;
  recommendedActions: string[];
}

export interface HookSuggestSafety {
  rawTranscriptIncluded: false;
  rawPromptIncluded: false;
  rawPromptPersisted: false;
  absolutePathsIncluded: false;
  profileMutated: false;
  preferencesMutated: false;
  weakTermsMutated: false;
  projectMemoryMutated: false;
  unsafeJudgmentIncluded: false;
  hookBlocksAgent: false;
}

export interface HookSuggestResult {
  schemaVersion: 1;
  generatedAt: string;
  learner: string;
  source: PromptCaptureSource;
  actionable: boolean;
  capturedSignalsCount: number;
  preferenceSignals: PreferenceSignalCandidate[];
  memoryContext: HookSuggestMemoryContext;
  recommendedActions: HookSuggestRecommendedAction[];
  additionalContext: string;
  skippedReasons: string[];
  safety: HookSuggestSafety;
}

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

export type MemoryContextActionSource =
  | 'project'
  | 'learner'
  | 'signals'
  | 'weakTermSuggestions'
  | 'profileUpdateCandidates'
  | 'freshness';

export interface MemoryContextRecommendedAction extends LearnerRecommendedAction {
  source: MemoryContextActionSource;
}

export type MemoryContextStaleHintCode =
  | 'project-not-initialized'
  | 'project-not-scanned'
  | 'working-tree-changed'
  | 'scan-has-warnings'
  | 'no-learner-signals';

export interface MemoryContextStaleHint {
  code: MemoryContextStaleHintCode;
  message: string;
  recommendedCommand: string;
}

export interface MemoryContextFreshness {
  projectScannedAt?: string;
  workingTreeChanged: boolean;
  changedFilesSinceScan: number;
  signalsGeneratedAt: string;
  contextGeneratedAt: string;
  staleHints: MemoryContextStaleHint[];
}

export interface MemoryContextSafety {
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  hiddenContentIncluded: false;
  profileMutated: false;
  preferencesMutated: false;
  weakTermsMutated: false;
  profileUpdatesMutated: false;
  projectMemoryMutated: false;
  persistedSummaryCreated: false;
  unsafeJudgmentIncluded: false;
}

export interface MemoryContextJson {
  schemaVersion: 1;
  generatedAt: string;
  rootName?: string;
  learner: string;
  project: ProjectSummaryJson;
  learnerMemory: LearnerSummaryJson;
  conversation: MemorySignalsJson;
  suggestions: {
    weakTerms: WeakTermSuggestionsJson;
    profileUpdates: ProfileUpdateCandidatesJson;
  };
  freshness: MemoryContextFreshness;
  recommendedActions: MemoryContextRecommendedAction[];
  safety: MemoryContextSafety;
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
  recordConversationSignal?: boolean;
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
