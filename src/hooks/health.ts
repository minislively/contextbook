import type { ContextbookBinaryStatus, HelperSmokeStatus, HookConfigStatus, HookHealth, HookHealthStatus, HookIssue, HookNextAction, PlatformId } from './types.js';

export function buildStatusHealth(input: {
  id: PlatformId;
  helperExists: boolean;
  helperCurrent: boolean;
  configs: HookConfigStatus[];
  helperSmoke: HelperSmokeStatus;
  contextbookBinary: ContextbookBinaryStatus;
  message?: string;
}): HookHealth {
  const issues: HookIssue[] = [];
  const nextActions: HookNextAction[] = [];
  const enabled = input.configs.some((config) => config.status === 'enabled' || config.status === 'detected-text');
  const configTarget = input.id === 'codex' ? '~/.codex/hooks.json' : '~/.claude/settings.json';

  if (!input.helperExists) {
    issues.push({ code: 'HOOK_HELPER_MISSING', severity: 'error', message: 'Contextbook hook helper is not installed for this platform.' });
    nextActions.push({ code: 'HOOK_HELPER_MISSING', command: 'contextbook setup', reason: 'Install the Contextbook helper and guide files.' });
  }

  if (input.helperExists && !input.helperCurrent) {
    issues.push({ code: 'HOOK_HELPER_STALE', severity: 'error', message: 'Installed helper differs from the current generated Contextbook helper.' });
    nextActions.push({ code: 'HOOK_HELPER_STALE', command: input.id === 'codex' ? 'contextbook install codex --hooks' : 'contextbook install claude-code --hooks', reason: 'Regenerate the platform hook helper with a backup.' });
  }

  if (input.helperSmoke === 'failed') {
    issues.push({ code: 'HOOK_SMOKE_FAILED', severity: 'error', message: input.message ?? 'The installed helper failed its local smoke test.' });
    nextActions.push({ code: 'HOOK_SMOKE_FAILED', command: 'contextbook hooks smoke --prompt "cleanup 왜 해야 돼?" --json', reason: 'Inspect local helper output and stderr.' });
  }

  if (input.helperExists && input.helperCurrent && !enabled) {
    issues.push({ code: 'HOOK_CONFIG_NOT_ENABLED', severity: 'warning', message: `No enabled Contextbook UserPromptSubmit hook was detected in ${configTarget}.` });
    nextActions.push({ code: 'HOOK_CONFIG_NOT_ENABLED', command: `open ${configTarget}`, reason: 'Merge the generated guide snippet into your agent hook config, then review/trust it if your agent requires trust approval.' });
  }

  if (enabled && input.helperCurrent && input.helperSmoke === 'ok') {
    issues.push({ code: 'HOOK_TRUST_REVIEW_NEEDED', severity: 'info', message: 'Config is detected and helper smoke passes; run a smoke prompt or your agent trust/review flow before dogfooding.' });
    nextActions.push({ code: 'HOOK_SMOKE_VERIFY', command: 'contextbook hooks smoke --prompt "cleanup 왜 해야 돼?" --json', reason: 'Verify the helper output shape without mutating memory.' });
  }

  if (input.contextbookBinary === 'missing') {
    issues.push({ code: 'CONTEXTBOOK_BINARY_MISSING', severity: 'warning', message: 'The global contextbook binary was not found on PATH for external agent runtimes.' });
    nextActions.push({ code: 'CONTEXTBOOK_BINARY_MISSING', command: 'npm install -g contextbook', reason: 'Make the contextbook command available to Codex/Claude hook subprocesses after publish.' });
  }

  return { status: deriveStatus(input, enabled), issues, nextActions: dedupeActions(nextActions) };
}

