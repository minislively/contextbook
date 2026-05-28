import { fileStatus, inspectConfig, smokeHelper } from './checks.js';
import { buildStatusHealth } from './health.js';
import type { ContextbookBinaryStatus, HookPlatformDefinition, HookNextAction, HookPlatformStatus } from './types.js';

export function platformStatus(definition: HookPlatformDefinition, contextbookBinary: ContextbookBinaryStatus): HookPlatformStatus {
  const helper = fileStatus(definition.helperPath);
  const guide = fileStatus(definition.guidePath);
  const configs = definition.configs.map((config) => inspectConfig(config.path, config.format));
  const smoke = smokeHelper(helper.exists ? definition.helperPath : undefined, definition.hookSource);

  const helperCurrent = helper.exists && smoke.helperSmoke !== 'skipped';
  const health = buildStatusHealth({
    id: definition.id,
    helperExists: helper.exists,
    helperCurrent,
    configs,
    helperSmoke: smoke.helperSmoke,
    contextbookBinary,
    message: smoke.message
  });
  const legacyActions: HookNextAction[] = definition.recommendedActions({ helperExists: helper.exists, configs }).map((action) => ({
    code: helper.exists ? 'HOOK_CONFIG_NOT_ENABLED' : 'HOOK_HELPER_MISSING',
    ...action
  }));

  return {
    id: definition.id,
    helper,
    guide,
    configs,
    runtime: {
      nodeAvailable: true,
      contextbookBinary,
      helperSmoke: smoke.helperSmoke,
      ...(smoke.message ? { message: smoke.message } : {})
    },
    helperCurrent,
    health,
    recommendedActions: mergeActions(health.nextActions, legacyActions)
  };
}

function mergeActions(primary: HookNextAction[], fallback: HookNextAction[]): HookNextAction[] {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((action) => {
    const key = `${action.code}:${action.command}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
