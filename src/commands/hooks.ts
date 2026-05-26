import { hooksStatus, formatHooksStatusMarkdown } from '../hooks/status.js';

export async function hooksCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  if (subcommand !== 'status') throw new Error(usage());

  const json = rest.includes('--json');
  const unknown = rest.filter((arg) => arg !== '--json');
  if (unknown.length > 0) throw new Error(usage());

  const status = hooksStatus();
  console.log(json ? JSON.stringify(status, null, 2) : formatHooksStatusMarkdown(status));
}

function usage(): string {
  return 'Usage: contextbook hooks status [--json]';
}
