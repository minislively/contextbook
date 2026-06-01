# Contextbook Docs

Contextbook turns your codebase and learning conversations into a personalized knowledge book.

For the v0.1 launch, the public docs are intentionally small:

- [`../README.md`](../README.md) — install, setup, workflow, memory model, and commands
- [`PREFLIGHT.md`](./PREFLIGHT.md) — checks to run before `npm publish`
- [`releases/0.1.0.md`](./releases/0.1.0.md) — release notes for the MVP launch

## Public/private boundary

Public docs should describe how to install, run, verify, and safely understand Contextbook. Internal planning and research stay local-only under `docs/private/` and are excluded from git/npm publication.

Do publish:

- root `README.md`
- `CHANGELOG.md`
- `docs/README.md`
- `docs/PREFLIGHT.md`
- `docs/releases/`

Do not publish:

- `docs/private/`
- `.omx/`
- `.contextbook/`
- personal learner memory under `~/.contextbook/`