export function buildSmokeHealth(input: {
  id: PlatformId;
  helperExists: boolean;
  helperCurrent: boolean;
  ran: boolean;
  exitCode?: number | null;
  outputShapeValid: boolean;
  rawPromptDetected: boolean;
  message?: string;
}): HookHealth {
  const issues: HookIssue[] = [];
  const nextActions: HookNextAction[] = [];
  if (!input.helperExists) {
    issues.push({ code: 'HOOK_HELPER_MISSING', severity: 'error', message: 'Contextbook hook helper is not installed for this platform.' });
    nextActions.push({ code: 'HOOK_HELPER_MISSING', command: 'contextbook setup', reason: 'Install hook helpers before running smoke verification.' });
  }
  if (input.helperExists && !input.helperCurrent) {
    issues.push({ code: 'HOOK_HELPER_STALE', severity: 'error', message: 'Helper content differs from the current generated Contextbook helper.' });
    nextActions.push({ code: 'HOOK_HELPER_STALE', command: input.id === 'codex' ? 'contextbook install codex --hooks' : 'contextbook install claude-code --hooks', reason: 'Regenerate the stale helper before dogfooding.' });
  }
  if (input.ran && input.exitCode !== 0) {
    issues.push({ code: 'HOOK_SMOKE_FAILED', severity: 'error', message: input.message ?? `Helper exited with ${input.exitCode ?? 'unknown status'}.` });
    nextActions.push({ code: 'HOOK_SMOKE_FAILED', command: 'contextbook hooks smoke --prompt "cleanup 왜 해야 돼?" --json', reason: 'Inspect the smoke result previews.' });
  }
  if (input.ran && !input.outputShapeValid) {
    issues.push({ code: 'HOOK_OUTPUT_SHAPE_INVALID', severity: 'error', message: 'Helper output did not match the expected additional-context shape.' });
    nextActions.push({ code: 'HOOK_OUTPUT_SHAPE_INVALID', command: input.id === 'codex' ? 'contextbook install codex --hooks' : 'contextbook install claude-code --hooks', reason: 'Regenerate the helper script and retry smoke verification.' });
  }
  if (input.rawPromptDetected) {
    issues.push({ code: 'HOOK_RAW_PROMPT_LEAK', severity: 'error', message: 'Smoke output included the raw prompt text.' });
    nextActions.push({ code: 'HOOK_RAW_PROMPT_LEAK', command: input.id === 'codex' ? 'contextbook install codex --hooks' : 'contextbook install claude-code --hooks', reason: 'Regenerate the helper and inspect custom modifications before using live hooks.' });
  }
  return { status: smokeStatus(input), issues, nextActions: dedupeActions(nextActions) };
}

export function aggregateHookHealth(healths: HookHealth[]): HookHealth {
  const status = aggregateStatus(healths.map((health) => health.status));
  return {
    status,
    issues: healths.flatMap((health) => health.issues),
    nextActions: dedupeActions(healths.flatMap((health) => health.nextActions))
  };
}

function deriveStatus(input: { helperExists: boolean; helperCurrent: boolean; helperSmoke: HelperSmokeStatus }, enabled: boolean): HookHealthStatus {
  if (!input.helperExists) return 'missing';
  if (!input.helperCurrent || input.helperSmoke === 'skipped') return 'stale-helper';
  if (input.helperSmoke === 'failed') return 'broken';
  if (!enabled) return 'installed-not-configured';
  return 'configured-needs-trust';
}

function smokeStatus(input: { helperExists: boolean; helperCurrent: boolean; ran: boolean; exitCode?: number | null; outputShapeValid: boolean; rawPromptDetected: boolean }): HookHealthStatus {
  if (!input.helperExists) return 'missing';
  if (!input.helperCurrent) return 'stale-helper';
  if (!input.ran || input.exitCode !== 0 || !input.outputShapeValid || input.rawPromptDetected) return 'broken';
  return 'live-smoke-ok';
}

function aggregateStatus(statuses: HookHealthStatus[]): HookHealthStatus {
  if (statuses.includes('broken')) return 'broken';
  if (statuses.includes('stale-helper')) return 'stale-helper';
  if (statuses.every((status) => status === 'missing')) return 'missing';
  if (statuses.includes('installed-not-configured')) return 'installed-not-configured';
  if (statuses.includes('configured-needs-trust')) return 'configured-needs-trust';
  if (statuses.every((status) => status === 'live-smoke-ok')) return 'live-smoke-ok';
  return statuses[0] ?? 'missing';
}

function dedupeActions(actions: HookNextAction[]): HookNextAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.code}:${action.command}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
