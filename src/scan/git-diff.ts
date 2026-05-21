import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function changedFiles(root = process.cwd()): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, timeout: 3000 });
    return new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}
