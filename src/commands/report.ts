import { buildReport, parseReportArgs, reportUsage } from '../core/report.js';

export async function reportCommand(args: string[] = []): Promise<void> {
  const parsed = parseReportArgs(args);
  const result = await buildReport({ args });
  if (parsed.json) {
    const { markdown: _markdown, ...json } = result;
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  console.log(result.markdown);
}

export { reportUsage };
