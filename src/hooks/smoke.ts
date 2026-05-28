import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { displayPath, HOOK_SCRIPT_NAME, isGeneratedHookHelper } from './checks.js';
import { aggregateHookHealth, buildSmokeHealth } from './health.js';
import type { HookSmokePlatform, HookSmokePlatformResult, HooksSmokeJson, PlatformId } from './types.js';

const MAX_PREVIEW = 1200;

export interface HooksSmokeOptions {
  prompt: string;
  platform?: HookSmokePlatform;
}

export function hooksSmoke(options: HooksSmokeOptions, now = new Date()): HooksSmokeJson {
  const platform = options.platform ?? 'all';
  const platforms = selectedPlatforms(platform).map((id) => smokePlatform(id, options.prompt));
  const health = aggregateHookHealth(platforms.map((item) => item.health));
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    promptLength: options.prompt.length,
    platform,
    safety: {
      readOnly: true,
      configMutated: false,
      rawPromptPersisted: false,
      learnerMemoryMutated: false,
      profileMutated: false,
      preferencesMutated: false,
      projectMemoryMutated: false
    },
    status: health.status,
    expectedOutputShape: 'platform-specific-additional-context',
    outputShapeValid: platforms.every((item) => item.outputShapeValid),
    helperCurrent: platforms.every((item) => item.helperCurrent),
    safePreferencePreview: {
      sectionDetected: platforms.some((item) => item.safePreferencePreview.sectionDetected),
      wouldApply: platforms.some((item) => item.safePreferencePreview.wouldApply)
    },
    platforms
  };
}

