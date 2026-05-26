import { fileStatus, inspectConfig, smokeHelper } from './checks.js';
import type { ContextbookBinaryStatus, HookPlatformDefinition, HookPlatformStatus } from './types.js';

export function platformStatus(definition: HookPlatformDefinition, contextbookBinary: ContextbookBinaryStatus): HookPlatformStatus {
  const helper = fileStatus(definition.helperPath);
  const guide = fileStatus(definition.guidePath);
  const configs = definition.configs.map((config) => inspectConfig(config.path, config.format));
  const smoke = smokeHelper(helper.exists ? definition.helperPath : undefined, definition.hookSource);

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
    recommendedActions: definition.recommendedActions({ helperExists: helper.exists, configs })
  };
}
