import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { recordConversationProfileUpdate, recordConversationSignal } from '../learner/conversation-memory.js';
import { defaultPreferences, defaultProfile, ensureLearnerStore, learnerPaths } from '../storage/user-store.js';
import { profileMarkdown } from '../learner/profile.js';

export async function profileCommand(args: string[] = []): Promise<void> {
  const [subcommand] = args;
  switch (subcommand) {
    case undefined:
      console.log(await profileMarkdown('default'));
      await recordConversationSignal({ signalType: 'profile.viewed', command: 'profile', learner: 'default' });
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
  await recordConversationSignal({ signalType: 'profile.diff.viewed', command: 'profile.diff', learner: 'default' });
}

async function editProfile(): Promise<void> {
  await ensureLearnerStore('default');
  const paths = learnerPaths('default');
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (!editor) {
    console.log(`Set EDITOR to edit automatically. Profile path:\n${paths.profile}\nPreferences path:\n${paths.preferences}`);
    await recordConversationSignal({ signalType: 'profile.edit.path-shown', command: 'profile.edit', learner: 'default' });
    return;
  }
  const result = spawnSync(editor, [paths.profile], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Editor exited with status ${result.status ?? 'unknown'}`);
  await recordConversationProfileUpdate({ signalType: 'profile.edited', command: 'profile.edit', learner: 'default', metadata: { file: 'profile.md' } });
}

async function resetProfile(): Promise<void> {
  await ensureLearnerStore('default');
  const paths = learnerPaths('default');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(paths.profile, `${paths.profile}.bak-${stamp}`);
  await copyFile(paths.preferences, `${paths.preferences}.bak-${stamp}`);
  await writeFile(paths.profile, defaultProfile, 'utf8');
  await writeFile(paths.preferences, `${JSON.stringify(defaultPreferences, null, 2)}\n`, 'utf8');
  await recordConversationProfileUpdate({ signalType: 'profile.reset', command: 'profile.reset', learner: 'default', metadata: { backups: 2 } });
  console.log('Learner profile reset to defaults. Backups were created next to the original files.');
}

function sectionDiff(name: string, expected: string, actual: string): string {
  if (expected === actual) return `## ${name}\n\nNo changes from default.\n`;
  return `## ${name}\n\nChanged from default.\n\nDefault length: ${expected.length}\nCurrent length: ${actual.length}\n`;
}