export function formatHooksSmokeMarkdown(result: HooksSmokeJson): string {
  const lines = [
    '# Contextbook Hooks Smoke',
    '',
    `- platform: ${result.platform}`,
    `- status: ${result.status}`,
    `- output shape valid: ${result.outputShapeValid}`,
    `- helper current: ${result.helperCurrent}`,
    `- prompt length: ${result.promptLength}`,
    '- safety: read-only, no learner/config/profile/preferences/project mutation',
    ''
  ];

  for (const platform of result.platforms) {
    lines.push(`## ${platform.id === 'codex' ? 'Codex' : 'Claude Code'}`);
    lines.push(`- status: ${platform.status}`);
    lines.push(`- helper script: ${platform.helper.exists ? 'found' : 'missing'} (${platform.helper.displayPath})`);
    lines.push(`- ran: ${platform.ran}`);
    if (platform.ran) lines.push(`- exit code: ${platform.exitCode ?? 'unknown'}`);
    lines.push(`- output kind: ${platform.outputKind}`);
    lines.push(`- expected output shape: ${platform.expectedOutputShape}`);
    lines.push(`- output shape valid: ${platform.outputShapeValid}`);
    lines.push(`- helper current: ${platform.helperCurrent}`);
    lines.push(`- additional context detected: ${platform.additionalContextDetected}`);
    lines.push(`- auto-safe preference section detected: ${platform.autoSafePreferenceSectionDetected}`);
    lines.push(`- would apply preferences: ${platform.wouldApplyPreferences}`);
    if (platform.health.issues.length > 0) {
      lines.push('- issues:');
      for (const issue of platform.health.issues) lines.push(`  - ${issue.code} (${issue.severity}) — ${issue.message}`);
    }
    if (platform.health.nextActions.length > 0) {
      lines.push('- next action:');
      for (const action of platform.health.nextActions) lines.push(`  - ${action.code}: \`${action.command}\` — ${action.reason}`);
    }
    lines.push(`- raw prompt detected in output: ${platform.rawPromptDetected}`);
    if (platform.message) lines.push(`- message: ${platform.message}`);
    if (platform.stdoutPreview) {
      lines.push('', '### stdout preview', '```txt', platform.stdoutPreview, '```');
    }
    if (platform.stderrPreview) {
      lines.push('', '### stderr preview', '```txt', platform.stderrPreview, '```');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function smokePlatform(id: PlatformId, prompt: string): HookSmokePlatformResult {
  const helperPath = helperPathFor(id);
  const helper = { displayPath: displayPath(helperPath), exists: existsSync(helperPath) };
  const expectedOutputShape = expectedShapeFor(id);
  const helperCurrent = isGeneratedHookHelper(helper.exists ? helperPath : undefined, id);
  if (!helper.exists) {
    const health = buildSmokeHealth({ id, helperExists: false, helperCurrent: false, ran: false, outputShapeValid: false, rawPromptDetected: false });
    return {
      id,
      helper,
      ran: false,
      stdoutPreview: '',
      stderrPreview: '',
      outputKind: 'none',
      additionalContextDetected: false,
      autoSafePreferenceSectionDetected: false,
      wouldApplyPreferences: false,
      rawPromptDetected: false,
      expectedOutputShape,
      outputShapeValid: false,
      helperCurrent,
      status: health.status,
      health,
      safePreferencePreview: { sectionDetected: false, wouldApply: false },
      message: 'helper script is missing; run contextbook setup first'
    };
  }

  if (!helperCurrent) {
    const health = buildSmokeHealth({ id, helperExists: true, helperCurrent: false, ran: false, outputShapeValid: false, rawPromptDetected: false });
    return {
      id,
      helper,
      ran: false,
      stdoutPreview: '',
      stderrPreview: '',
      outputKind: 'none',
      additionalContextDetected: false,
      autoSafePreferenceSectionDetected: false,
      wouldApplyPreferences: false,
      rawPromptDetected: false,
      expectedOutputShape,
      outputShapeValid: false,
      helperCurrent,
      status: health.status,
      health,
      safePreferencePreview: { sectionDetected: false, wouldApply: false },
      message: 'helper content differs from the generated Contextbook script; not executing stale helper'
    };
  }

  const result = spawnSync(process.execPath, [helperPath], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }),
    encoding: 'utf8',
    timeout: 25_000,
    env: { ...process.env, CONTEXTBOOK_HOOK_SMOKE: '1' }
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const outputKind = classifyOutput(stdout);
  const additionalContext = extractAdditionalContext(stdout);
  const outputShapeValid = outputKind === expectedOutputShape;
  const rawPromptDetected = prompt.trim().length > 0 && (`${stdout}\n${stderr}`).includes(prompt);
  const autoSafePreferenceSectionDetected = additionalContext.includes('## Auto-safe Preference Update');
  const wouldApplyPreferences = /- would apply: true/.test(additionalContext);
  const health = buildSmokeHealth({
    id,
    helperExists: helper.exists,
    helperCurrent,
    ran: true,
    exitCode: typeof result.status === 'number' ? result.status : null,
    outputShapeValid,
    rawPromptDetected,
    message: result.error?.message
  });
  return {
    id,
    helper,
    ran: true,
    exitCode: typeof result.status === 'number' ? result.status : null,
    stdoutPreview: truncate(stdout.trim()),
    stderrPreview: truncate(stderr.trim()),
    outputKind,
    additionalContextDetected: outputKind === 'plain-context' || outputKind === 'json-additional-context',
    autoSafePreferenceSectionDetected,
    wouldApplyPreferences,
    rawPromptDetected,
    expectedOutputShape,
    outputShapeValid,
    helperCurrent,
    status: health.status,
    health,
    safePreferencePreview: { sectionDetected: autoSafePreferenceSectionDetected, wouldApply: wouldApplyPreferences },
    ...(result.error ? { message: result.error.message } : {})
  };
}

function extractAdditionalContext(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed);
    const context = parsed?.hookSpecificOutput?.additionalContext;
    return typeof context === 'string' ? context : '';
  } catch {
    return trimmed;
  }
}

function classifyOutput(stdout: string): HookSmokePlatformResult['outputKind'] {
  const trimmed = stdout.trim();
  if (!trimmed) return 'none';
  try {
    const parsed = JSON.parse(trimmed);
    const context = parsed?.hookSpecificOutput?.additionalContext;
    if (typeof context === 'string' && context.trim()) return 'json-additional-context';
    return 'other';
  } catch {
    return trimmed.includes('# Contextbook Hook Suggestion') ? 'plain-context' : 'other';
  }
}

function selectedPlatforms(platform: HookSmokePlatform): PlatformId[] {
  if (platform === 'all') return ['codex', 'claude-code'];
  return [platform];
}

function expectedShapeFor(id: PlatformId): 'plain-context' | 'json-additional-context' {
  return id === 'codex' ? 'plain-context' : 'json-additional-context';
}

function helperPathFor(id: PlatformId): string {
  const home = homedir();
  if (id === 'codex') return join(home, '.codex', 'hooks', HOOK_SCRIPT_NAME);
  return join(home, '.claude', 'hooks', HOOK_SCRIPT_NAME);
}

function truncate(value: string): string {
  if (value.length <= MAX_PREVIEW) return value;
  return `${value.slice(0, MAX_PREVIEW)}…`;
}
