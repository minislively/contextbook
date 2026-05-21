import { readFile } from 'node:fs/promises';
import { ensureLearnerStore, learnerPaths, readPreferences, readWeakTerms } from '../storage/user-store.js';

export async function profileMarkdown(learner = 'default'): Promise<string> {
  await ensureLearnerStore(learner);
  const paths = learnerPaths(learner);
  const [profile, preferences, weakTerms] = await Promise.all([
    readFile(paths.profile, 'utf8'),
    readPreferences(learner),
    readWeakTerms(learner)
  ]);
  const weakSummary = Object.entries(weakTerms)
    .sort((a, b) => b[1].askedCount - a[1].askedCount)
    .slice(0, 10)
    .map(([term, record]) => `- ${term}: ${record.state}, asked ${record.askedCount}`)
    .join('\n') || '- 아직 기록된 weak term 없음';
  return `${profile}\n## Preferences JSON\n\n\`\`\`json\n${JSON.stringify(preferences, null, 2)}\n\`\`\`\n\n## Weak Terms\n\n${weakSummary}\n`;
}
