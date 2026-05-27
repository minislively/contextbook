export type PromptCaptureHookSource = 'codex' | 'claude-code';

export function promptCaptureHookScript(source: PromptCaptureHookSource): string {
  return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

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
    const additionalContext = typeof parsed.additionalContext === 'string' ? parsed.additionalContext.trim() : '';
    if (!parsed.actionable || !additionalContext) return;
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
`;
}

export function escapeJsonString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
