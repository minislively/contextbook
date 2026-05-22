import { homedir } from 'node:os';
import { join } from 'node:path';
import { installFiles } from './file-writer.js';
import type { InstallFile, InstallOptions, InstallResult } from './types.js';

export async function installClaudeCode(options: InstallOptions = {}): Promise<InstallResult> {
  return installFiles('claude-code', claudeCodeFiles(options.homeDir ?? homedir()), options);
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
