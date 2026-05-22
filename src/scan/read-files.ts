import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ignoredDirs = new Set(['node_modules', 'dist', 'coverage']);
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx']);
const allowedNames = new Set(['README', 'README.md', 'package.json']);
const entryPriority: Record<string, number> = {
  'package.json': 0,
  README: 1,
  'README.md': 1,
  src: 2,
  app: 3,
  lib: 4,
  packages: 5,
  docs: 6,
  test: 7,
  tests: 7,
  benchmarks: 20
};

function ext(path: string): string {
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index) : '';
}

function priority(name: string): number {
  return entryPriority[name] ?? 10;
}

function shouldRead(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  return allowedNames.has(name) || allowedExtensions.has(ext(path));
}

function shouldSkipDir(name: string): boolean {
  return ignoredDirs.has(name) || name.startsWith('.');
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
    entries.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const full = join(dir, entry.name);
      const rel = relative(root, full).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) await walk(full);
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
