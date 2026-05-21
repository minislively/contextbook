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
```

## MVP behavior

- Project memory: `.contextbook/`
- Learner memory: `~/.contextbook/learners/default/`
- Evidence levels: `direct`, `related`, `general`
- No external LLM/API key required in v0.1

## Example

```bash
contextbook init
contextbook scan
contextbook learn
contextbook why "useEffect cleanup 왜 필요해?"
```
