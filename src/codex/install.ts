import { homedir } from 'node:os';
import { join } from 'node:path';
import { installFiles } from '../install/file-writer.js';
import type { CodexSkillPathMode, InstallFile, InstallOptions, InstallResult } from '../install/types.js';

export async function installCodex(options: InstallOptions = {}): Promise<InstallResult> {
  return installFiles('codex', codexFiles(options.homeDir ?? homedir(), options.codexSkillPathMode), options);
}

export function codexFiles(homeDir = homedir(), mode: CodexSkillPathMode = 'auto'): InstallFile[] {
  return resolveCodexSkillPaths(homeDir, mode).map((target) => ({
    path: target.path,
    description: target.description,
    content: codexSkillContent()
  }));
}

function resolveCodexSkillPaths(homeDir: string, mode: CodexSkillPathMode): { path: string; description: string }[] {
  const agentsPath = join(homeDir, '.agents', 'skills', 'contextbook', 'SKILL.md');
  const codexPath = join(homeDir, '.codex', 'skills', 'contextbook', 'SKILL.md');

  if (mode === 'agents') return [legacyAgentsTarget(agentsPath)];
  if (mode === 'codex') return [canonicalCodexTarget(codexPath)];
  if (mode === 'both') return [canonicalCodexTarget(codexPath), legacyAgentsTarget(agentsPath)];

  return [canonicalCodexTarget(codexPath)];
}

function canonicalCodexTarget(path: string): { path: string; description: string } {
  return {
    path,
    description: 'Codex user skill for Contextbook learning workflows (canonical Codex/OMX path)'
  };
}

function legacyAgentsTarget(path: string): { path: string; description: string } {
  return {
    path,
    description: 'Codex user skill for Contextbook learning workflows (historical ~/.agents compatibility path)'
  };
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
3. To inspect Project Memory as an agent-readable contract, run:
   \`\`\`bash
   contextbook project --json
   \`\`\`
4. For learning moments, run:
   \`\`\`bash
   contextbook learn
   \`\`\`
5. For concept questions, run:
   \`\`\`bash
   contextbook why \"<question>\"
   \`\`\`
6. Preserve Contextbook's evidence level: \`direct\`, \`related\`, or \`general\`.
7. Do not claim stronger project evidence than the CLI output provides.
8. Do not ask for API keys; Contextbook v0.1 is local and deterministic-first.

## Useful commands

- \`contextbook init\` — create project and learner memory files.
- \`contextbook scan\` — refresh local project evidence.
- \`contextbook project --json\` — inspect Project Memory in a stable AI-readable shape.
- \`contextbook learn\` — produce 1-3 learning moments.
- \`contextbook why \"cleanup 왜 해야 돼?\"\` — answer with project context, plain language, developer term, CS link, interview sentence, and evidence files.
- \`contextbook profile\` — inspect the learner profile.
`;
}
