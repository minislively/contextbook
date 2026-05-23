import { buildProjectSummary } from '../core/project.js';

export async function projectCommand(): Promise<void> {
  const result = await buildProjectSummary();
  console.log(result.markdown);
}
