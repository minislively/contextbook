import { buildProjectSummary, toProjectSummaryJson } from '../core/project.js';

export async function projectCommand(args: string[] = []): Promise<void> {
  const json = parseProjectArgs(args);
  const result = await buildProjectSummary();
  if (json) {
    console.log(JSON.stringify(toProjectSummaryJson(result), null, 2));
    return;
  }
  console.log(result.markdown);
}

function parseProjectArgs(args: string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--json') return true;
  throw new Error('Usage: contextbook project [--json]');
}
