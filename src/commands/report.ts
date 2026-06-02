import { buildReport, parseReportArgs, reportUsage, saveReportArtifact } from '../core/report.js';

export async function reportCommand(args: string[] = []): Promise<void> {
  const parsed = parseReportArgs(args);
  const result = await buildReport({ args });
  if (parsed.save) {
    const saved = await saveReportArtifact(result, { json: parsed.json });
    if (parsed.json) {
      const { markdown: _markdown, ...json } = saved.report;
      console.log(JSON.stringify({ ...json, savedReport: saved.artifact }, null, 2));
      return;
    }
    console.log(`${saved.report.markdown}저장됨: ${saved.artifact.path}`);
    return;
  }
  if (parsed.json) {
    const { markdown: _markdown, ...json } = result;
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  console.log(result.markdown);
}

export { reportUsage };
