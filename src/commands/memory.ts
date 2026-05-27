import { executeMemoryBackup, formatMemoryBackupSummary, planMemoryBackup } from '../core/memory-backup.js';
import { buildMemoryContext, formatMemoryContextSummary } from '../core/memory-context.js';
import { formatMemoryRebuildSummary, planMemoryRebuild } from '../core/memory-rebuild.js';
import { formatMemoryRestoreSummary, planMemoryRestore } from '../core/memory-restore.js';
import { formatMemoryRepairSummary, planMemoryRepair } from '../core/memory-repair.js';
import { formatMemoryValidateSummary, validateMemory } from '../core/memory-validate.js';
import { addExplicitMemorySignal, formatMemorySignalsSummary, memorySignalsJson, memorySignalTypes } from '../learner/conversation-memory.js';
import { applyPreferenceSignals, formatApplyPreferenceSignalsSummary } from '../learner/preference-signals-apply.js';
import { applyProfileUpdateCandidate, formatApplyProfileUpdateSummary } from '../learner/profile-update-apply.js';
import { capturePromptSignals, formatHookSuggestSummary, formatPromptCaptureSummary, hookSuggest, isPromptCaptureSource } from '../learner/prompt-capture.js';
import { formatProfileUpdateCandidatesSummary, profileUpdateCandidatesJson } from '../learner/profile-update-candidates.js';
import { formatPreferenceHistorySummary, formatUndoPreferenceUpdateSummary, preferenceHistoryJson, undoPreferenceUpdate } from '../learner/preference-history.js';
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
    case 'hook-suggest': {
      const input = parseHookSuggest(rest);
      const result = await hookSuggest({ prompt: input.prompt, source: input.source, learner: 'default', includeMemoryContext: input.includeMemoryContext, captureSignals: input.captureSignals });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const summary = formatHookSuggestSummary(result);
      if (summary) console.log(summary);
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
    case 'apply-preference-signals': {
      const input = parseApplyPreferenceSignals(rest);
      const result = await applyPreferenceSignals({ learner: 'default', prompt: input.prompt, source: input.source, dryRun: input.dryRun });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatApplyPreferenceSignalsSummary(result));
      return;
    }
    case 'preference-history': {
      const json = parseJsonFlag(rest, 'contextbook memory preference-history [--json]');
      const result = await preferenceHistoryJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatPreferenceHistorySummary(result));
      return;
    }
    case 'undo-preference-update': {
      const input = parseUndoPreferenceUpdate(rest);
      const result = await undoPreferenceUpdate({ learner: 'default', entryRef: input.entry, dryRun: input.dryRun, yes: input.yes });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatUndoPreferenceUpdateSummary(result));
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
    case 'validate': {
      const json = parseJsonFlag(rest, 'contextbook memory validate [--json]');
      const result = await validateMemory({ learner: 'default' });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemoryValidateSummary(result));
      return;
    }
    case 'repair': {
      const input = parseRepairDryRun(rest);
      const result = await planMemoryRepair({ learner: 'default' });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemoryRepairSummary(result));
      return;
    }
    case 'rebuild': {
      const input = parseRebuildDryRun(rest);
      const result = await planMemoryRebuild({ learner: 'default' });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemoryRebuildSummary(result));
      return;
    }
    case 'backup': {
      const input = parseBackup(rest);
      const result = input.yes ? await executeMemoryBackup({ learner: 'default' }) : await planMemoryBackup({ learner: 'default' });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemoryBackupSummary(result));
      return;
    }
    case 'restore': {
      const input = parseRestoreDryRun(rest);
      const result = await planMemoryRestore({ backupId: input.backupId, learner: 'default' });
      if (input.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemoryRestoreSummary(result));
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

function parseCapturePrompt(args: string[], usage = 'Usage: contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]'): { prompt: string; source: 'manual' | 'codex' | 'claude-code'; json: boolean } {
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
      if (!value || value.startsWith('--')) throw new Error(usage);
      prompt = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--prompt=')) {
      prompt = arg.slice('--prompt='.length);
      if (!prompt) throw new Error(usage);
      continue;
    }
    if (arg === '--source') {
      const value = args[index + 1];
      if (!value || !isPromptCaptureSource(value)) throw new Error(usage);
      source = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length);
      if (!isPromptCaptureSource(value)) throw new Error(usage);
      source = value;
      continue;
    }
    throw new Error(usage);
  }
  if (!prompt) throw new Error(usage);
  return { prompt, source, json };
}

function parseHookSuggest(args: string[]): { prompt: string; source: 'manual' | 'codex' | 'claude-code'; json: boolean; includeMemoryContext: boolean; captureSignals: boolean } {
  const filtered: string[] = [];
  let includeMemoryContext = false;
  let captureSignals = true;
  for (const arg of args) {
    if (arg === '--include-memory-context') {
      includeMemoryContext = true;
      continue;
    }
    if (arg === '--no-capture') {
      captureSignals = false;
      continue;
    }
    filtered.push(arg);
  }
  return {
    ...parseCapturePrompt(filtered, 'Usage: contextbook memory hook-suggest --prompt <text> [--source manual|codex|claude-code] [--include-memory-context] [--json]'),
    includeMemoryContext,
    captureSignals
  };
}

