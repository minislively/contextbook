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
