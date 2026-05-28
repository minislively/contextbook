export type PromptCaptureHookSource = 'codex' | 'claude-code';

export interface PromptCaptureHookOptions {
  autoSafePreferences?: boolean;
}

export function promptCaptureHookScript(source: PromptCaptureHookSource, options: PromptCaptureHookOptions = {}): string {
  const autoSafePreferences = options.autoSafePreferences === true;
  return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const AUTO_SAFE_PREFERENCES = ${autoSafePreferences ? 'true' : 'false'};

let inputText = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputText += chunk;
});
process.stdin.on('end', () => {
  try {
    const payload = inputText.trim() ? JSON.parse(inputText) : {};
    const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    if (!prompt.trim()) return;

    const args = [
      'memory',
      'hook-suggest',
      '--prompt',
      prompt,
      '--source',
      '${source}',
      '--mode',
      AUTO_SAFE_PREFERENCES ? 'auto-safe' : 'suggest',
      '--json'
    ];
    if (process.env.CONTEXTBOOK_HOOK_SMOKE === '1') args.push('--no-capture');

    const result = spawnSync('contextbook', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 25_000
    });

    if (result.error) {
      console.error(\`contextbook hook suggestion skipped: \${result.error.message}\`);
      return;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      const detail = result.stderr?.trim().split(/\\r?\\n/)[0] ?? 'unknown error';
      console.error(\`contextbook hook suggestion skipped: \${detail}\`);
      return;
    }
    const stdout = result.stdout?.trim();
    if (!stdout) return;
    const parsed = JSON.parse(stdout);
    let additionalContext = typeof parsed.additionalContext === 'string' ? parsed.additionalContext.trim() : '';
    if (!parsed.actionable || !additionalContext) return;
    additionalContext = appendAutoSafePreferenceSection(additionalContext, prompt, parsed);
    if ('${source}' === 'claude-code') {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext
        }
      }));
      return;
    }
    console.log(additionalContext);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(\`contextbook hook suggestion skipped: \${message}\`);
  }
});
process.stdin.resume();

function appendAutoSafePreferenceSection(additionalContext, prompt, parsed) {
  if (!AUTO_SAFE_PREFERENCES) return additionalContext;
  const autoApplyDecisions = Array.isArray(parsed.preferencePolicyDecisions)
    ? parsed.preferencePolicyDecisions.filter((decision) => decision && decision.decision === 'auto_apply')
    : [];
  if (autoApplyDecisions.length === 0) return additionalContext;

  if (process.env.CONTEXTBOOK_HOOK_SMOKE === '1') {
    return additionalContext + autoSafeSection({ dryRun: true, wouldApply: true, applied: false, changes: autoApplyDecisions.length });
  }

  const applyResult = spawnSync('contextbook', [
    'memory',
    'apply-preference-signals',
    '--prompt',
    prompt,
    '--source',
    '${source}',
    '--mode',
    'auto-safe',
    '--json'
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 25_000
  });

  if (applyResult.error) {
    console.error(\`contextbook auto-safe preference apply skipped: \${applyResult.error.message}\`);
    return additionalContext;
  }
  if (typeof applyResult.status === 'number' && applyResult.status !== 0) {
    const detail = applyResult.stderr?.trim().split(/\\r?\\n/)[0] ?? 'unknown error';
    console.error(\`contextbook auto-safe preference apply skipped: \${detail}\`);
    return additionalContext;
  }

  try {
    const applied = JSON.parse(applyResult.stdout || '{}');
    const writeChanges = Array.isArray(applied.changes)
      ? applied.changes.filter((change) => change && change.operation !== 'skip-identical').length
      : 0;
    return additionalContext + autoSafeSection({
      dryRun: false,
      wouldApply: autoApplyDecisions.length > 0,
      applied: applied.applied === true,
      changes: writeChanges,
      undo: applied.applied === true ? 'contextbook memory preference-history' : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(\`contextbook auto-safe preference apply summary skipped: \${message}\`);
    return additionalContext;
  }
}

function autoSafeSection(input) {
  const lines = [
    '',
    '',
    '## Auto-safe Preference Update',
    '- mode: enabled by contextbook setup',
    \`- would apply: \${input.wouldApply === true}\`,
    \`- dry run: \${input.dryRun === true}\`,
    \`- applied: \${input.applied === true}\`,
    \`- changes: \${typeof input.changes === 'number' ? input.changes : 0}\`,
    '- safety: low-risk preference policy only; no raw prompt persisted; no profile/weak-term promotion'
  ];
  if (input.undo) lines.push(\`- undo: \${input.undo}\`);
  return lines.join('\\n');
}
`;
}

export function escapeJsonString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
