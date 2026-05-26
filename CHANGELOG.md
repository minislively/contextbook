# Changelog

## 0.1.0 - 2026-05-22

Initial MVP release.

### Added

- Global `contextbook` CLI.
- Project initialization with `.contextbook/` project memory.
- Learner memory under `~/.contextbook/learners/default/`.
- Project scanner for package, docs, diff, file/function names, imports, and keyword signals.
- Project file index snapshot in `.contextbook/project/file-index.json`.
- Project scan provenance in `.contextbook/project/scan-runs.jsonl`.
- `contextbook project` read-only Project Memory summary with file status, top concepts, recent scan runs, and next action hints.
- `contextbook project --json` for AI/agent-readable Project Memory with safety flags and recommended actions.
- `contextbook learner` read-only Learner Memory summary with preferences, weak terms, recent signals, and next action hints.
- `contextbook learner --json` for AI/agent-readable Learner Memory with safety flags and recommended actions.
- `contextbook memory add-signal` for explicit append-only learner/conversation feedback signals.
- `contextbook memory capture-prompt --prompt <text> [--source manual|codex|claude-code] [--json]` for deterministic, hook-ready explicit prompt signal capture.
- `contextbook memory signals` and `contextbook memory signals --json` for recent signal inspection.
- `contextbook memory suggest-weak-terms` and `--json` for suggestion-only weak-term review candidates from learner signals.
- `contextbook memory suggest-profile-updates` and `--json` for suggestion-only learner profile update candidates from explicit signals.
- `contextbook memory apply-profile-update --candidate <id|index> [--dry-run] [--json]` for explicit, audited, preferences-only profile update application.
- `contextbook memory context` and `--json` for a read-only AI context bundle across project, learner, signals, suggestions, freshness, and safety.
- `contextbook learn` daily learning card with 1-3 project-grounded learning moments and deterministic recommendation reasons.
- `contextbook why "<question>"` fixed-format concept explanation.
- Evidence levels: `direct`, `related`, and `general`.
- Learner profile commands: `profile`, `profile diff`, `profile edit`, `profile reset`.
- Structured Conversation Memory events for `scan`, `learn`, `why`, and `profile` flows.
- Conversation Memory summary in `contextbook profile`.
- `contextbook setup` for explicit Codex/OMX and Claude Code helper installation.
- `contextbook setup --hooks` and `contextbook install <target> --hooks` for opt-in Codex/Claude Code `UserPromptSubmit` hook helper files that call deterministic prompt signal capture.
- Advanced platform install commands for Codex and Claude Code.
- Adapter-ready core exports for `scanProject`, `buildProjectSummary`, `toProjectSummaryJson`, `buildLearnerSummary`, `toLearnerSummaryJson`, `buildLearningMoments`, and `answerWhy`.
- Adapter-ready weak-term suggestion exports for `weakTermSuggestionsJson` and `buildWeakTermSuggestions`.
- Adapter-ready profile update candidate exports for `profileUpdateCandidatesJson` and `buildProfileUpdateCandidates`.
- Adapter-ready memory context export for `buildMemoryContext`.

### Safety

- No external LLM/API key required in v0.1.
- Personal learner memory is stored outside the repo.
- Installer supports `--dry-run`, skips identical files, and backs up changed files before overwrite.
- Hidden/runtime directories are ignored by the scanner by default.