function parseApplyPreferenceSignals(args: string[]): { prompt: string; source: 'manual' | 'codex' | 'claude-code'; dryRun: boolean; json: boolean } {
  let prompt: string | undefined;
  let source: 'manual' | 'codex' | 'claude-code' = 'manual';
  let dryRun = false;
  let json = false;
  const usage = 'Usage: contextbook memory apply-preference-signals --prompt <text> [--source manual|codex|claude-code] [--dry-run] [--json]';
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
    if (arg === '--prompt') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(usage);
      prompt = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--prompt=')) {
      prompt = arg.slice('--prompt='.length);
      if (!prompt) throw new Error(usage);
      continue;
    }
    if (arg === '--source') {
      const value = args[index + 1];
      if (!value || !isPromptCaptureSource(value)) throw new Error(usage);
      source = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length);
      if (!isPromptCaptureSource(value)) throw new Error(usage);
      source = value;
      continue;
    }
    throw new Error(usage);
  }
  if (!prompt) throw new Error(usage);
  return { prompt, source, dryRun, json };
}

function parseJsonFlag(args: string[], usage: string): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--json') return true;
  throw new Error(`Usage: ${usage}`);
}

function parseRestoreDryRun(args: string[]): { backupId: string; json: boolean } {
  let backupId: string | undefined;
  let dryRun = false;
  let json = false;
  const usage = 'Usage: contextbook memory restore --backup-id <id> --dry-run [--json]';
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
    if (arg === '--backup-id') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(usage);
      backupId = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--backup-id=')) {
      backupId = arg.slice('--backup-id='.length);
      if (!backupId) throw new Error(usage);
      continue;
    }
    throw new Error(usage);
  }
  if (!backupId || !dryRun || !isSafeBackupId(backupId)) throw new Error(usage);
  return { backupId, json };
}

function isSafeBackupId(backupId: string): boolean {
  return /^backup-[0-9]{8}T[0-9]{9}Z$/.test(backupId);
}

function parseBackup(args: string[]): { json: boolean; yes: boolean } {
  let dryRun = false;
  let yes = false;
  let json = false;
  const usage = 'Usage: contextbook memory backup (--dry-run|--yes) [--json]';
  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--yes') {
      yes = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    throw new Error(usage);
  }
  if (dryRun === yes) throw new Error(usage);
  return { json, yes };
}

function parseRebuildDryRun(args: string[]): { json: boolean } {
  return parseRequiredDryRun(args, 'Usage: contextbook memory rebuild --dry-run [--json]');
}

function parseRepairDryRun(args: string[]): { json: boolean } {
  return parseRequiredDryRun(args, 'Usage: contextbook memory repair --dry-run [--json]');
}

function parseRequiredDryRun(args: string[], usage: string): { json: boolean } {
  let dryRun = false;
  let json = false;
  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    throw new Error(usage);
  }
  if (!dryRun) throw new Error(usage);
  return { json };
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


function parseUndoPreferenceUpdate(args: string[]): { entry: string; dryRun: boolean; yes: boolean; json: boolean } {
  let entry: string | undefined;
  let dryRun = false;
  let yes = false;
  let json = false;
  const usage = 'Usage: contextbook memory undo-preference-update --entry <id|index> (--dry-run|--yes) [--json]';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--yes') {
      yes = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--entry') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(usage);
      entry = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--entry=')) {
      entry = arg.slice('--entry='.length);
      if (!entry) throw new Error(usage);
      continue;
    }
    throw new Error(usage);
  }
  if (!entry || dryRun === yes) throw new Error(usage);
  return { entry, dryRun, yes, json };
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
    '  contextbook memory hook-suggest --prompt <text> [--source manual|codex|claude-code] [--include-memory-context] [--json]',
    '  contextbook memory signals [--json]',
    '  contextbook memory suggest-weak-terms [--json]',
    '  contextbook memory suggest-profile-updates [--json]',
    '  contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]',
    '  contextbook memory apply-preference-signals --prompt <text> [--source manual|codex|claude-code] [--dry-run] [--json]',
    '  contextbook memory preference-history [--json]',
    '  contextbook memory undo-preference-update --entry <id|index> (--dry-run|--yes) [--json]',
    '  contextbook memory context [--json]',
    '  contextbook memory validate [--json]',
    '  contextbook memory repair --dry-run [--json]',
    '  contextbook memory rebuild --dry-run [--json]',
    '  contextbook memory backup (--dry-run|--yes) [--json]',
    '  contextbook memory restore --backup-id <id> --dry-run [--json]',
    '',
    `Allowed types: ${memorySignalTypes.join(', ')}`
  ].join('\n');
}
