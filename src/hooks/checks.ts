import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { relative } from 'node:path';
import { promptCaptureHookScript, type PromptCaptureHookSource } from '../install/prompt-hook.js';
import type { ConfigFormat, ContextbookBinaryStatus, FileStatus, HelperSmokeStatus, HookConfigStatus } from './types.js';

export const HOOK_SCRIPT_NAME = 'contextbook-user-prompt-submit.js';

export function fileStatus(path: string): FileStatus {
  return { displayPath: displayPath(path), exists: existsSync(path) };
}

export function inspectConfig(path: string, format: ConfigFormat): HookConfigStatus {
  if (!existsSync(path)) return { displayPath: displayPath(path), exists: false, format, status: 'not-enabled', evidence: [] };

  try {
    const text = readFileSync(path, 'utf8');
    if (format === 'json') {
      const value: unknown = JSON.parse(text);
      const commands = extractHookCommands(value);
      const matches = matchingCommands(commands);
      return {
        displayPath: displayPath(path),
        exists: true,
        format,
        status: matches.length > 0 ? 'enabled' : 'not-enabled',
        evidence: matches
      };
    }

    const detected = text.includes('UserPromptSubmit') && (text.includes(HOOK_SCRIPT_NAME) || text.includes('contextbook memory capture-prompt'));
    return {
      displayPath: displayPath(path),
      exists: true,
      format,
      status: detected ? 'detected-text' : 'unknown',
      evidence: detected ? ['text contains UserPromptSubmit and Contextbook hook command'] : ['TOML exact hook parsing is not implemented']
    };
  } catch (error) {
    return {
      displayPath: displayPath(path),
      exists: true,
      format,
      status: 'parse-error',
      evidence: [error instanceof Error ? error.message : String(error)]
    };
  }
}

export function inspectContextbookBinary(): ContextbookBinaryStatus {
  const result = spawnSync('contextbook', ['--help'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], timeout: 5_000 });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') return 'missing';
  if (result.error) return 'unknown';
  return result.status === 0 ? 'available' : 'unknown';
}

export function isGeneratedHookHelper(helperPath: string | undefined, source: PromptCaptureHookSource): boolean {
  if (!helperPath || !existsSync(helperPath)) return false;
  const helperText = readFileSync(helperPath, 'utf8');
  return helperText === promptCaptureHookScript(source) || helperText === promptCaptureHookScript(source, { autoSafePreferences: true });
}

export function smokeHelper(helperPath: string | undefined, source: PromptCaptureHookSource): { helperSmoke: HelperSmokeStatus; message?: string } {
  if (!helperPath) return { helperSmoke: 'missing' };

  if (!isGeneratedHookHelper(helperPath, source)) {
    return { helperSmoke: 'skipped', message: 'helper content differs from the generated Contextbook script' };
  }

  const result = spawnSync(process.execPath, [helperPath], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '' }),
    encoding: 'utf8',
    timeout: 5_000
  });
  if (result.error) return { helperSmoke: 'failed', message: result.error.message };
  if (result.status !== 0) {
    const detail = result.stderr?.trim().split(/\r?\n/)[0] || `exit ${result.status ?? 'unknown'}`;
    return { helperSmoke: 'failed', message: detail };
  }
  return { helperSmoke: 'ok' };
}

export function displayPath(path: string): string {
  const home = homedir();
  if (path === home) return '~';
  if (path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;

  const cwd = process.cwd();
  const rel = relative(cwd, path);
  if (rel && !rel.startsWith('..')) return `./${rel}`;
  return path;
}

function extractHookCommands(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const hooksRoot = (value as { hooks?: unknown }).hooks;
  if (!hooksRoot || typeof hooksRoot !== 'object') return [];
  const userPromptSubmit = (hooksRoot as { UserPromptSubmit?: unknown }).UserPromptSubmit;
  if (!Array.isArray(userPromptSubmit)) return [];

  const commands: string[] = [];
  for (const matcherGroup of userPromptSubmit) {
    if (!matcherGroup || typeof matcherGroup !== 'object') continue;
    const hookEntries = (matcherGroup as { hooks?: unknown }).hooks;
    if (!Array.isArray(hookEntries)) continue;
    for (const hook of hookEntries) {
      if (!hook || typeof hook !== 'object') continue;
      const command = (hook as { command?: unknown }).command;
      if (typeof command === 'string') commands.push(command);
    }
  }
  return commands;
}

function matchingCommands(commands: string[]): string[] {
  return commands.filter((command) => command.includes(HOOK_SCRIPT_NAME) || command.includes('contextbook memory capture-prompt'));
}
