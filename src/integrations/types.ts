import type { InstallFile, InstallOptions, InstallResult } from '../install/types.js';

export type AdapterId = 'codex' | 'claude-code';

export interface ContextbookAdapter {
  id: AdapterId;
  displayName: string;
  install(options?: InstallOptions): Promise<InstallResult>;
  files(homeDir?: string): InstallFile[];
}
