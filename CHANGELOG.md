# Changelog

## 0.1.0 - 2026-05-22

Initial MVP release.

### Added

- Global `contextbook` CLI.
- Project initialization with `.contextbook/` project memory.
- Learner memory under `~/.contextbook/learners/default/`.
- Project scanner for package, docs, diff, file/function names, imports, and keyword signals.
- Project scan provenance in `.contextbook/project/scan-runs.jsonl`.
- `contextbook learn` daily learning card with 1-3 project-grounded learning moments.
- `contextbook why "<question>"` fixed-format concept explanation.
- Evidence levels: `direct`, `related`, and `general`.
- Learner profile commands: `profile`, `profile diff`, `profile edit`, `profile reset`.
- Structured Conversation Memory events for `scan`, `learn`, `why`, and `profile` flows.
- Conversation Memory summary in `contextbook profile`.
- `contextbook setup` for explicit Codex/OMX and Claude Code helper installation.
- Advanced platform install commands for Codex and Claude Code.
- Adapter-ready core exports for `scanProject`, `buildLearningMoments`, and `answerWhy`.

### Safety

- No external LLM/API key required in v0.1.
- Personal learner memory is stored outside the repo.
- Installer supports `--dry-run`, skips identical files, and backs up changed files before overwrite.
- Hidden/runtime directories are ignored by the scanner by default.
