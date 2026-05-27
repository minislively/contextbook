# Contextbook

**Learn the concepts behind the code you just touched.**

Contextbook turns your codebase and learning conversations into a personalized knowledge book. It helps you turn real project work into CS/development concepts you can understand, remember, and explain.

## What is Contextbook?

Contextbook is not a generic code explainer.

Most tools answer:

> What does this function do?

Contextbook answers:

> What can I learn from the code I just touched?
> How does this concept appear in my project?
> How can I explain it in plain language, developer terms, CS terms, and interview language?

It is built for developers who have used things like `useEffect` cleanup, SSE, WebSocket, Zustand, Context API, graph/DAG structures, cache invalidation, or resource lifecycle in real projects but want clearer words for them.

## The core idea: three kinds of memory

Contextbook separates project facts from personal learning signals.

### 1. Project Memory

Project Memory lives inside the repository:

```txt
.contextbook/
  project/
    config.json
    concepts.json
    evidence.jsonl
    file-index.json
    scan-runs.jsonl
  prompts/
    learn.md
    why.md
```

It stores what Contextbook found in this project:

- framework/library signals
- package dependencies
- changed files
- imports
- file/function/hook names
- concept evidence such as `EventSource`, `useEffect` cleanup, `zustand`, `nodes` + `edges`

### 2. Learner Memory

Learner Memory lives outside the repository:

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

It stores how you learn:

- preferred explanation order
- weak or repeated terms
- answer history
- profile edits/resets
- lightweight learning signals

This is intentionally outside the repo so personal learning data is not committed with project code.

### 3. Conversation Memory

Conversation Memory is the append-only event layer under learner memory. It records structured learning interactions such as `scan.completed`, `learn.generated`, `why.answered`, and profile commands.

This is not a raw chat transcript. v0.1 stores only small, inspectable events: command, concept/question when relevant, evidence level, evidence files, and safe metadata. It does not silently judge the user, infer personality traits, or auto-update the learner profile.

## Step-by-step workflow

Contextbook is designed as a simple learning loop.

### Step 1. Install once

```bash
npm install -g contextbook
contextbook setup
```

`contextbook setup` installs both Codex and Claude Code helper files by default:

```txt
Codex/OMX:
~/.codex/skills/contextbook/SKILL.md

Claude Code:
~/.claude/skills/contextbook/SKILL.md
~/.claude/commands/contextbook-learn.md
~/.claude/commands/contextbook-why.md
```

If you want to preview the writes first:

```bash
contextbook setup --dry-run
```

Prompt-capture hooks are opt-in because they run on every submitted prompt. To install hook helper files for both Codex and Claude Code:

```bash
contextbook setup --hooks --dry-run
contextbook setup --hooks
contextbook hooks status
contextbook hooks status --json
contextbook hooks smoke --prompt "cleanup 왜 해야 돼?" --json
contextbook install codex --hooks --dry-run
contextbook install claude-code --hooks --dry-run
```

This creates hook scripts and guide snippets, but it does not silently edit your existing Codex/Claude hook settings. The hook helper runs `contextbook memory hook-suggest` so agents can receive suggestion-only context for preference dry-runs and read-only Contextbook memory for learning questions; it never auto-applies profile/preferences or stores the raw prompt:

```txt
Codex hook helpers:
~/.codex/hooks/contextbook-user-prompt-submit.js
~/.codex/hooks/contextbook-user-prompt-submit.md

Claude Code hook helpers:
~/.claude/hooks/contextbook-user-prompt-submit.js
~/.claude/hooks/contextbook-user-prompt-submit.md
```

After install, run `contextbook hooks status` to see which helper files and hook configs are detected. Then merge the generated snippet into `~/.codex/hooks.json` or `~/.claude/settings.json` and use your agent's hook review/trust flow if required.

Claude Code officially supports `UserPromptSubmit` additional context via hook stdout/JSON. Codex hook context behavior can vary by installed Codex runtime, so treat Codex hook context as best-effort and verify it with `/hooks` or a live local prompt before relying on it.

Use `contextbook hooks smoke --prompt "cleanup 왜 해야 돼?" --json` after `contextbook setup --hooks` to inspect the generated helper output locally before relying on a live agent runtime.

Requires Node.js 20 or newer.

### Step 2. Initialize a project

```bash
cd your-project
contextbook init
```

This creates `.contextbook/` project memory and the default learner profile if needed.

