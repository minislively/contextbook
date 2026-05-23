import { buildLearnerSummary, toLearnerSummaryJson } from '../core/learner.js';

export async function learnerCommand(args: string[] = []): Promise<void> {
  const json = parseLearnerArgs(args);
  const result = await buildLearnerSummary('default');
  if (json) {
    console.log(JSON.stringify(toLearnerSummaryJson(result), null, 2));
    return;
  }
  console.log(result.markdown);
}

function parseLearnerArgs(args: string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--json') return true;
  throw new Error('Usage: contextbook learner [--json]');
}
