export type InstallTarget = 'codex' | 'claude-code';
export type InstallActionStatus = 'create' | 'update-with-backup' | 'skip-identical' | 'dry-run-create' | 'dry-run-update-with-backup';

export interface InstallOptions {
  dryRun?: boolean;
  homeDir?: string;
  now?: Date;
}

export interface InstallFile {
  path: string;
  content: string;
  description: string;
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
