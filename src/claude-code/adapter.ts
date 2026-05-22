import { claudeCodeFiles, installClaudeCode } from './install.js';
import type { ContextbookAdapter } from '../integrations/types.js';

export const claudeCodeAdapter: ContextbookAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  install: installClaudeCode,
  files: claudeCodeFiles
};
