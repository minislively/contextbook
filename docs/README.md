# Contextbook Docs

Welcome. Contextbook helps you turn real project work into concepts you can explain.

If you just want to try it, start here:

```bash
npm install -g contextbook
contextbook setup
contextbook init
contextbook scan
contextbook learn
contextbook why "why does cleanup matter?"
```

## What to read first

| If you want to... | Read this |
| --- | --- |
| Understand the product and commands | [`../README.md`](../README.md) |
| Prepare for npm publishing | [`PREFLIGHT.md`](./PREFLIGHT.md) |
| See what v0.1 includes | [`releases/0.1.0.md`](./releases/0.1.0.md) |

## The short version

Contextbook keeps three kinds of memory separate:

1. **Project Memory** — facts found in the current repo, stored in `.contextbook/`.
2. **Learner Memory** — your learning preferences and weak terms, stored outside the repo in `~/.contextbook/`.
3. **Conversation Memory** — small structured learning events, not a raw chat transcript.

That separation is the safety model: project facts stay with the project; personal learning data stays with the learner; internal planning docs stay out of the package.

## Public/private boundary

Public docs are for users. They explain install, setup, workflow, safety, and release checks.

Internal planning/research docs stay local-only under `docs/private/` and are excluded from git/npm publication.

Public:

- root `README.md`
- `CHANGELOG.md`
- `docs/README.md`
- `docs/PREFLIGHT.md`
- `docs/releases/`

Private/local-only:

- `docs/private/`
- `.omx/`
- `.contextbook/`
- personal learner memory under `~/.contextbook/`
