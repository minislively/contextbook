import { join } from 'node:path';
import { HOOK_SCRIPT_NAME } from '../hooks/checks.js';
import { platformStatus } from '../hooks/platform.js';
import type { HookConfigStatus, HookStatusContext, HookStatusProvider } from '../hooks/types.js';

export const claudeCodeHookStatusProvider: HookStatusProvider = {
  id: 'claude-code',
  status(context: HookStatusContext) {
    return platformStatus({
      id: 'claude-code',
      helperPath: join(context.home, '.claude', 'hooks', HOOK_SCRIPT_NAME),
      guidePath: join(context.home, '.claude', 'hooks', 'contextbook-user-prompt-submit.md'),
      configs: [
        { path: join(context.home, '.claude', 'settings.json'), format: 'json' },
        { path: join(context.cwd, '.claude', 'settings.json'), format: 'json' },
        { path: join(context.cwd, '.claude', 'settings.local.json'), format: 'json' }
      ],
      hookSource: 'claude-code',
      recommendedActions: claudeCodeRecommendedActions
    }, context.contextbookBinary);
  }
};

function claudeCodeRecommendedActions(input: { helperExists: boolean; configs: HookConfigStatus[] }): Array<{ command: string; reason: string }> {
  if (!input.helperExists) return [{ command: 'contextbook setup', reason: 'install platform hook helper files first' }];
  if (!hasDetectedConfig(input.configs)) {
    return [{
      command: 'merge ~/.claude/hooks/contextbook-user-prompt-submit.md into ~/.claude/settings.json',
      reason: 'helper is installed but no active UserPromptSubmit config was detected'
    }];
  }
  return [];
}

function hasDetectedConfig(configs: HookConfigStatus[]): boolean {
  return configs.some((config) => config.status === 'enabled' || config.status === 'detected-text');
}
