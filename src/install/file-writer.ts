import { copyFile, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ensureDir, exists } from '../storage/fs-utils.js';
import type { DeprecatedInstallFile, InstallAction, InstallFile, InstallOptions, InstallResult, InstallTarget } from './types.js';

export async function installFiles(target: InstallTarget, files: InstallFile[], options: InstallOptions = {}, deprecatedFiles: DeprecatedInstallFile[] = []): Promise<InstallResult> {
  const dryRun = options.dryRun === true;
  const stamp = backupStamp(options.now ?? new Date());
  const actions: InstallAction[] = [];

  for (const file of files) {
    actions.push(await planOrWrite(file, { dryRun, stamp }));
  }

  for (const file of deprecatedFiles) {
    const action = await planOrRemoveDeprecated(file, { dryRun });
    if (action) actions.push(action);
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

async function planOrRemoveDeprecated(file: DeprecatedInstallFile, options: { dryRun: boolean }): Promise<InstallAction | undefined> {
  const fileExists = await exists(file.path);
  if (!fileExists) return undefined;

  const current = await readFile(file.path, 'utf8');
  if (!file.removeIfContentMatches.includes(current)) {
    return { path: file.path, description: file.description, status: 'skip-deprecated-unmanaged' };
  }

  if (!options.dryRun) {
    await rm(file.path, { force: true });
    await removeEmptyDir(dirname(file.path));
  }

  return {
    path: file.path,
    description: file.description,
    status: options.dryRun ? 'dry-run-remove-deprecated' : 'remove-deprecated'
  };
}

async function removeEmptyDir(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch {
    // Directory is non-empty or unavailable; preserving it is safe.
  }
}

function backupStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