### Step 3. Scan project evidence

```bash
contextbook scan
```

The scanner reads local project signals and writes:

```txt
.contextbook/project/concepts.json
.contextbook/project/evidence.jsonl
.contextbook/project/file-index.json
.contextbook/project/scan-runs.jsonl
```

`file-index.json` is the latest scan snapshot. It shows scanned files and bounded skipped entries such as hidden or ignored directories, using repo-relative paths only.

`scan-runs.jsonl` is an append-only provenance log for scan runs. It records when a scan happened, how many files/bytes were scanned, how many concepts/evidence records were detected, and whether there were scan warnings. It stores repo-relative/project-safe metadata only, not absolute local paths.

It is deterministic-first and does not call an external LLM API.

### Step 4. Inspect Project Memory

```bash
contextbook project
# or, for agents:
contextbook project --json
```

This is a read-only Project Memory summary. It does not create a new summary file and does not update your learner profile.

It shows:

- whether expected `.contextbook/project/*` files exist
- top detected concepts and their evidence strength
- recent scan runs and warnings
- next action hints such as `contextbook scan`, `contextbook learn`, or `contextbook why`

Use this when you want to check what Contextbook actually knows about the current repository before asking for a learning card.

The default output is Markdown for humans. `--json` returns the same Project Memory as a stable structured contract for Codex, Claude Code, or other agents, including `schemaVersion`, top concepts, recent scan runs, recommended actions, and safety flags.

### Step 5. Inspect Learner Memory

```bash
contextbook learner
# or, for agents:
contextbook learner --json
```

This is a read-only Learner Memory summary. It reads the personal memory under `~/.contextbook/learners/default/` and does not auto-update the learner profile.

It shows:

- learner memory file status
- explanation preferences
- top weak terms
- weak-term review suggestions
- profile update candidates
- recent safe learning signals
- next action hints

The default output is Markdown for humans. `--json` returns a compact agent-readable contract with safety flags such as `rawTranscriptIncluded: false`, `profileMutated: false`, `weakTermsMutated: false`, and `unsafeJudgmentIncluded: false`.

### Step 6. Record explicit memory signals

```bash
contextbook memory add-signal --type feedback.confused --concept "event loop" --note "too abstract"
contextbook memory capture-prompt --prompt "뭔소리야 너무 추상적임" --source manual
contextbook memory hook-suggest --prompt "cleanup 왜 해야 돼?" --source codex --json
contextbook memory signals
contextbook memory suggest-weak-terms
contextbook memory suggest-profile-updates
contextbook memory context
# or, for agents:
contextbook memory capture-prompt --prompt "내 프로젝트에 빗대서 설명해줘" --source codex --json
contextbook memory capture-prompt --prompt "뭔소리야 너무 추상적임" --source manual --json
contextbook memory signals --json
contextbook memory suggest-weak-terms --json
contextbook memory suggest-profile-updates --json
contextbook memory apply-profile-update --candidate <id|index> --dry-run
contextbook memory apply-profile-update --candidate <id|index> --dry-run --json
contextbook memory apply-preference-signals --prompt "앞으로 한국어로, 내 프로젝트 기준으로 쉽게 설명해줘." --dry-run
contextbook memory apply-preference-signals --prompt "앞으로 한국어로, 내 프로젝트 기준으로 쉽게 설명해줘." --dry-run --json
contextbook memory preference-history --json
contextbook memory undo-preference-update --entry 1 --dry-run --json
contextbook memory context --json
```

Memory signals are append-only learning events for explicit feedback such as confusion, positive feedback, format requests, or analogy fit. They do not update your profile or weak terms automatically. `contextbook memory capture-prompt` is the hook-ready deterministic version: it classifies only explicit learning-feedback phrases from a prompt, stores sanitized signal notes, and does not persist the raw prompt. Its JSON output also includes read-only `preferenceSignals` / `preferenceSignalCounts`, so mixed prompts can be split into safe atomic labels such as `explanation.order=project-first`, `language=ko`, or `command.volume=fewer-commands` without mutating `preferences.json`.

Preference signals also expose an intent/scope/risk/policy contract for agents. A detected slot is not automatically treated as durable memory: task-local or uncertain prompts stay `observe-only`, hook capture stays non-mutating, and explicit `apply-preference-signals` is the only path that marks allowlisted preferences as `apply-eligible`. Phrase markers are weak evidence, not the write rule; Contextbook records evidence codes instead of storing the raw prompt.

