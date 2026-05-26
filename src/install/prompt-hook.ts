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

    const result = spawnSync('contextbook', [
      'memory',
      'capture-prompt',
      '--prompt',
      prompt,
      '--source',
      '${source}',
      '--json'
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 25_000
    });

    if (result.error) {
      console.error(\`contextbook prompt capture skipped: \${result.error.message}\`);
      return;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      const detail = result.stderr?.trim().split(/\\r?\\n/)[0] ?? 'unknown error';
      console.error(\`contextbook prompt capture skipped: \${detail}\`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(\`contextbook prompt capture skipped: \${message}\`);
  }
});
process.stdin.resume();
`;
}

export function escapeJsonString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
