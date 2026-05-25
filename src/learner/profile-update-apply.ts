import { copyFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createConversationEvent } from './conversation-memory.js';
import { profileUpdateCandidatesJson } from './profile-update-candidates.js';
import { ensureLearnerStore, learnerPaths, readPreferences, recordProfileUpdate } from '../storage/user-store.js';
import type {
  ApplyProfileUpdateChange,
  ApplyProfileUpdateResult,
  ApplyProfileUpdateSafety,
  ConversationMemoryEvent,
  LearnerPreferences,
  ProfileUpdateCandidate
} from '../types.js';

const PROJECT_FIRST_TOKENS = ['project', 'project context'];

export interface ApplyProfileUpdateOptions {
  learner?: string;
  candidateRef: string;
  dryRun?: boolean;
}

export async function applyProfileUpdateCandidate(options: ApplyProfileUpdateOptions): Promise<ApplyProfileUpdateResult> {
  const learner = options.learner ?? 'default';
  const dryRun = options.dryRun ?? false;
  await ensureLearnerStore(learner);
  const candidatesJson = await profileUpdateCandidatesJson(learner);
  const candidate = resolveCandidate(candidatesJson.candidates, options.candidateRef);
  if (!candidate) {
    throw new Error(`Profile update candidate not found: ${options.candidateRef}. Run contextbook memory suggest-profile-updates --json again.`);
  }

  const preferences = await readPreferences(learner);
  const plan = planProfileUpdate(candidate, preferences);
  const applied = !dryRun && plan.shouldWrite;
  let auditEvent: ConversationMemoryEvent | undefined;
  let backupCreated: string | undefined;

  if (applied) {
    const paths = learnerPaths(learner);
    backupCreated = await backupPreferences(paths.preferences);
    await writeFile(paths.preferences, `${JSON.stringify(plan.nextPreferences, null, 2)}\n`, 'utf8');
    auditEvent = createConversationEvent({
      signalType: 'profile-update.applied',
      command: 'memory.apply-profile-update',
      learner,
      conceptLabel: candidate.targetSection,
      metadata: {
        candidateId: candidate.id,
        targetSection: candidate.targetSection,
        changes: plan.changes.length,
        file: 'preferences.json'
      }
    });
    await recordProfileUpdate(auditEvent, learner);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    learner,
    applied,
    dryRun,
    candidate,
    changes: plan.changes,
    auditEvent,
    backupCreated: backupCreated ? basename(backupCreated) : undefined,
    safety: applyProfileUpdateSafety(applied)
  };
}

export function formatApplyProfileUpdateSummary(result: ApplyProfileUpdateResult): string {
  const changes = result.changes.map((change) => `- ${change.file}: ${change.operation} — ${change.message}`).join('\n') || '- no changes';
  return [
    '# Apply Profile Update',
    '',
    `- candidate: ${result.candidate.targetSection}`,
    `- id: ${result.candidate.id}`,
    `- dry run: ${result.dryRun}`,
    `- applied: ${result.applied}`,
    `- audit: ${result.auditEvent?.signalType ?? 'none'}`,
    result.backupCreated ? `- backup: ${result.backupCreated}` : '- backup: none',
    '',
    '## Changes',
    changes,
    '',
    '## Safety',
    `- raw transcript included: ${result.safety.rawTranscriptIncluded}`,
    `- project memory mutated: ${result.safety.projectMemoryMutated}`,
    `- profile mutated: ${result.safety.profileMutated}`,
    `- preferences mutated: ${result.safety.preferencesMutated}`,
    `- weak terms mutated: ${result.safety.weakTermsMutated}`
  ].join('\n');
}

function resolveCandidate(candidates: ProfileUpdateCandidate[], ref: string): ProfileUpdateCandidate | undefined {
  const trimmed = ref.trim();
  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 1) return candidates[asNumber - 1];
  return candidates.find((candidate) => candidate.id === trimmed);
}

