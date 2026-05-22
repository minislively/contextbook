import { answerWhy } from '../core/why.js';

export async function whyCommand(args: string[]): Promise<void> {
  const question = args.join(' ').trim();
  const result = await answerWhy(question);
  console.log(result.markdown);
}
