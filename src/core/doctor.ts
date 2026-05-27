import { basename } from 'node:path';
import { hooksStatus } from '../hooks/status.js';
import type { HooksStatusJson } from '../hooks/types.js';
import { exists, readJson, readJsonl } from '../storage/fs-utils.js';
import { projectPaths } from '../storage/project-store.js';
import { learnerPaths } from '../storage/user-store.js';
import type { ContextbookRuntimeOptions, LearnerPreferences, WeakTerms } from '../types.js';

export interface DoctorJson {
  schemaVersion: 1;
  generatedAt: string;
  project: DoctorProjectStatus;
  learner: DoctorLearnerStatus;
  hooks: DoctorHooksSummary;
  nextActions: DoctorNextAction[];
  safety: DoctorSafety;
}

export interface DoctorProjectStatus {
  rootName: string;
  initialized: boolean;
  scanned: boolean;
  files: Array<{ name: 'config' | 'concepts' | 'evidence' | 'fileIndex' | 'scanRuns'; path: string; exists: boolean; records?: number }>;
  counts: {
    concepts: number;
    evidence: number;
    scanRuns: number;
    indexedFiles: number;
  };
  status: 'missing' | 'initialized' | 'scanned';
}

export interface DoctorLearnerStatus {
  learner: string;
  initialized: boolean;
  files: Array<{ name: 'profile' | 'preferences' | 'weakTerms' | 'signals' | 'answers' | 'profileUpdates'; path: string; exists: boolean; records?: number }>;
  counts: {
    weakTerms: number;
    signals: number;
    answers: number;
    profileUpdates: number;
  };
  status: 'missing' | 'ready';
}

export interface DoctorHooksSummary {
  platforms: Array<{
    id: string;
    helper: boolean;
    configEnabled: boolean;
    helperSmoke: string;
    contextbookBinary: string;
  }>;
  status: 'missing' | 'helpers-installed' | 'configured';
}

export interface DoctorNextAction {
  command: string;
  reason: string;
}

export interface DoctorSafety {
  readOnly: true;
  projectMemoryMutated: false;
  learnerMemoryMutated: false;
  hookConfigMutated: false;
  rawTranscriptIncluded: false;
  absolutePathsIncluded: false;
  unsafeJudgmentIncluded: false;
}

export async function buildDoctor(options: ContextbookRuntimeOptions & { learner?: string } = {}): Promise<DoctorJson> {
  const root = options.root ?? process.cwd();
  const learner = options.learner ?? 'default';
  const [project, learnerStatus] = await Promise.all([
    projectDoctorStatus(root),
    learnerDoctorStatus(learner)
  ]);
  const hooks = hooksDoctorSummary(hooksStatus());
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    project,
    learner: learnerStatus,
    hooks,
    nextActions: nextActions(project, learnerStatus, hooks),
    safety: {
      readOnly: true,
      projectMemoryMutated: false,
      learnerMemoryMutated: false,
      hookConfigMutated: false,
      rawTranscriptIncluded: false,
      absolutePathsIncluded: false,
      unsafeJudgmentIncluded: false
    }
  };
}