function planProfileUpdate(candidate: ProfileUpdateCandidate, preferences: LearnerPreferences): { nextPreferences: LearnerPreferences; changes: ApplyProfileUpdateChange[]; shouldWrite: boolean } {
  if (candidate.targetSection === 'Preferred Explanation') return planPreferredExplanation(candidate, preferences);
  if (candidate.targetSection === 'Avoid') return planAvoid(candidate, preferences);
  return unsupported(candidate, preferences, 'Analogy notes are intentionally applied through contextbook profile edit in this PR.');
}

function planPreferredExplanation(candidate: ProfileUpdateCandidate, preferences: LearnerPreferences): { nextPreferences: LearnerPreferences; changes: ApplyProfileUpdateChange[]; shouldWrite: boolean } {
  const supportsProjectFirst = candidate.reasons.some((reason) => reason.code === 'project-first-requested') || PROJECT_FIRST_TOKENS.some((token) => candidate.suggestion.toLowerCase().includes(token));
  if (!supportsProjectFirst) {
    return unsupported(candidate, preferences, 'This Preferred Explanation candidate is not an allowlisted project-first preference update. Use contextbook profile edit if it feels right.');
  }
  const before = sanitizeExplanationOrder(preferences.explanationOrder);
  const withoutProject = before.filter((item) => item !== 'project');
  const after = ['project', ...withoutProject];
  if (arraysEqual(before, after)) {
    return {
      nextPreferences: { ...preferences, explanationOrder: before },
      changes: [{ file: 'preferences.json', operation: 'skip-identical', before, after, message: 'project is already first in explanationOrder.' }],
      shouldWrite: false
    };
  }
  return {
    nextPreferences: { ...preferences, explanationOrder: after },
    changes: [{ file: 'preferences.json', operation: 'append-preference', before, after, message: 'Moved project to the front of explanationOrder.' }],
    shouldWrite: true
  };
}

function planAvoid(candidate: ProfileUpdateCandidate, preferences: LearnerPreferences): { nextPreferences: LearnerPreferences; changes: ApplyProfileUpdateChange[]; shouldWrite: boolean } {
  const before = sanitizeStringArray(preferences.avoid);
  const nextRule = candidate.suggestion;
  const exists = before.some((item) => normalize(item) === normalize(nextRule));
  const after = exists ? before : [...before, nextRule];
  return {
    nextPreferences: { ...preferences, avoid: after },
    changes: [{
      file: 'preferences.json',
      operation: exists ? 'skip-identical' : 'append-avoid',
      before,
      after,
      message: exists ? 'avoid rule already exists.' : 'Added avoid rule from profile update candidate.'
    }],
    shouldWrite: !exists
  };
}

function unsupported(candidate: ProfileUpdateCandidate, preferences: LearnerPreferences, message: string): { nextPreferences: LearnerPreferences; changes: ApplyProfileUpdateChange[]; shouldWrite: boolean } {
  return {
    nextPreferences: preferences,
    changes: [{
      file: candidate.targetSection === 'Analogy Notes' ? 'profile.md' : 'preferences.json',
      operation: 'unsupported-target',
      message: `${message} Recommended action: contextbook profile edit.`
    }],
    shouldWrite: false
  };
}

function sanitizeExplanationOrder(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function sanitizeStringArray(values: string[]): string[] {
  return values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function backupPreferences(path: string): Promise<string> {
  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await copyFile(path, backup);
  return backup;
}

function applyProfileUpdateSafety(applied: boolean): ApplyProfileUpdateSafety {
  return {
    rawTranscriptIncluded: false,
    absolutePathsIncluded: false,
    hiddenContentIncluded: false,
    projectMemoryMutated: false,
    weakTermsMutated: false,
    profileMutated: false,
    preferencesMutated: applied,
    unsafeJudgmentIncluded: false
  };
}
