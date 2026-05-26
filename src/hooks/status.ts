import { homedir } from 'node:os';
import { inspectContextbookBinary } from './checks.js';
import { hookStatusProviders } from './registry.js';
import type { HookConfigStatus, HooksStatusJson } from './types.js';
export type { HookPlatformStatus, HooksStatusJson } from './types.js';

export function hooksStatus(now = new Date()): HooksStatusJson {
  const context = {
    home: homedir(),
    cwd: process.cwd(),
    contextbookBinary: inspectContextbookBinary()
  };

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    safety: {
      readOnly: true,
      configMutated: false,
      learnerMemoryMutated: false,
      rawPromptPersisted: false
    },
    platforms: hookStatusProviders.map((provider) => provider.status(context))
  };
}

export function formatHooksStatusMarkdown(status: HooksStatusJson): string {
  const lines = ['# Contextbook Hooks Status', '', `generatedAt: ${status.generatedAt}`, ''];

  for (const platform of status.platforms) {
    lines.push(`## ${platform.id === 'codex' ? 'Codex' : 'Claude Code'}`);
    lines.push(`- helper script: ${platform.helper.exists ? 'found' : 'missing'} (${platform.helper.displayPath})`);
    lines.push(`- guide: ${platform.guide.exists ? 'found' : 'missing'} (${platform.guide.displayPath})`);
    lines.push(`- config: ${overallConfigStatus(platform.configs)}`);
    lines.push(`- checked: ${platform.configs.map((config) => config.displayPath).join(', ')}`);
    lines.push(`- node: ${platform.runtime.nodeAvailable ? 'ok' : 'missing'}`);
    lines.push(`- contextbook binary: ${platform.runtime.contextbookBinary}`);
    lines.push(`- helper smoke: ${platform.runtime.helperSmoke}${platform.runtime.message ? ` (${platform.runtime.message})` : ''}`);
    if (platform.recommendedActions.length > 0) {
      lines.push('- next action:');
      for (const action of platform.recommendedActions) lines.push(`  - \`${action.command}\` — ${action.reason}`);
    }
    lines.push('');
  }

  lines.push('## Safety');
  lines.push(`- readOnly: ${status.safety.readOnly}`);
  lines.push(`- configMutated: ${status.safety.configMutated}`);
  lines.push(`- learnerMemoryMutated: ${status.safety.learnerMemoryMutated}`);
  lines.push(`- rawPromptPersisted: ${status.safety.rawPromptPersisted}`);

  return lines.join('\n');
}

function overallConfigStatus(configs: HookConfigStatus[]): string {
  if (configs.some((config) => config.status === 'enabled')) return 'enabled';
  if (configs.some((config) => config.status === 'detected-text')) return 'detected-text';
  if (configs.some((config) => config.status === 'parse-error')) return 'parse-error';
  return 'not-enabled';
}
