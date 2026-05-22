# Contextbook

**Learn the concepts behind the code you just touched.**

Contextbook turns your codebase and learning conversations into a personalized knowledge book. It is a deterministic-first local CLI that scans project evidence, finds development/CS concepts in the code, and explains them in a learner-friendly format.

## Why Contextbook?

Developers often meet concepts like `useEffect` cleanup, SSE, WebSocket, stale closures, Zustand, Context API, graphs/DAGs, cache invalidation, and resource lifecycle while working on real projects.

Most study material explains those concepts generically. Contextbook starts from your project instead:

- What can I learn from the code I just touched?
- How does this concept show up in my project?
- How can I explain it in developer/CS/interview language?
- Is this answer grounded in project evidence or general knowledge?

## Install

```bash
npm install -g contextbook
```

Requires Node.js 20 or newer.

## Quickstart

```bash
contextbook setup
cd your-project
contextbook init
contextbook scan
contextbook learn
contextbook why "cleanup 왜 해야 돼?"
```

`contextbook setup` installs local helper files for Codex and Claude Code so coding agents know how to call the deterministic CLI instead of inventing project evidence.

> Contextbook v0.1 does not require an LLM API key. The scanner and formatter are local and deterministic-first.

## What it creates

Project memory is stored inside the current repo:

```txt
.contextbook/
  project/
    config.json
    concepts.json
    evidence.jsonl
  prompts/
    learn.md
    why.md
```

Learner memory is stored outside the repo:

```txt
~/.contextbook/
  learners/
    default/
      profile.md
      preferences.json
      weak-terms.json
      signals.jsonl
      answers.jsonl
      profile-updates.jsonl
```

This keeps personal learning signals out of project commits.

## Core commands

```bash
contextbook setup                  # install Codex + Claude Code helper files
contextbook setup --dry-run        # preview helper file writes
contextbook init                   # initialize .contextbook and learner memory
contextbook scan                   # scan project evidence
contextbook learn                  # generate 1-3 learning moments
contextbook why "<question>"       # answer a concept question with evidence level
contextbook profile                # view learner profile
contextbook profile diff           # view profile-related update history
contextbook profile edit           # open learner profile in $EDITOR
contextbook profile reset          # reset learner profile to default
```

## Example output

```md
# Daily Learning Card

## 1. useEffect cleanup / lifecycle

근거 수준: direct
근거 파일: src/hooks/useWorkflowSSE.ts

이 프로젝트에서는 EventSource 연결을 만들고 있기 때문에 cleanup이 중요합니다.

연결되는 개념:
- useEffect cleanup
- resource lifecycle
- memory leak

면접 질문:
React에서 SSE 연결을 사용할 때 cleanup이 필요한 이유는 무엇인가요?
```

`contextbook why "cleanup 왜 해야 돼?"` uses a fixed learning-friendly format:

```md
## 근거 수준
## 프로젝트 말로 설명
## 쉬운 말
## 개발자 용어
## CS 연결
## 면접 문장
## 근거 파일
```

Evidence levels:

- `direct` — project evidence was found directly
- `related` — related project structure was found
- `general` — no project evidence was found; answer is general guidance

## Codex / Claude Code integration

Global npm installation does not mutate Codex or Claude Code config automatically. Run setup explicitly so target paths, backups, and dry-run behavior stay visible.

```bash
contextbook setup --dry-run
contextbook setup
```

Generated files:

- Codex/OMX skill: `~/.codex/skills/contextbook/SKILL.md`
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

- `auto` — default; write `~/.codex/skills/contextbook/SKILL.md` for the current Codex/OMX user skill root
- `codex` — write canonical `~/.codex/skills/contextbook/SKILL.md`
- `agents` — write historical `~/.agents/skills/contextbook/SKILL.md` compatibility path
- `both` — write both paths intentionally

## What Contextbook scans in v0.1

The scanner uses simple local signals from:

- `package.json`
- README/docs
- git diff / changed files
- imports
- file names
- function/hook names
- keyword/regex concept rules

Initial concept patterns include:

- `EventSource` → SSE / async event handling
- `WebSocket` → realtime bidirectional communication
- `useEffect` + returned cleanup → cleanup / lifecycle
- `zustand` → state management / subscription
- `createContext` → Context API / render propagation
- `nodes` + `edges` → graph / DAG / dependency
- `fetch` / `axios` → HTTP / async / error handling
- `setTimeout` → timer / event loop
- `useMemo` / `useCallback` → memoization / render optimization

Hidden/runtime directories such as `.git`, `.contextbook`, `.omx`, `.codex`, `.claude`, and `.fooks` are ignored by default.

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

## Scope

Contextbook v0.1 intentionally does not include:

- web dashboard
- external LLM/API calls
- full automatic personalization
- complex knowledge tracing
- perfect whole-codebase understanding
- team-shared learner memory

## License

MIT
