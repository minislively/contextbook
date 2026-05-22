import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { ProjectFileIndex, ProjectFileIndexEntry, ProjectScanWarning } from '../types.js';

const ignoredDirs = new Set(['node_modules', 'dist', 'coverage']);
const maxSkippedIndexEntries = 1_000;
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

function shouldSkipHiddenFile(name: string): boolean {
  return name.startsWith('.');
}

function skipDirReason(name: string): 'hidden-dir' | 'ignored-dir' {
  return name.startsWith('.') ? 'hidden-dir' : 'ignored-dir';
}

function fileEntry(path: string, status: 'scanned' | 'skipped', sizeBytes?: number, reason?: ProjectFileIndexEntry['reason']): ProjectFileIndexEntry {
  return {
    path,
    kind: 'file',
    status,
    ...(sizeBytes === undefined ? {} : { sizeBytes }),
    ...(reason === undefined ? {} : { reason })
  };
}

function directoryEntry(path: string, reason: ProjectFileIndexEntry['reason']): ProjectFileIndexEntry {
  return {
    path: path.endsWith('/') ? path : `${path}/`,
    kind: 'directory',
    status: 'skipped',
    reason
  };
}

export async function scanProjectFiles(
  root = process.cwd(),
  maxFiles = 500,
  generatedAt = new Date().toISOString()
): Promise<{ files: { file: string; content: string }[]; fileIndex: ProjectFileIndex; warnings: ProjectScanWarning[] }> {
  const files: { file: string; content: string }[] = [];
  const scannedIndexEntries: ProjectFileIndexEntry[] = [];
  const skippedIndexEntries: ProjectFileIndexEntry[] = [];
  const warnings: ProjectScanWarning[] = [];
  let bytesScanned = 0;
  let skippedTotal = 0;
  let maxFilesWarningRecorded = false;
  let hiddenFilesSkipped = 0;
  let skippedIndexTruncated = false;

  function addIndexEntry(entry: ProjectFileIndexEntry): void {
    if (entry.status === 'scanned') {
      scannedIndexEntries.push(entry);
      return;
    }
    skippedTotal += 1;
    if (skippedIndexEntries.length >= maxSkippedIndexEntries) {
      skippedIndexTruncated = true;
      return;
    }
    skippedIndexEntries.push(entry);
  }

  function recordMaxFilesWarning(file?: string): void {
    if (maxFilesWarningRecorded) return;
    maxFilesWarningRecorded = true;
    warnings.push({
      code: 'max-files-reached',
      message: `Stopped scanning after reaching the max file limit (${maxFiles}).`,
      ...(file ? { file } : {})
    });
  }

  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      const rel = relative(root, dir).replaceAll('\\', '/');
      warnings.push({
        code: 'unreadable-file',
        message: 'Could not read directory during project scan.',
        ...(rel ? { file: rel } : {})
      });
      return;
    }
    entries.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).replaceAll('\\', '/');
      if (files.length >= maxFiles) {
        addIndexEntry(entry.isDirectory() ? directoryEntry(rel, 'max-files-reached') : fileEntry(rel, 'skipped', undefined, 'max-files-reached'));
        recordMaxFilesWarning(rel);
        return;
      }
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) {
          addIndexEntry(directoryEntry(rel, skipDirReason(entry.name)));
        } else {
          await walk(full);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldSkipHiddenFile(entry.name)) {
        hiddenFilesSkipped += 1;
        continue;
      }
      try {
        const info = await stat(full);
        if (!shouldRead(rel)) {
          addIndexEntry(fileEntry(rel, 'skipped', info.size, 'unsupported-extension'));
          continue;
        }
        if (info.size > 300_000) {
          addIndexEntry(fileEntry(rel, 'skipped', info.size, 'large-file'));
          continue;
        }
        const content = await readFile(full, 'utf8');
        files.push({ file: rel, content });
        bytesScanned += Buffer.byteLength(content, 'utf8');
        addIndexEntry(fileEntry(rel, 'scanned', info.size));
      } catch {
        addIndexEntry(fileEntry(rel, 'skipped', undefined, 'unreadable-file'));
        warnings.push({
          code: 'unreadable-file',
          message: 'Could not read file during project scan.',
          file: rel
        });
      }
    }
  }

  await walk(root);
  if (hiddenFilesSkipped > 0) {
    warnings.push({
      code: 'scan-partial',
      message: `Skipped ${hiddenFilesSkipped} hidden file(s) without recording file names.`
    });
  }
  if (skippedIndexTruncated) {
    warnings.push({
      code: 'scan-partial',
      message: `Skipped file index entries were truncated at ${maxSkippedIndexEntries} entries.`
    });
  }
  const indexEntries = [...scannedIndexEntries, ...skippedIndexEntries].sort((a, b) => a.path.localeCompare(b.path));

  const fileIndex: ProjectFileIndex = {
    schemaVersion: 1,
    generatedAt,
    rootName: basename(root),
    totals: {
      scanned: files.length,
      skipped: skippedTotal,
      bytesScanned
    },
    files: indexEntries
  };

  return { files, fileIndex, warnings };
}

export async function readProjectFiles(root = process.cwd(), maxFiles = 500): Promise<{ file: string; content: string }[]> {
  const result = await scanProjectFiles(root, maxFiles);
  return result.files;
}