For agent integrations, `contextbook setup --hooks` installs platform-specific `UserPromptSubmit` helper scripts that call `capture-prompt` locally. The hook scripts are non-blocking and config activation remains manual/snippet-based so existing user hooks are not overwritten.

`contextbook memory suggest-weak-terms` reads those signals and returns review candidates such as “event loop may be worth revisiting”. `contextbook memory suggest-profile-updates` turns repeated explanation-format signals into profile update candidates such as “prefer project context first”. Both suggestion commands are read-only: they do not write `weak-terms.json`, do not edit your profile/preferences, and do not label your ability.

When you explicitly accept a supported profile candidate, preview first with `contextbook memory apply-profile-update --candidate <id|index> --dry-run`. Applying without `--dry-run` is narrow by design: it can update `preferences.json`, creates a timestamped `preferences.json.bak-*`, and appends an audit event to `profile-updates.jsonl`; it does not mutate `profile.md`, `weak-terms.json`, Project Memory, or raw signal logs.

For one-off explicit preferences from a prompt, preview first with `contextbook memory apply-preference-signals --prompt "<text>" --dry-run`. Applying without `--dry-run` only writes allowlisted safe preferences such as language, project-first order, short output, interview sentence, or fewer commands. It creates a `preferences.json.bak-*` backup and appends an audit event without storing the raw prompt. Hook auto-apply is intentionally not enabled by default.

Preference updates are recoverable. Use `contextbook memory preference-history` to inspect audited preference snapshots and `contextbook memory undo-preference-update --entry <id|index> --dry-run` before restoring with `--yes`. Undo restores `preferences.json` from a backup snapshot, creates a fresh backup of the current state, and appends an audit event; it does not touch raw prompts, `profile.md`, weak terms, Project Memory, or signal logs.

`contextbook memory context --json` bundles Project Memory, Learner Memory, signals, suggestions, freshness hints, safety flags, and preview-first next actions for AI agents in one payload.

Allowed v1 signal types:

- `feedback.positive`
- `feedback.confused`
- `format.requested`
- `analogy.accepted`
- `analogy.rejected`
- `term.repeated`

### Step 7. Get learning moments

```bash
contextbook learn
```

This returns 1-3 concepts worth learning from the current project/diff.

Example:

```md
# Daily Learning Card

## 1. useEffect cleanup / lifecycle

근거 수준: direct
근거 파일: src/hooks/useWorkflowSSE.ts

추천 이유:
- 변경 파일 근거: 최근 변경된 파일에서 이 개념 신호가 발견됐습니다.
- 직접 근거: 프로젝트에서 직접적인 코드 신호를 찾았습니다.

이 프로젝트에서는 EventSource 연결을 만들고 있기 때문에 cleanup이 중요합니다.

연결되는 개념:
- useEffect cleanup
- resource lifecycle
- memory leak

면접 질문:
React에서 SSE 연결을 사용할 때 cleanup이 필요한 이유는 무엇인가요?
```

The recommendation reasons are computed locally at learn time. Contextbook does not create a separate ranking history file or call an external ranking API.

### Step 6. Ask why a concept matters

```bash
contextbook why "cleanup 왜 해야 돼?"
```

`why` always uses a fixed format:

```md
## 근거 수준
## 프로젝트 말로 설명
## 쉬운 말
## 개발자 용어
## CS 연결
## 면접 문장
## 근거 파일
```

This is the key Contextbook output: project-grounded explanation → plain language → developer term → CS concept → interview sentence.

## Evidence levels

Contextbook always tells you how strong the project evidence is.

- `direct` — direct evidence was found in this project
- `related` — related structure was found, but not the exact concept
- `general` — no project evidence was found; answer is general guidance

This prevents the tool from pretending it found something in your code when it did not.

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

## Agent integration

After `contextbook setup`, Codex/OMX and Claude Code can call the local CLI instead of guessing from the chat context.

Typical agent flow:

```bash
contextbook scan
contextbook memory context --json
contextbook learn
contextbook why "<question>"
```

Advanced/debug commands:

```bash
contextbook project --json
contextbook learner --json
contextbook memory capture-prompt --prompt "내 프로젝트에 빗대서 설명해줘" --source codex --json
contextbook memory capture-prompt --prompt "뭔소리야 너무 추상적임" --source manual --json
contextbook memory signals --json
contextbook memory suggest-weak-terms --json
contextbook memory suggest-profile-updates --json
contextbook memory apply-profile-update --candidate <id|index> --dry-run
contextbook memory apply-preference-signals --prompt "앞으로 한국어로, 내 프로젝트 기준으로 쉽게 설명해줘." --dry-run
```

