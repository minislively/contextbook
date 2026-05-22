# Contextbook

Learn the concepts behind the code you just touched.

Contextbook is a deterministic-first local CLI that scans a project, finds development/CS concepts grounded in code evidence, and explains them in a learner-friendly format.

## Quickstart

```bash
npm install -g contextbook
contextbook setup
contextbook init
contextbook scan
contextbook learn
contextbook why "cleanup 왜 해야 돼?"
```

`contextbook setup` installs local helper files for both Codex and Claude Code so coding agents know how to call the deterministic CLI instead of inventing project evidence.

## Commands

```bash
contextbook setup
contextbook init
contextbook scan
contextbook learn
contextbook why "cleanup 왜 해야 돼?"
contextbook profile
contextbook profile diff
contextbook profile edit
contextbook profile reset
```

## Codex / Claude Code integration

Global npm installation does not mutate Codex or Claude Code config automatically. Run the explicit setup command so target paths, backups, and dry-run behavior stay visible.

```bash
contextbook setup --dry-run
contextbook setup
```

Generated files:

- Codex skill: `~/.agents/skills/contextbook/SKILL.md` by default for current OpenAI Agent Skills docs
- Codex legacy compatibility: `~/.codex/skills/contextbook/SKILL.md` when `~/.codex/skills` already exists and `~/.agents/skills` does not
- Claude Code skill: `~/.claude/skills/contextbook/SKILL.md`
- Claude Code slash-command compatibility:
  - `~/.claude/commands/contextbook-learn.md`
  - `~/.claude/commands/contextbook-why.md`

Safety rules:

- `contextbook setup` installs both Codex and Claude Code helper files in one explicit step.
- `contextbook setup --dry-run` previews planned writes and writes nothing.
- Existing identical files are skipped.
- Existing different files are backed up with `.bak-<timestamp>` before Contextbook writes the managed file.
- The installer does not call external LLM APIs, ask for API keys, or launch Codex/Claude sessions.

### Advanced install options

Use these only when you need platform-specific setup or a specific Codex discovery path:

```bash
contextbook install all --dry-run
contextbook install all
contextbook install all --codex-path codex --dry-run
contextbook install codex --dry-run
contextbook install codex --codex-path agents --dry-run
contextbook install codex --codex-path codex --dry-run
contextbook install codex --codex-path both --dry-run
contextbook install claude-code --dry-run
contextbook install claude-code
```

`--codex-path` values:

- `auto` — default; use `~/.agents/skills`, unless only legacy `~/.codex/skills` already exists
- `agents` — write `~/.agents/skills/contextbook/SKILL.md`
- `codex` — write `~/.codex/skills/contextbook/SKILL.md`
- `both` — write both paths intentionally

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
