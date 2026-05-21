import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { defaultPreferences, defaultProfile, ensureLearnerStore, learnerPaths, recordProfileUpdate, recordSignal } from '../storage/user-store.js';
import { profileMarkdown } from '../learner/profile.js';

export async function profileCommand(args: string[] = []): Promise<void> {
  const [subcommand] = args;
  switch (subcommand) {
    case undefined:
      console.log(await profileMarkdown('default'));
      await recordSignal({ type: 'profile.view' }, 'default');
      return;
    case 'diff':
      await diffProfile();
      return;
    case 'edit':
      await editProfile();
      return;
    case 'reset':
      await resetProfile();
      return;
    default:
      throw new Error('Usage: contextbook profile [diff|edit|reset]');
  }
}

async function diffProfile(): Promise<void> {
  await ensureLearnerStore('default');
  const paths = learnerPaths('default');
  const currentProfile = await readFile(paths.profile, 'utf8');
  const currentPreferences = await readFile(paths.preferences, 'utf8');
  const defaultPreferencesText = `${JSON.stringify(defaultPreferences, null, 2)}\n`;
  console.log('# Learner Profile Diff\n');
  console.log(sectionDiff('profile.md', defaultProfile, currentProfile));
  console.log(sectionDiff('preferences.json', defaultPreferencesText, currentPreferences));
  await recordSignal({ type: 'profile.diff' }, 'default');
}

async function editProfile(): Promise<void> {
  await ensureLearnerStore('default');
  const paths = learnerPaths('default');
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (!editor) {
    console.log(`Set EDITOR to edit automatically. Profile path:\n${paths.profile}\nPreferences path:\n${paths.preferences}`);
    await recordSignal({ type: 'profile.edit.path-shown' }, 'default');
    return;
  }
  const result = spawnSync(editor, [paths.profile], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Editor exited with status ${result.status ?? 'unknown'}`);
  await recordProfileUpdate({ type: 'profile.edit', file: paths.profile }, 'default');
  await recordSignal({ type: 'profile.edit' }, 'default');
}

async function resetProfile(): Promise<void> {
  await ensureLearnerStore('default');
  const paths = learnerPaths('default');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(paths.profile, `${paths.profile}.bak-${stamp}`);
  await copyFile(paths.preferences, `${paths.preferences}.bak-${stamp}`);
  await writeFile(paths.profile, defaultProfile, 'utf8');
  await writeFile(paths.preferences, `${JSON.stringify(defaultPreferences, null, 2)}\n`, 'utf8');
  await recordProfileUpdate({ type: 'profile.reset', backups: [`${paths.profile}.bak-${stamp}`, `${paths.preferences}.bak-${stamp}`] }, 'default');
  await recordSignal({ type: 'profile.reset' }, 'default');
  console.log('Learner profile reset to defaults. Backups were created next to the original files.');
}

function sectionDiff(name: string, expected: string, actual: string): string {
  if (expected === actual) return `## ${name}\n\nNo changes from default.\n`;
  return `## ${name}\n\nChanged from default.\n\nDefault length: ${expected.length}\nCurrent length: ${actual.length}\n`;
}
