import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ensureDir, exists } from '../storage/fs-utils.js';

export type InstallTarget = 'codex' | 'claude-code';
export type InstallActionStatus = 'create' | 'update-with-backup' | 'skip-identical' | 'dry-run-create' | 'dry-run-update-with-backup';

export interface InstallOptions {
  dryRun?: boolean;
  homeDir?: string;
  now?: Date;
}

export interface InstallFile {
  path: string;
  content: string;
  description: string;
}

export interface InstallAction {
  path: string;
  description: string;
  status: InstallActionStatus;
  backupPath?: string;
}

export interface InstallResult {
  target: InstallTarget;
  dryRun: boolean;
  files: InstallFile[];
  actions: InstallAction[];
}

export async function installCodex(options: InstallOptions = {}): Promise<InstallResult> {
  return installTarget('codex', codexFiles(resolveHome(options.homeDir)), options);
}

export async function installClaudeCode(options: InstallOptions = {}): Promise<InstallResult> {
  return installTarget('claude-code', claudeCodeFiles(resolveHome(options.homeDir)), options);
}

export function codexFiles(homeDir = homedir()): InstallFile[] {
  return [
    {
      path: join(homeDir, '.codex', 'skills', 'contextbook', 'SKILL.md'),
      description: 'Codex user skill for Contextbook learning workflows',
      content: codexSkillContent()
    }
  ];
}

export function claudeCodeFiles(homeDir = homedir()): InstallFile[] {
  return [
    {
      path: join(homeDir, '.claude', 'skills', 'contextbook', 'SKILL.md'),
      description: 'Claude Code personal skill for Contextbook learning workflows',
      content: claudeSkillContent()
    },
    {
      path: join(homeDir, '.claude', 'commands', 'contextbook-learn.md'),
      description: 'Claude Code slash command compatibility file for /contextbook-learn',
      content: claudeLearnCommandContent()
    },
    {
      path: join(homeDir, '.claude', 'commands', 'contextbook-why.md'),
      description: 'Claude Code slash command compatibility file for /contextbook-why',
      content: claudeWhyCommandContent()
    }
  ];
}

async function installTarget(target: InstallTarget, files: InstallFile[], options: InstallOptions): Promise<InstallResult> {
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

function resolveHome(homeDir?: string): string {
  return homeDir ?? homedir();
}

function backupStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function codexSkillContent(): string {
  return `---
name: contextbook
description: Use when the user wants to learn concepts behind the code they just touched, generate project-grounded learning moments, or answer why a development/CS concept matters in this repository using the local contextbook CLI.
---

# Contextbook

Use the local \`contextbook\` CLI to turn this repository's code evidence into project-grounded learning notes.

## When to use

- The user asks what they can learn from the code they just changed.
- The user asks \"why\" a concept matters in the current project.
- The user wants interview-ready wording for concepts found in their code.

## Workflow

1. Prefer deterministic local evidence over generic explanation.
2. If project memory may be stale, run:
   \`\`\`bash
   contextbook scan
   \`\`\`
3. For learning moments, run:
   \`\`\`bash
   contextbook learn
   \`\`\`
4. For concept questions, run:
   \`\`\`bash
   contextbook why \"<question>\"
   \`\`\`
5. Preserve Contextbook's evidence level: \`direct\`, \`related\`, or \`general\`.
6. Do not claim stronger project evidence than the CLI output provides.
7. Do not ask for API keys; Contextbook v0.1 is local and deterministic-first.

## Useful commands

- \`contextbook init\` — create project and learner memory files.
- \`contextbook scan\` — refresh local project evidence.
- \`contextbook learn\` — produce 1-3 learning moments.
- \`contextbook why \"cleanup 왜 해야 돼?\"\` — answer with project context, plain language, developer term, CS link, interview sentence, and evidence files.
- \`contextbook profile\` — inspect the learner profile.
`;
}

function claudeSkillContent(): string {
  return `---
name: contextbook
description: Use Contextbook to explain the development and CS concepts behind code the user just touched, grounded in local project evidence.
---

# Contextbook

Use the local \`contextbook\` CLI for project-grounded learning moments and why-answers.

## Runbook

- If the project has not been initialized, run \`contextbook init\`.
- Refresh evidence with \`contextbook scan\` when code changed or memory may be stale.
- Use \`contextbook learn\` to produce learning moments from the current project/diff.
- Use \`contextbook why \"$ARGUMENTS\"\` for concept questions when invoked with arguments.
- Keep the CLI's evidence level visible: \`direct\`, \`related\`, or \`general\`.
- Do not add external LLM/API setup; Contextbook v0.1 works locally.

## Output rule

When summarizing Contextbook output, preserve project files, evidence level, and the interview sentence. Do not invent project evidence that is not present in the CLI output.
`;
}

function claudeLearnCommandContent(): string {
  return `---
description: Generate Contextbook learning moments from the current repository.
---

Run Contextbook locally and report the result without inventing extra evidence:

1. Run \`contextbook scan\` if project evidence may be stale.
2. Run \`contextbook learn\`.
3. Preserve the evidence level and evidence files from the output.
`;
}

function claudeWhyCommandContent(): string {
  return `---
description: Answer a concept question with Contextbook project evidence.
---

Answer this question using Contextbook:

$ARGUMENTS

Run:

\`\`\`bash
contextbook why "$ARGUMENTS"
\`\`\`

Preserve the evidence level, project-language explanation, CS connection, interview sentence, and evidence files. If Contextbook says evidence is \`general\`, do not imply the concept was found directly in the project.
`;
}
