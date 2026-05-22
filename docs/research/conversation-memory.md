# Conversation Memory MVP Research

Date: 2026-05-22
Status: accepted for v0.1 implementation

## Decision

Contextbook should make Conversation Memory explicit in v0.1, but keep it small:

- Store structured, append-only interaction events under the existing learner memory directory.
- Reuse `signals.jsonl`, `answers.jsonl`, and `profile-updates.jsonl` instead of adding a fourth storage root.
- Add a typed `conversation-memory` schema and recording helpers so future Codex/Claude adapters call the same contract.
- Expose a short Conversation Memory summary in `contextbook profile`.
- Do not mutate `profile.md` or `preferences.json` automatically from these events.

This closes the gap between the PRD's three-memory model and the current implementation without adding dependencies, external LLM APIs, or hidden personalization.

## Why this shape

### 1. Keep Conversation Memory distinct from the other memories

| Memory | Question it answers | Storage | v0.1 behavior |
| --- | --- | --- | --- |
| Project Memory | "What evidence exists in this repo?" | `.contextbook/project/*` | deterministic scan results and concept evidence |
| Learner Memory | "How should this learner be explained to?" | `~/.contextbook/learners/<user>/profile.md`, `preferences.json`, `weak-terms.json` | stable profile/preferences/weak-term state |
| Conversation Memory | "What learning interactions happened?" | `~/.contextbook/learners/<user>/*.jsonl` | append-only events from `scan`, `learn`, `why`, and `profile` |

Conversation Memory is the raw event layer. Learner Memory may later be updated from it, but v0.1 only records and displays it.

### 2. Append-only JSONL fits the product constraints

Contextbook needs local, inspectable, migration-light memory. JSON Lines fits because each record is a single JSON value on its own line, so commands can append events without rewriting the whole file. This also matches the event-log idea: keep a history of what happened, then derive summaries later instead of pretending the latest profile is the whole story.

### 3. Data minimization is a product requirement

Learning memory can become sensitive if it stores too much. The v0.1 schema records only fields needed for the stated purpose: command, signal type, concept/question, evidence level, small metadata, and timestamp. It avoids raw chat transcripts and user judgments. This follows the data-minimization principle: collect enough for the purpose, but no more.

## v0.1 event schema

Every new Conversation Memory event should include:

```ts
type ConversationMemoryEvent = {
  schemaVersion: 1;
  kind: 'conversation-memory';
  signalType:
    | 'scan.completed'
    | 'learn.generated'
    | 'why.answered'
    | 'profile.viewed'
    | 'profile.diff.viewed'
    | 'profile.edit.path-shown'
    | 'profile.edited'
    | 'profile.reset';
  type?: string; // backward-compatible alias for v0.1 JSONL readers
  command: 'scan' | 'learn' | 'why' | 'profile' | 'profile.diff' | 'profile.edit' | 'profile.reset';
  learner: string;
  question?: string; // trimmed and length-limited; no full transcript
  conceptId?: string;
  conceptLabel?: string;
  concept?: string; // backward-compatible alias for answer readers
  evidenceLevel?: 'direct' | 'related' | 'general';
  evidenceFiles?: string[];
  conceptCount?: number;
  metadata?: Record<string, string | number | boolean | null>;
  recordedAt?: string;
};
```

## What to record

- `scan.completed`: concept/evidence counts and changed-file count.
- `learn.generated`: number of learning moments and the top concept when present.
- `why.answered`: the user's concept question, matched concept, evidence level, and evidence files.
- `profile.viewed`: the profile was inspected.
- `profile.diff.viewed`: the default/current profile diff was inspected.
- `profile.edit.path-shown`: the user asked to edit but no editor was configured.
- `profile.edited`: a profile edit command succeeded.
- `profile.reset`: the profile was reset and backups were created.

## What never to store in v0.1

- Full raw chat transcripts.
- Hidden agent prompts or external coding-session content.
- Secrets, tokens, environment dumps, or full code snippets.
- User ability/personality labels such as "beginner", "low ability", or "understands poorly".
- Automatic profile/preference updates inferred from one event.
- Team-shared learner memory.

## Implementation acceptance criteria

- `src/learner/conversation-memory.ts` owns event creation, sanitization, recording, and profile summary formatting.
- Existing `signals.jsonl`, `answers.jsonl`, and `profile-updates.jsonl` remain readable; new records add `schemaVersion: 1` and `kind: 'conversation-memory'` while keeping legacy aliases where useful.
- `learn`, `why`, `scan`, and `profile*` flows record structured events.
- `contextbook profile` shows a Conversation Memory section with storage paths, event counts, safety boundaries, and recent events.
- Smoke tests assert structured events, profile inspectability, project/learner memory separation, and absence of unsafe learner judgment strings.
- `npm test` passes.
- `npm pack --dry-run` excludes private docs, `.omx`, and `.contextbook`.

## Sources

- ICO, Data minimisation principle: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/the-principles/data-minimisation/
- Martin Fowler, Event Sourcing: https://martinfowler.com/eaaDev/EventSourcing.html
- JSON Lines format: https://jsonlines.org/
- OpenAI Help, Memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
