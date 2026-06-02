import { answerWhy, answerWhyTarget } from '../core/why.js';
import { buildReport, parseReportArgs, reportActionTargetCount, selectReportActionTarget } from '../core/report.js';

export async function whyCommand(args: string[]): Promise<void> {
  if (args[0] === '--from-report') {
    await whyFromReportCommand(args.slice(1));
    return;
  }
  const question = args.join(' ').trim();
  const result = await answerWhy(question);
  console.log(result.markdown);
}

async function whyFromReportCommand(args: string[]): Promise<void> {
  const [rawIndex, ...periodArgs] = args;
  const targetIndex = parsePositiveIndex(rawIndex);
  const forbidden = periodArgs.find((arg) => arg === '--json' || arg === '--save');
  if (forbidden) {
    throw new Error(whyFromReportUsage());
  }
  parseReportArgs(periodArgs);
  const report = await buildReport({ args: periodArgs });
  const target = selectReportActionTarget(report, targetIndex);
  if (!target) {
    const count = reportActionTargetCount(report);
    if (count === 0) {
      throw new Error('No report candidates are available yet. Run contextbook report to inspect the current period, or run contextbook learn after scanning project memory.');
    }
    throw new Error(`Report candidate ${targetIndex} is out of range. Available candidates: 1-${count}.`);
  }
  const result = await answerWhyTarget({ label: target.label, id: target.id });
  console.log(result.markdown);
}

function parsePositiveIndex(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new Error(whyFromReportUsage());
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(whyFromReportUsage());
  return parsed;
}

function whyFromReportUsage(): string {
  return 'Usage: contextbook why --from-report <index> [--day|--week|--since <date> --until <date>]';
}
