import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ensureDir, exists } from '../storage/fs-utils.js';
import type { InstallAction, InstallFile, InstallOptions, InstallResult, InstallTarget } from './types.js';

export async function installFiles(target: InstallTarget, files: InstallFile[], options: InstallOptions = {}): Promise<InstallResult> {
  const dryRun = options.dryRun === true;
  const stamp = backupStamp(options.now ?? new Date());
  const actions: InstallAction[] = [];

  for (const file of files) {
    actions.push(await planOrWrite(file, { dryRun, stamp }));
  }

  return { target, dryRun, files, actions };
}

async function planOrWrite(file: InstallFile, options: { dryRun: boolean; stamp: string }): Promise<InstallAction> {
  const fileExists = await exists(file.path);
  if (!fileExists) {
    if (!options.dryRun) {
      await ensureDir(dirname(file.path));
      await writeFile(file.path, file.content, 'utf8');
    }
    return {
      path: file.path,
      description: file.description,
      status: options.dryRun ? 'dry-run-create' : 'create'
    };
  }

  const current = await readFile(file.path, 'utf8');
  if (current === file.content) {
    return { path: file.path, description: file.description, status: 'skip-identical' };
  }

  if (file.managedMarkers && !file.managedMarkers.some((marker) => current.includes(marker))) {
    return { path: file.path, description: file.description, status: 'skip-unmanaged-existing' };
  }

  const backupPath = `${file.path}.bak-${options.stamp}`;
  if (!options.dryRun) {
    await copyFile(file.path, backupPath);
    await writeFile(file.path, file.content, 'utf8');
  }

  return {
    path: file.path,
    description: file.description,
    status: options.dryRun ? 'dry-run-update-with-backup' : 'update-with-backup',
    backupPath
  };
}

function backupStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
