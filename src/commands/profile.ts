import { profileMarkdown } from '../learner/profile.js';

export async function profileCommand(): Promise<void> {
  console.log(await profileMarkdown('default'));
}
