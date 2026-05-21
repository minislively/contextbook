import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readPackageJson(root = process.cwd()): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
