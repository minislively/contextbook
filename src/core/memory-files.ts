import { projectPaths } from '../storage/project-store.js';
import { learnerPaths } from '../storage/user-store.js';

export type MemoryFileScope = 'project' | 'learner';
export type MemoryFileKind = 'json' | 'jsonl' | 'markdown';
export type MemoryFileKey =
  | 'project.config'
  | 'project.concepts'
  | 'project.evidence'
  | 'project.fileIndex'
  | 'project.scanRuns'
  | 'learner.profile'
  | 'learner.preferences'
  | 'learner.weakTerms'
  | 'learner.signals'
  | 'learner.answers'
  | 'learner.profileUpdates';

export interface MemoryFileSpec {
  key: MemoryFileKey;
  scope: MemoryFileScope;
  path: string;
  safePath: string;
  kind: MemoryFileKind;
  recommendedCommand: string;
  backupReason: string;
}

export function knownMemoryFiles(root: string, learner: string): MemoryFileSpec[] {
  const project = projectPaths(root);
  const learnerMemory = learnerPaths(learner);
  const learnerPrefix = `~/.contextbook/learners/${learner}`;
  return [
    { key: 'project.config', scope: 'project', path: project.config, safePath: '.contextbook/project/config.json', kind: 'json', recommendedCommand: 'contextbook init', backupReason: 'Project Memory configuration.' },
    { key: 'project.concepts', scope: 'project', path: project.concepts, safePath: '.contextbook/project/concepts.json', kind: 'json', recommendedCommand: 'contextbook scan', backupReason: 'Detected project concepts.' },
    { key: 'project.evidence', scope: 'project', path: project.evidence, safePath: '.contextbook/project/evidence.jsonl', kind: 'jsonl', recommendedCommand: 'contextbook scan', backupReason: 'Project evidence log.' },
    { key: 'project.fileIndex', scope: 'project', path: project.fileIndex, safePath: '.contextbook/project/file-index.json', kind: 'json', recommendedCommand: 'contextbook scan', backupReason: 'Project file scan index.' },
    { key: 'project.scanRuns', scope: 'project', path: project.scanRuns, safePath: '.contextbook/project/scan-runs.jsonl', kind: 'jsonl', recommendedCommand: 'contextbook scan', backupReason: 'Project scan run audit log.' },
    { key: 'learner.profile', scope: 'learner', path: learnerMemory.profile, safePath: `${learnerPrefix}/profile.md`, kind: 'markdown', recommendedCommand: 'contextbook init', backupReason: 'Learner profile document.' },
    { key: 'learner.preferences', scope: 'learner', path: learnerMemory.preferences, safePath: `${learnerPrefix}/preferences.json`, kind: 'json', recommendedCommand: 'contextbook init', backupReason: 'Learner explanation preferences.' },
    { key: 'learner.weakTerms', scope: 'learner', path: learnerMemory.weakTerms, safePath: `${learnerPrefix}/weak-terms.json`, kind: 'json', recommendedCommand: 'contextbook init', backupReason: 'Weak-term learning state.' },
    { key: 'learner.signals', scope: 'learner', path: learnerMemory.signals, safePath: `${learnerPrefix}/signals.jsonl`, kind: 'jsonl', recommendedCommand: 'contextbook init', backupReason: 'Conversation Memory signal log.' },
    { key: 'learner.answers', scope: 'learner', path: learnerMemory.answers, safePath: `${learnerPrefix}/answers.jsonl`, kind: 'jsonl', recommendedCommand: 'contextbook init', backupReason: 'Answer audit log.' },
    { key: 'learner.profileUpdates', scope: 'learner', path: learnerMemory.profileUpdates, safePath: `${learnerPrefix}/profile-updates.jsonl`, kind: 'jsonl', recommendedCommand: 'contextbook init', backupReason: 'Profile update audit log.' }
  ];
}
