import { ensureProjectStore } from '../storage/project-store.js';
import { ensureLearnerStore } from '../storage/user-store.js';

export async function initCommand(): Promise<void> {
  await ensureProjectStore();
  await ensureLearnerStore('default');
  console.log('Contextbook initialized.');
  console.log('- Project memory: .contextbook/');
  console.log('- Learner memory: ~/.contextbook/learners/default/');
}
