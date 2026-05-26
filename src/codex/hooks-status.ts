import { join } from 'node:path';
import { HOOK_SCRIPT_NAME } from '../hooks/checks.js';
import { platformStatus } from '../hooks/platform.js';
import type { HookConfigStatus, HookStatusContext, HookStatusProvider } from '../hooks/types.js';

export const codexHookStatusProvider: HookStatusProvider = {
  id: 'codex',
  status(context: HookStatusContext) {
    return platformStatus({
      id: 'codex',
      helperPath: join(context.home, '.codex', 'hooks', HOOK_SCRIPT_NAME),
      guidePath: join(context.home, '.codex', 'hooks', 'contextbook-user-prompt-submit.md'),
      configs: [
        { path: join(context.home, '.codex', 'hooks.json'), format: 'json' },
        { path: join(context.home, '.codex', 'config.toml'), format: 'toml' },
        { path: join(context.cwd, '.codex', 'hooks.json'), format: 'json' },
        { path: join(context.cwd, '.codex', 'config.toml'), format: 'toml' }
      ],
      hookSource: 'codex',
      recommendedActions: codexRecommendedActions
    }, context.contextbookBinary);
  }
};

function codexRecommendedActions(input: { helperExists: boolean; configs: HookConfigStatus[] }): Array<{ command: string; reason: string }> {
  if (!input.helperExists) return [{ command: 'contextbook setup --hooks', reason: 'install platform hook helper files first' }];
  if (!hasDetectedConfig(input.configs)) {
    return [{
      command: 'merge ~/.codex/hooks/contextbook-user-prompt-submit.md into ~/.codex/hooks.json',
      reason: 'helper is installed but no active UserPromptSubmit config was detected'
    }];
  }
  return [{ command: '/hooks', reason: 'review and trust the configured Codex command hook if Codex prompts for approval' }];
}

function hasDetectedConfig(configs: HookConfigStatus[]): boolean {
  return configs.some((config) => config.status === 'enabled' || config.status === 'detected-text');
}
