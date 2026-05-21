import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.contextbook', '.omx', 'coverage', '.next']);
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx']);
const allowedNames = new Set(['README', 'README.md', 'package.json']);

function ext(path: string): string {
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index) : '';
}

function shouldRead(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  return allowedNames.has(name) || allowedExtensions.has(ext(path));
}

export async function readProjectFiles(root = process.cwd(), maxFiles = 500): Promise<{ file: string; content: string }[]> {
  const results: { file: string; content: string }[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const full = join(dir, entry.name);
      const rel = relative(root, full).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) await walk(full);
        continue;
      }
      if (!entry.isFile() || !shouldRead(rel)) continue;
      try {
        const info = await stat(full);
        if (info.size > 300_000) continue;
        results.push({ file: rel, content: await readFile(full, 'utf8') });
      } catch {
        // Ignore unreadable files in MVP scanner.
      }
    }
  }

  await walk(root);
  return results;
}
