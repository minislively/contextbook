# Contextbook

Learn the concepts behind the code you just touched.

Contextbook is a deterministic-first local CLI that scans a project, finds development/CS concepts grounded in code evidence, and explains them in a learner-friendly format.

## Install

```bash
npm install -g contextbook
```

## Commands

```bash
contextbook init
contextbook scan
contextbook learn
contextbook why "cleanup 왜 해야 돼?"
contextbook profile
contextbook profile diff
contextbook profile edit
contextbook profile reset
contextbook install codex --dry-run
contextbook install codex
contextbook install claude-code --dry-run
contextbook install claude-code
```

## Codex / Claude Code integration

Contextbook can generate local helper files so coding agents know how to call the deterministic CLI instead of inventing project evidence.

```bash
contextbook install codex --dry-run
contextbook install codex

contextbook install claude-code --dry-run
contextbook install claude-code
```

Generated files:

- Codex skill: `~/.codex/skills/contextbook/SKILL.md`
- Claude Code skill: `~/.claude/skills/contextbook/SKILL.md`
- Claude Code slash-command compatibility:
  - `~/.claude/commands/contextbook-learn.md`
  - `~/.claude/commands/contextbook-why.md`

Safety rules:

- `--dry-run` previews planned writes and writes nothing.
- Existing identical files are skipped.
- Existing different files are backed up with `.bak-<timestamp>` before Contextbook writes the managed file.
- The installer does not call external LLM APIs, ask for API keys, or launch Codex/Claude sessions.

## Adapter-ready core

The CLI is a thin adapter over the deterministic core. Future Codex/Claude adapters can import the same contract without scraping CLI output:

```ts
import { answerWhy, buildLearningMoments, scanProject } from 'contextbook';

await scanProject({ root: process.cwd(), learner: 'default' });
const learn = await buildLearningMoments({ root: process.cwd() });
const why = await answerWhy('cleanup 왜 해야 돼?', { root: process.cwd() });

console.log(learn.markdown);
console.log(why.markdown);
```

## MVP behavior

- Project memory: `.contextbook/`
- Learner memory: `~/.contextbook/learners/default/`
- Evidence levels: `direct`, `related`, `general`
- Daily learning card: `contextbook learn`
- No external LLM/API key required in v0.1

## Example

```bash
contextbook init
contextbook scan
contextbook learn
contextbook why "useEffect cleanup 왜 필요해?"
```

`contextbook scan` uses simple local signals from content, package dependencies, changed files, file names, and function/hook names. `contextbook why` always discloses whether the answer is grounded in `direct`, `related`, or `general` evidence.
