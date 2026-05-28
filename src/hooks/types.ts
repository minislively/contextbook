import type { PromptCaptureHookSource } from '../install/prompt-hook.js';

export type PlatformId = 'codex' | 'claude-code';
export type HookSmokePlatform = PlatformId | 'all';
export type ConfigFormat = 'json' | 'toml';
export type ConfigStatus = 'enabled' | 'not-enabled' | 'unknown' | 'parse-error' | 'detected-text';
export type HelperSmokeStatus = 'ok' | 'missing' | 'failed' | 'skipped';
export type ContextbookBinaryStatus = 'available' | 'missing' | 'unknown';
export type HookHealthStatus = 'missing' | 'installed-not-configured' | 'configured-needs-trust' | 'live-smoke-ok' | 'stale-helper' | 'broken';
export type HookIssueCode =
  | 'HOOK_HELPER_MISSING'
  | 'HOOK_CONFIG_NOT_ENABLED'
  | 'HOOK_HELPER_STALE'
  | 'HOOK_SMOKE_FAILED'
  | 'HOOK_OUTPUT_SHAPE_INVALID'
  | 'HOOK_RAW_PROMPT_LEAK'
  | 'HOOK_TRUST_REVIEW_NEEDED'
  | 'CONTEXTBOOK_BINARY_MISSING';

export type HookIssue = {
  code: HookIssueCode;
  severity: 'info' | 'warning' | 'error';
  message: string;
};

export type HookNextAction = {
  code: HookIssueCode | 'HOOK_SMOKE_VERIFY';
  command: string;
  reason: string;
};

export type HookHealth = {
  status: HookHealthStatus;
  issues: HookIssue[];
  nextActions: HookNextAction[];
};

export type HooksStatusJson = {
  schemaVersion: 1;
  generatedAt: string;
  safety: {
    readOnly: true;
    configMutated: false;
    learnerMemoryMutated: false;
    rawPromptPersisted: false;
  };
  overallHealth: HookHealth;
  platforms: HookPlatformStatus[];
};

export type HookPlatformStatus = {
  id: PlatformId;
  helper: FileStatus;
  guide: FileStatus;
  configs: HookConfigStatus[];
  runtime: {
    nodeAvailable: boolean;
    contextbookBinary: ContextbookBinaryStatus;
    helperSmoke: HelperSmokeStatus;
    message?: string;
  };
  helperCurrent: boolean;
  health: HookHealth;
  recommendedActions: HookNextAction[];
};

export type FileStatus = {
  displayPath: string;
  exists: boolean;
};

export type HookConfigStatus = {
  displayPath: string;
  exists: boolean;
  format: ConfigFormat;
  status: ConfigStatus;
  evidence: string[];
};

export type HookStatusContext = {
  home: string;
  cwd: string;
  contextbookBinary: ContextbookBinaryStatus;
};

export type HookStatusProvider = {
  id: PlatformId;
  status(context: HookStatusContext): HookPlatformStatus;
};

export type HookPlatformDefinition = {
  id: PlatformId;
  helperPath: string;
  guidePath: string;
  configs: Array<{ path: string; format: ConfigFormat }>;
  hookSource: PromptCaptureHookSource;
  recommendedActions(input: { helperExists: boolean; configs: HookConfigStatus[] }): Array<{ command: string; reason: string }>;
};

export type HookSmokePlatformResult = {
  id: PlatformId;
  helper: FileStatus;
  ran: boolean;
  exitCode?: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  outputKind: 'none' | 'plain-context' | 'json-additional-context' | 'other';
  additionalContextDetected: boolean;
  autoSafePreferenceSectionDetected: boolean;
  wouldApplyPreferences: boolean;
  rawPromptDetected: boolean;
  expectedOutputShape: 'plain-context' | 'json-additional-context';
  outputShapeValid: boolean;
  helperCurrent: boolean;
  status: HookHealthStatus;
  health: HookHealth;
  safePreferencePreview: {
    sectionDetected: boolean;
    wouldApply: boolean;
  };
  message?: string;
};

export type HooksSmokeJson = {
  schemaVersion: 1;
  generatedAt: string;
  promptLength: number;
  platform: HookSmokePlatform;
  safety: {
    readOnly: true;
    configMutated: false;
    rawPromptPersisted: false;
    learnerMemoryMutated: false;
    profileMutated: false;
    preferencesMutated: false;
    projectMemoryMutated: false;
  };
  status: HookHealthStatus;
  expectedOutputShape: 'platform-specific-additional-context';
  outputShapeValid: boolean;
  helperCurrent: boolean;
  safePreferencePreview: {
    sectionDetected: boolean;
    wouldApply: boolean;
  };
  platforms: HookSmokePlatformResult[];
};