export function formatDoctorMarkdown(result: DoctorJson): string {
  const projectFiles = result.project.files.map((file) => `- ${file.name}: ${file.exists ? 'found' : 'missing'} (${file.path})${typeof file.records === 'number' ? ` — ${file.records} records` : ''}`).join('\n');
  const learnerFiles = result.learner.files.map((file) => `- ${file.name}: ${file.exists ? 'found' : 'missing'} (${file.path})${typeof file.records === 'number' ? ` — ${file.records} records` : ''}`).join('\n');
  const hookLines = result.hooks.platforms.map((platform) => `- ${platform.id}: helper=${platform.helper ? 'found' : 'missing'}, config=${platform.configEnabled ? 'enabled' : 'not-enabled'}, smoke=${platform.helperSmoke}, binary=${platform.contextbookBinary}`).join('\n');
  const actions = result.nextActions.map((action) => `- \`${action.command}\` — ${action.reason}`).join('\n') || '- none';
  return [
    '# Contextbook Doctor',
    '',
    `- generated: ${result.generatedAt}`,
    `- project status: ${result.project.status}`,
    `- learner status: ${result.learner.status}`,
    `- hooks status: ${result.hooks.status}`,
    '',
    '## Project Memory',
    `- root: ${result.project.rootName}`,
    `- initialized: ${result.project.initialized}`,
    `- scanned: ${result.project.scanned}`,
    `- concepts: ${result.project.counts.concepts}`,
    `- evidence records: ${result.project.counts.evidence}`,
    `- scan runs: ${result.project.counts.scanRuns}`,
    `- indexed files: ${result.project.counts.indexedFiles}`,
    '',
    '### Project Files',
    projectFiles,
    '',
    '## Learner Memory',
    `- learner: ${result.learner.learner}`,
    `- initialized: ${result.learner.initialized}`,
    `- weak terms: ${result.learner.counts.weakTerms}`,
    `- signals: ${result.learner.counts.signals}`,
    `- answers: ${result.learner.counts.answers}`,
    `- profile updates: ${result.learner.counts.profileUpdates}`,
    '',
    '### Learner Files',
    learnerFiles,
    '',
    '## Hooks',
    hookLines,
    '',
    '## Next Actions',
    actions,
    '',
    '## Safety',
    `- read-only: ${result.safety.readOnly}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated}`,
    `- learner memory mutated: ${result.safety.learnerMemoryMutated}`,
    `- hook config mutated: ${result.safety.hookConfigMutated}`,
    `- raw transcript included: ${result.safety.rawTranscriptIncluded}`
  ].join('\n');
}

async function projectDoctorStatus(root: string): Promise<DoctorProjectStatus> {
  const paths = projectPaths(root);
  const [configExists, conceptsExists, evidenceExists, fileIndexExists, scanRunsExists] = await Promise.all([
    exists(paths.config),
    exists(paths.concepts),
    exists(paths.evidence),
    exists(paths.fileIndex),
    exists(paths.scanRuns)
  ]);
  const [concepts, evidence, scanRuns, fileIndex] = await Promise.all([
    readJson<unknown[]>(paths.concepts, []),
    readJsonl(paths.evidence),
    readJsonl(paths.scanRuns),
    readJson<{ files?: unknown[] }>(paths.fileIndex, { files: [] })
  ]);
  const counts = {
    concepts: concepts.length,
    evidence: evidence.length,
    scanRuns: scanRuns.length,
    indexedFiles: Array.isArray(fileIndex.files) ? fileIndex.files.length : 0
  };
  const initialized = configExists || conceptsExists || evidenceExists || fileIndexExists || scanRunsExists;
  const scanned = counts.scanRuns > 0 || counts.concepts > 0 || counts.evidence > 0 || counts.indexedFiles > 0;
  const files: DoctorProjectStatus['files'] = [
    { name: 'config', path: '.contextbook/project/config.json', exists: configExists },
    { name: 'concepts', path: '.contextbook/project/concepts.json', exists: conceptsExists, records: counts.concepts },
    { name: 'evidence', path: '.contextbook/project/evidence.jsonl', exists: evidenceExists, records: counts.evidence },
    { name: 'fileIndex', path: '.contextbook/project/file-index.json', exists: fileIndexExists, records: counts.indexedFiles },
    { name: 'scanRuns', path: '.contextbook/project/scan-runs.jsonl', exists: scanRunsExists, records: counts.scanRuns }
  ];
  return {
    rootName: basename(root),
    initialized,
    scanned,
    files,
    counts,
    status: scanned ? 'scanned' : initialized ? 'initialized' : 'missing'
  };
}

