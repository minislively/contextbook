import { buildMemoryContext, formatMemoryContextSummary } from '../core/memory-context.js';
import { addExplicitMemorySignal, formatMemorySignalsSummary, memorySignalsJson, memorySignalTypes } from '../learner/conversation-memory.js';
import { applyProfileUpdateCandidate, formatApplyProfileUpdateSummary } from '../learner/profile-update-apply.js';
import { capturePromptSignals, formatPromptCaptureSummary, isPromptCaptureSource } from '../learner/prompt-capture.js';
import { formatProfileUpdateCandidatesSummary, profileUpdateCandidatesJson } from '../learner/profile-update-candidates.js';
import { formatWeakTermSuggestionsSummary, weakTermSuggestionsJson } from '../learner/weak-term-suggestions.js';

export async function memoryCommand(args: string[] = []): Promise<void> {
  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case 'add-signal': {
      const input = parseAddSignal(rest);
      const event = await addExplicitMemorySignal(input);
      console.log(`Recorded memory signal: ${event.signalType}${event.conceptLabel ? ` — ${event.conceptLabel}` : ''}`);
      return;
    }
    case 'capture-prompt': {
      const input = parseCapturePrompt(rest);
      const result = await capturePromptSignals({ prompt: input.prompt, source: input.source, learner: 'default' });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatPromptCaptureSummary(result));
      return;
    }
    case 'signals': {
      const json = parseJsonFlag(rest, 'contextbook memory signals [--json]');
      const result = await memorySignalsJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemorySignalsSummary(result));
      return;
    }
    case 'suggest-weak-terms': {
      const json = parseJsonFlag(rest, 'contextbook memory suggest-weak-terms [--json]');
      const result = await weakTermSuggestionsJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatWeakTermSuggestionsSummary(result));
      return;
    }
    case 'suggest-profile-updates': {
      const json = parseJsonFlag(rest, 'contextbook memory suggest-profile-updates [--json]');
      const result = await profileUpdateCandidatesJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatProfileUpdateCandidatesSummary(result));
      return;
    }
    case 'apply-profile-update': {
      const input = parseApplyProfileUpdate(rest);
      const result = await applyProfileUpdateCandidate({ learner: 'default', candidateRef: input.candidate, dryRun: input.dryRun });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatApplyProfileUpdateSummary(result));
      return;
    }
    case 'context': {
      const json = parseJsonFlag(rest, 'contextbook memory context [--json]');
      const result = await buildMemoryContext({ learner: 'default' });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemoryContextSummary(result));
      return;
    }
    default:
      throw new Error(memoryUsage());
  }
}

function parseAddSignal(args: string[]): { signalType: typeof memorySignalTypes[number]; conceptLabel?: string; note?: string; format?: string; learner?: string } {
  const values = parseFlags(args);
  const signalType = values.type;
  if (!signalType || !isMemorySignalType(signalType)) throw new Error(memoryUsage());
  return {
    signalType,
    conceptLabel: values.concept,
    note: values.note,
    format: values.format,
    learner: values.learner ?? 'default'
  };
}

function parseCapturePrompt(args: string[]): { prompt: string; source: 'manual' | 'codex' | 'claude-code'; json: boolean } {
  let prompt: string | undefined;
  let source: 'manual' | 'codex' | 'claude-code' = 'manual';
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--prompt') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]');
      prompt = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--prompt=')) {
      prompt = arg.slice('--prompt='.length);
      if (!prompt) throw new Error('Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]');
      continue;
    }
    if (arg === '--source') {
      const value = args[index + 1];
      if (!value || !isPromptCaptureSource(value)) throw new Error('Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]');
      source = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length);
      if (!isPromptCaptureSource(value)) throw new Error('Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]');
      source = value;
      continue;
    }
    throw new Error('Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]');
  }
  if (!prompt) throw new Error('Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]');
  return { prompt, source, json };
}

function parseJsonFlag(args: string[], usage: string): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--json') return true;
  throw new Error(`Usage: ${usage}`);
}

function parseApplyProfileUpdate(args: string[]): { candidate: string; dryRun: boolean; json: boolean } {
  let candidate: string | undefined;
  let dryRun = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--candidate') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Usage: contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]');
      candidate = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--candidate=')) {
      candidate = arg.slice('--candidate='.length);
      if (!candidate) throw new Error('Usage: contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]');
      continue;
    }
    throw new Error('Usage: contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]');
  }
  if (!candidate) throw new Error('Usage: contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]');
  return { candidate, dryRun, json };
}

function parseFlags(args: string[]): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error(memoryUsage());
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey === 'type' || rawKey === 'concept' || rawKey === 'note' || rawKey === 'format' || rawKey === 'learner' ? rawKey : undefined;
    if (!key) throw new Error(memoryUsage());
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(memoryUsage());
    values[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return values;
}

function isMemorySignalType(value: string): value is typeof memorySignalTypes[number] {
  return (memorySignalTypes as readonly string[]).includes(value);
}

function memoryUsage(): string {
  return [
    'Usage:',
    '  contextbook memory add-signal --type <type> [--concept <concept>] [--note <note>] [--format <format>]',
    '  contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]',
    '  contextbook memory signals [--json]',
    '  contextbook memory suggest-weak-terms [--json]',
    '  contextbook memory suggest-profile-updates [--json]',
    '  contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]',
    '  contextbook memory context [--json]',
    '',
    `Allowed types: ${memorySignalTypes.join(', ')}`
  ].join('\n');
}
