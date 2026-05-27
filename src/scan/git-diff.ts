import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitWorkingTreeState {
  changedFiles: Set<string>;
  changedFileCount: number;
  fingerprint: string;
  available: boolean;
}

export async function changedFiles(root = process.cwd()): Promise<Set<string>> {
  return (await gitWorkingTreeState(root)).changedFiles;
}

export async function gitWorkingTreeState(root = process.cwd()): Promise<GitWorkingTreeState> {
  try {
    const [diffNames, untrackedNames, diffNumstat] = await Promise.all([
      gitLines(root, ['diff', '--name-only', 'HEAD', '--']),
      gitLines(root, ['ls-files', '--others', '--exclude-standard']),
      gitLines(root, ['diff', '--numstat', 'HEAD', '--'])
    ]);
    const changedFilesSet = new Set([...diffNames, ...untrackedNames]);
    const fingerprintInput = [
      ...diffNumstat.map((line) => `diff\t${line}`),
      ...untrackedNames.map((line) => `untracked\t${line}`)
    ].sort().join('\n');
    return {
      changedFiles: changedFilesSet,
      changedFileCount: changedFilesSet.size,
      fingerprint: createHash('sha256').update(fingerprintInput).digest('hex'),
      available: true
    };
  } catch {
    return {
      changedFiles: new Set(),
      changedFileCount: 0,
      fingerprint: createHash('sha256').update('').digest('hex'),
      available: false
    };
  }
}

async function gitLines(root: string, args: string[]): Promise<string[]> {
  const { stdout } = await execFileAsync('git', args, { cwd: root, timeout: 3000 });
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