async function learnerDoctorStatus(learner: string): Promise<DoctorLearnerStatus> {
  const paths = learnerPaths(learner);
  const [profileExists, preferencesExists, weakTermsExists, signalsExists, answersExists, profileUpdatesExists] = await Promise.all([
    exists(paths.profile),
    exists(paths.preferences),
    exists(paths.weakTerms),
    exists(paths.signals),
    exists(paths.answers),
    exists(paths.profileUpdates)
  ]);
  const [preferences, weakTerms, signals, answers, profileUpdates] = await Promise.all([
    readJson<LearnerPreferences | null>(paths.preferences, null),
    readJson<WeakTerms>(paths.weakTerms, {}),
    readJsonl(paths.signals),
    readJsonl(paths.answers),
    readJsonl(paths.profileUpdates)
  ]);
  const counts = {
    weakTerms: Object.keys(weakTerms).length,
    signals: signals.length,
    answers: answers.length,
    profileUpdates: profileUpdates.length
  };
  const initialized = profileExists || preferencesExists || weakTermsExists || signalsExists || answersExists || profileUpdatesExists;
  return {
    learner,
    initialized,
    files: [
      { name: 'profile', path: `~/.contextbook/learners/${learner}/profile.md`, exists: profileExists, records: profileExists ? 1 : 0 },
      { name: 'preferences', path: `~/.contextbook/learners/${learner}/preferences.json`, exists: preferencesExists, records: preferences ? 1 : 0 },
      { name: 'weakTerms', path: `~/.contextbook/learners/${learner}/weak-terms.json`, exists: weakTermsExists, records: counts.weakTerms },
      { name: 'signals', path: `~/.contextbook/learners/${learner}/signals.jsonl`, exists: signalsExists, records: counts.signals },
      { name: 'answers', path: `~/.contextbook/learners/${learner}/answers.jsonl`, exists: answersExists, records: counts.answers },
      { name: 'profileUpdates', path: `~/.contextbook/learners/${learner}/profile-updates.jsonl`, exists: profileUpdatesExists, records: counts.profileUpdates }
    ],
    counts,
    status: initialized ? 'ready' : 'missing'
  };
}

function hooksDoctorSummary(status: HooksStatusJson): DoctorHooksSummary {
  const platforms = status.platforms.map((platform) => ({
    id: platform.id,
    helper: platform.helper.exists,
    configEnabled: platform.configs.some((config) => config.status === 'enabled'),
    helperSmoke: platform.runtime.helperSmoke,
    contextbookBinary: platform.runtime.contextbookBinary
  }));
  const anyHelper = platforms.some((platform) => platform.helper);
  const anyConfigured = platforms.some((platform) => platform.configEnabled);
  return {
    platforms,
    status: anyConfigured ? 'configured' : anyHelper ? 'helpers-installed' : 'missing'
  };
}

function nextActions(project: DoctorProjectStatus, learner: DoctorLearnerStatus, hooks: DoctorHooksSummary): DoctorNextAction[] {
  const actions: DoctorNextAction[] = [];
  if (!project.initialized) actions.push({ command: 'contextbook init', reason: 'Create project memory before scanning.' });
  if (!project.scanned) actions.push({ command: 'contextbook scan', reason: 'Collect project evidence and concept mappings.' });
  if (!learner.initialized) actions.push({ command: 'contextbook learner', reason: 'Create or inspect learner memory in your home directory.' });
  if (hooks.status === 'missing') actions.push({ command: 'contextbook setup --hooks', reason: 'Install optional Codex and Claude Code hook helpers.' });
  if (hooks.status === 'helpers-installed') actions.push({ command: 'contextbook hooks status', reason: 'Review generated hook config snippets and trust settings.' });
  if (hooks.status !== 'missing') actions.push({ command: 'contextbook hooks smoke --prompt "cleanup 왜 해야 돼?" --json', reason: 'Verify hook helper output locally without writing memory.' });
  if (project.scanned && learner.initialized) actions.push({ command: 'contextbook memory context --json', reason: 'Show compact AI-readable memory context.' });
  return dedupeActions(actions);
}

function dedupeActions(actions: DoctorNextAction[]): DoctorNextAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.command)) return false;
    seen.add(action.command);
    return true;
  });
}
