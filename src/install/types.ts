export type InstallTarget = 'codex' | 'claude-code';
export type InstallActionStatus = 'create' | 'update-with-backup' | 'skip-identical' | 'skip-unmanaged-existing' | 'dry-run-create' | 'dry-run-update-with-backup';

export type CodexSkillPathMode = 'auto' | 'agents' | 'codex' | 'both';

export interface InstallOptions {
  dryRun?: boolean;
  homeDir?: string;
  now?: Date;
  codexSkillPathMode?: CodexSkillPathMode;
  includeHooks?: boolean;
  autoSafePreferences?: boolean;
  nonInteractive?: boolean;
}

export interface InstallFile {
  path: string;
  content: string;
  description: string;
  /**
   * If set, an existing non-identical file is updated only when it contains
   * one of these exact ownership sentinels. Otherwise the installer skips it
   * to avoid replacing unrelated user-owned aliases.
   */
  managedMarkers?: string[];
}

export interface InstallAction {
  path: string;
  description: string;
  status: InstallActionStatus;
  backupPath?: string;
}

export interface InstallResult {
  target: InstallTarget;
  dryRun: boolean;
  files: InstallFile[];
  actions: InstallAction[];
}
