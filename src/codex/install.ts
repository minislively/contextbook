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
3. For the default one-shot AI context bundle, run:
   \`\`\`bash
   contextbook memory context --json
   \`\`\`
4. Use the lower-level memory contracts only when debugging a specific layer:
   \`\`\`bash
   contextbook project --json
   contextbook learner --json
   contextbook memory signals --json
   contextbook memory suggest-weak-terms --json
   contextbook memory suggest-profile-updates --json
   \`\`\`
5. To record explicit user feedback as append-only Learner Memory, run \`contextbook memory add-signal --type <allowed-type> --concept "<concept>"\` only when the user clearly expresses feedback. For hook-ready prompt feedback capture, use \`contextbook memory capture-prompt --prompt "<user prompt>" --source codex --json\`; it stores sanitized signal notes, not raw transcript text. Do not infer ability or mutate profile.
6. Profile update candidates are preview-first. Use \`contextbook memory apply-profile-update --candidate <id|index> --dry-run\` to show the exact preferences-only change, and run without \`--dry-run\` only after explicit user approval.
7. For learning moments, run:
   \`\`\`bash
   contextbook learn
   \`\`\`
8. For concept questions, run:
   \`\`\`bash
   contextbook why \"<question>\"
   \`\`\`
9. Preserve Contextbook's evidence level: \`direct\`, \`related\`, or \`general\`.
10. Do not claim stronger project evidence than the CLI output provides.
11. Do not ask for API keys; Contextbook v0.1 is local and deterministic-first.

## Useful commands

- \`contextbook init\` — create project and learner memory files.
- \`contextbook scan\` — refresh local project evidence.
- \`contextbook memory context --json\` — inspect Project/Learner/Conversation Memory in one stable AI-readable bundle.
- \`contextbook project --json\` — inspect Project Memory in a stable AI-readable shape.
- \`contextbook learner --json\` — inspect Learner Memory in a stable AI-readable shape.
- \`contextbook memory signals --json\` — inspect recent explicit memory signals.
- \`contextbook memory suggest-weak-terms --json\` — inspect suggestion-only weak-term review candidates without mutating learner memory.
- \`contextbook memory suggest-profile-updates --json\` — inspect suggestion-only profile update candidates without editing profile/preferences.
- \`contextbook memory apply-profile-update --candidate <id|index> --dry-run\` — preview an explicit preferences-only profile candidate before any write.
- \`contextbook memory add-signal --type feedback.confused --concept "event loop"\` — record explicit feedback only.
- \`contextbook memory capture-prompt --prompt "뭔소리야 너무 추상적임" --source codex --json\` — deterministically capture explicit prompt feedback without storing the raw prompt.
- \`contextbook learn\` — produce 1-3 learning moments.
- \`contextbook why \"cleanup 왜 해야 돼?\"\` — answer with project context, plain language, developer term, CS link, interview sentence, and evidence files.
- \`contextbook profile\` — inspect the learner profile.
`;
}
