import { claudeCodeHookStatusProvider } from '../claude-code/hooks-status.js';
import { codexHookStatusProvider } from '../codex/hooks-status.js';
import type { HookStatusProvider } from './types.js';

export const hookStatusProviders: HookStatusProvider[] = [codexHookStatusProvider, claudeCodeHookStatusProvider];
