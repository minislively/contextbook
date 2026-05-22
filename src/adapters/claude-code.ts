import { claudeCodeFiles, installClaudeCode } from '../install/claude-code.js';
import type { ContextbookAdapter } from './types.js';

export const claudeCodeAdapter: ContextbookAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  install: installClaudeCode,
  files: claudeCodeFiles
};
