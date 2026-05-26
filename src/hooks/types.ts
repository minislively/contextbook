import type { PromptCaptureHookSource } from '../install/prompt-hook.js';

export type PlatformId = 'codex' | 'claude-code';
export type ConfigFormat = 'json' | 'toml';
export type ConfigStatus = 'enabled' | 'not-enabled' | 'unknown' | 'parse-error' | 'detected-text';
export type HelperSmokeStatus = 'ok' | 'missing' | 'failed' | 'skipped';
export type ContextbookBinaryStatus = 'available' | 'missing' | 'unknown';

export type HooksStatusJson = {
  schemaVersion: 1;
  generatedAt: string;
  safety: {
    readOnly: true;
    configMutated: false;
    learnerMemoryMutated: false;
    rawPromptPersisted: false;
  };
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
  recommendedActions: Array<{ command: string; reason: string }>;
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
