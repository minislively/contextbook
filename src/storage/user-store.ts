import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LearnerPreferences, WeakTerms } from '../types.js';
import { appendJsonl, ensureDir, readJson, writeIfMissing, writeJson } from './fs-utils.js';

export function learnerDir(learner = 'default'): string {
  return join(homedir(), '.contextbook', 'learners', learner);
}

export const learnerPaths = (learner = 'default') => {
  const base = learnerDir(learner);
  return {
    base,
    profile: join(base, 'profile.md'),
    preferences: join(base, 'preferences.json'),
    weakTerms: join(base, 'weak-terms.json'),
    signals: join(base, 'signals.jsonl'),
    answers: join(base, 'answers.jsonl'),
    profileUpdates: join(base, 'profile-updates.jsonl')
  };
};

export const defaultProfile = `# Learner Profile\n\n## Goals\n\n- 현재 프로젝트에서 나온 개발/CS 개념 이해하기\n- 내가 한 작업을 면접/글쓰기 언어로 설명하기\n\n## Preferred Explanation\n\n1. Project context\n2. Plain language\n3. Developer term\n4. CS concept\n5. Interview sentence\n\n## Avoid\n\n- abstract lecture first\n- too many commands\n- generic textbook explanation\n`;

export const defaultPreferences: LearnerPreferences = {
  explanationOrder: ['project', 'plain', 'developer-term', 'cs-link', 'interview-sentence'],
  avoid: ['abstract lecture first', 'too many commands', 'generic textbook explanation']
};

export async function ensureLearnerStore(learner = 'default'): Promise<void> {
  const paths = learnerPaths(learner);
  await ensureDir(paths.base);
  await writeIfMissing(paths.profile, defaultProfile);
  await writeIfMissing(paths.preferences, JSON.stringify(defaultPreferences, null, 2) + '\n');
  await writeIfMissing(paths.weakTerms, '{}\n');
  await writeIfMissing(paths.signals, '');
  await writeIfMissing(paths.answers, '');
  await writeIfMissing(paths.profileUpdates, '');
}

export async function readWeakTerms(learner = 'default'): Promise<WeakTerms> {
  return readJson<WeakTerms>(learnerPaths(learner).weakTerms, {});
}

export async function writeWeakTerms(terms: WeakTerms, learner = 'default'): Promise<void> {
  await writeJson(learnerPaths(learner).weakTerms, terms);
}

export async function recordAnswer(answer: unknown, learner = 'default'): Promise<void> {
  await appendJsonl(learnerPaths(learner).answers, answer);
}

export async function recordSignal(signal: unknown, learner = 'default'): Promise<void> {
  await appendJsonl(learnerPaths(learner).signals, { ...asRecord(signal), recordedAt: new Date().toISOString() });
}

export async function recordProfileUpdate(update: unknown, learner = 'default'): Promise<void> {
  await appendJsonl(learnerPaths(learner).profileUpdates, { ...asRecord(update), recordedAt: new Date().toISOString() });
}

export async function readPreferences(learner = 'default'): Promise<LearnerPreferences> {
  return readJson<LearnerPreferences>(learnerPaths(learner).preferences, defaultPreferences);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : { value };
}
