import { addExplicitMemorySignal, formatMemorySignalsSummary, memorySignalsJson, memorySignalTypes } from '../learner/conversation-memory.js';
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
    case 'signals': {
      const json = parseSignals(rest);
      const result = await memorySignalsJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatMemorySignalsSummary(result));
      return;
    }
    case 'suggest-weak-terms': {
      const json = parseSignals(rest);
      const result = await weakTermSuggestionsJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatWeakTermSuggestionsSummary(result));
      return;
    }
    case 'suggest-profile-updates': {
      const json = parseSignals(rest);
      const result = await profileUpdateCandidatesJson('default');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(formatProfileUpdateCandidatesSummary(result));
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

function parseSignals(args: string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--json') return true;
  throw new Error('Usage: contextbook memory signals [--json]');
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
    '  contextbook memory signals [--json]',
    '  contextbook memory suggest-weak-terms [--json]',
    '  contextbook memory suggest-profile-updates [--json]',
    '',
    `Allowed types: ${memorySignalTypes.join(', ')}`
  ].join('\n');
}
