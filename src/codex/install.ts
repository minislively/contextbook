import { homedir } from 'node:os';
import { join } from 'node:path';
import { installFiles } from '../install/file-writer.js';
import type { InstallFile, InstallOptions, InstallResult } from '../install/types.js';

export async function installCodex(options: InstallOptions = {}): Promise<InstallResult> {
  return installFiles('codex', codexFiles(options.homeDir ?? homedir()), options);
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