The helper files only teach the agent how to use Contextbook. They do not call external APIs, launch agent sessions, or require API keys.

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

## Commands

```bash
contextbook setup                  # install Codex + Claude Code helper files
contextbook setup --dry-run        # preview helper file writes
contextbook hooks status           # read-only hook helper/config diagnostic
contextbook init                   # initialize .contextbook and learner memory
contextbook scan                   # scan project evidence
contextbook project                # inspect existing project memory
contextbook project --json         # inspect project memory as structured agent context
contextbook learner                # inspect learner memory
contextbook learner --json         # inspect learner memory as structured agent context
contextbook memory add-signal --type feedback.confused --concept "event loop" --note "too abstract"
contextbook memory capture-prompt --prompt "뭔소리야 너무 추상적임" --source manual
contextbook memory capture-prompt --prompt <text> --source manual --json
contextbook memory signals                     # inspect recent learner/conversation signals
contextbook memory signals --json              # inspect recent signals as structured agent context
contextbook memory suggest-weak-terms          # inspect weak-term review candidates
contextbook memory suggest-weak-terms --json   # inspect weak-term candidates as agent context
contextbook memory suggest-profile-updates     # inspect profile update candidates
contextbook memory suggest-profile-updates --json
contextbook memory apply-profile-update --candidate <id|index> --dry-run
contextbook memory apply-profile-update --candidate <id|index> --dry-run --json
contextbook memory apply-preference-signals --prompt <text> --dry-run
contextbook memory apply-preference-signals --prompt <text> --dry-run --json
contextbook memory preference-history [--json]
contextbook memory undo-preference-update --entry <id|index> --dry-run [--json]
contextbook memory undo-preference-update --entry <id|index> --yes [--json]
contextbook memory context                    # inspect bundled memory context
contextbook memory context --json             # one-shot agent context bundle
contextbook learn                  # generate 1-3 learning moments
contextbook why "<question>"       # answer a concept question with evidence level
contextbook profile                # view learner profile + conversation memory summary
contextbook profile diff           # view profile-related update history
contextbook profile edit           # open learner profile in $EDITOR
contextbook profile reset          # reset learner profile to default
```

## Adapter-ready core

The CLI is a thin adapter over the deterministic core. Future Codex/Claude adapters can import the same contract without scraping CLI output:

```ts
import {
  answerWhy,
  buildLearnerSummary,
  buildLearningMoments,
  buildMemoryContext,
  buildProjectSummary,
  profileUpdateCandidatesJson,
  applyProfileUpdateCandidate,
  scanProject,
  toLearnerSummaryJson,
  toProjectSummaryJson,
  weakTermSuggestionsJson
} from 'contextbook';

await scanProject({ root: process.cwd(), learner: 'default' });
const project = await buildProjectSummary({ root: process.cwd() });
const projectJson = toProjectSummaryJson(project);
const learner = await buildLearnerSummary('default');
const learnerJson = toLearnerSummaryJson(learner);
const suggestions = await weakTermSuggestionsJson('default');
const profileCandidates = await profileUpdateCandidatesJson('default');
// Preview/apply only after explicit user approval.
// await applyProfileUpdateCandidate({ candidateRef: profileCandidates.candidates[0].id, dryRun: true });
const memoryContext = await buildMemoryContext({ root: process.cwd(), learner: 'default' });
const learn = await buildLearningMoments({ root: process.cwd() });
const why = await answerWhy('cleanup 왜 해야 돼?', { root: process.cwd() });

console.log(project.markdown);
console.log(projectJson.topConcepts);
console.log(suggestions.candidates);
console.log(profileCandidates.candidates);
console.log(memoryContext.recommendedActions);
console.log(learn.markdown);
console.log(why.markdown);
```

## Scope of v0.1

Contextbook v0.1 intentionally does not include:

- web dashboard
- external LLM/API calls
- fully automatic personalization
- complex knowledge tracing
- perfect whole-codebase understanding
- team-shared learner memory

The goal of v0.1 is simple: scan a real project, find learning moments, explain them with visible evidence, keep local learning interactions inspectable, and make that flow easy to use from a CLI or coding agent.

## License

MIT
