import { hooksStatus, formatHooksStatusMarkdown } from '../hooks/status.js';
import { formatHooksSmokeMarkdown, hooksSmoke } from '../hooks/smoke.js';
import type { HookSmokePlatform } from '../hooks/types.js';

export async function hooksCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand === 'status') {
    const json = rest.includes('--json');
    const unknown = rest.filter((arg) => arg !== '--json');
    if (unknown.length > 0) throw new Error(usage());

    const status = hooksStatus();
    console.log(json ? JSON.stringify(status, null, 2) : formatHooksStatusMarkdown(status));
    return;
  }

  if (subcommand === 'smoke') {
    const input = parseSmoke(rest);
    const result = hooksSmoke(input);
    console.log(input.json ? JSON.stringify(result, null, 2) : formatHooksSmokeMarkdown(result));
    return;
  }

  throw new Error(usage());
}

function usage(): string {
  return [
    'Usage:',
    '  contextbook hooks status [--json]',
    '  contextbook hooks smoke --prompt <text> [--platform codex|claude-code|all] [--json]'
  ].join('\n');
}

function parseSmoke(args: string[]): { prompt: string; platform: HookSmokePlatform; json: boolean } {
  let prompt: string | undefined;
  let platform: HookSmokePlatform = 'all';
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--prompt') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(usage());
      prompt = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--prompt=')) {
      prompt = arg.slice('--prompt='.length);
      if (!prompt) throw new Error(usage());
      continue;
    }
    if (arg === '--platform') {
      const value = args[index + 1];
      if (!value || !isSmokePlatform(value)) throw new Error(usage());
      platform = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--platform=')) {
      const value = arg.slice('--platform='.length);
      if (!isSmokePlatform(value)) throw new Error(usage());
      platform = value;
      continue;
    }
    throw new Error(usage());
  }
  if (!prompt) throw new Error(usage());
  return { prompt, platform, json };
}

function isSmokePlatform(value: string): value is HookSmokePlatform {
  return value === 'codex' || value === 'claude-code' || value === 'all';
}
