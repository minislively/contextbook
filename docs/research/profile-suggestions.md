# Profile Suggestions Research

Date: 2026-05-22
Status: accepted research brief for the next implementation PR
Scope: `suggestion-only` automation after Conversation Memory MVP

## Decision

The next automation step should be **suggestion generation**, not automatic personalization.

Recommended v0.2 command:

```bash
contextbook profile suggest
```

The command should read structured Conversation Memory events and produce profile-update candidates, but it must not edit `profile.md`, `preferences.json`, or `weak-terms.json` by itself.

This keeps the product promise moving toward personalization while preserving the v0.1 safety posture: local-first, inspectable, deterministic-first, and user-controlled.

## Product goal

Turn repeated learning interactions into explicit, reviewable suggestions such as:

```md
# Profile Suggestions

## 1. Explain cleanup with resource lifecycle first

Suggestion type: explanation-preference
Confidence: medium
Evidence level: repeated-related
Evidence:
- Asked about cleanup 2 times
- Recent direct project evidence: src/hooks/useWorkflowSSE.ts

Suggested profile note:
cleanup은 resource lifecycle / EventSource close 비유로 설명하면 이해가 빠름.

Action:
No files were changed. Copy this into profile.md if it feels right.
```

The key behavior is **candidate generation with evidence**, not mutation.

## Why suggestion-only first

### 1. Memory controls should stay visible to the user

Personalization systems are easier to trust when users can inspect and manage what is remembered. OpenAI's memory documentation emphasizes user control such as reviewing, deleting, and managing memories. Contextbook should apply the same product principle locally: suggestions should be visible before they become persistent learner profile state.

### 2. Data minimization matters even for local tools

Conversation Memory may contain learning signals that feel personal. The ICO's data-minimisation guidance says personal data should be adequate, relevant, and limited to what is necessary. For Contextbook, that means suggestions should be derived from minimal structured events rather than raw chat transcripts.

### 3. JSONL event logs are a good source, but not a source of truth about the person

JSON Lines supports append-only event records where each line is independently parseable. This is good for local audit trails, but events should be treated as evidence of interactions, not proof of ability or personality.

## Three-layer memory boundary

| Layer | Role | Used by profile suggestions? | Mutated by profile suggestions? |
| --- | --- | --- | --- |
| Project Memory | repo evidence, concepts, files | yes, for project evidence labels when available | no |
| Learner Memory | stable profile/preferences/weak terms | read only | no in v0.2 suggestion-only |
| Conversation Memory | append-only interaction events | primary input | append optional `profile-suggestion.generated` later, but no profile edits |

## Proposed CLI contract

### Command

```bash
contextbook profile suggest
```

Optional future flags, not required for first implementation:

```bash
contextbook profile suggest --json
contextbook profile suggest --limit 5
```

### Inputs

Read from the current learner directory:

```txt
~/.contextbook/learners/default/signals.jsonl
~/.contextbook/learners/default/answers.jsonl
~/.contextbook/learners/default/profile-updates.jsonl
~/.contextbook/learners/default/profile.md
~/.contextbook/learners/default/preferences.json
~/.contextbook/learners/default/weak-terms.json
```

Optionally read project concepts/evidence when inside an initialized project:

```txt
.contextbook/project/concepts.json
.contextbook/project/evidence.jsonl
```

### Output sections

```md
# Profile Suggestions

## Summary

- Suggestions: N
- Source events considered: N
- Files changed: none

## 1. <suggestion title>

Suggestion type: <explanation-preference|weak-term-focus|interview-practice|project-analogy>
Confidence: <low|medium|high>
Evidence level: <single-signal|repeated-related|repeated-direct>

Why this is suggested:
<short explanation grounded in events>

Evidence:
- <event or concept evidence>

Suggested profile note:
<copyable sentence>

Action:
No files were changed. Copy this into profile.md if it feels right.
```

### JSON output shape for future adapter use

```ts
type ProfileSuggestion = {
  schemaVersion: 1;
  kind: 'profile-suggestion';
  id: string;
  title: string;
  suggestionType:
    | 'explanation-preference'
    | 'weak-term-focus'
    | 'interview-practice'
    | 'project-analogy';
  confidence: 'low' | 'medium' | 'high';
  evidenceLevel: 'single-signal' | 'repeated-related' | 'repeated-direct';
  reason: string;
  suggestedProfileNote: string;
  evidence: Array<{
    source: 'conversation-memory' | 'weak-terms' | 'project-memory';
    signalType?: string;
    conceptLabel?: string;
    evidenceLevel?: 'direct' | 'related' | 'general';
    file?: string;
  }>;
};
```

## Deterministic-first heuristics

Use simple rules before any LLM-based approach is considered.

### Heuristic 1: repeated `why.answered` for same concept

Trigger:

- Same `conceptLabel` appears in `why.answered` at least 2 times, or
- `weak-terms.json` has `askedCount >= 2`.

Suggestion type:

```txt
weak-term-focus
```

Safe wording:

```txt
이 개념은 최근 반복해서 다뤄졌습니다. 다음 설명에서 더 먼저 연결하면 좋을 수 있습니다.
```

Unsafe wording to avoid:

```txt
사용자는 이 개념을 모릅니다.
```

### Heuristic 2: direct project evidence plus repeated question

Trigger:

- `why.answered` has `evidenceLevel: direct`, and
- matching concept appears more than once or exists in weak terms.

Suggestion type:

```txt
project-analogy
```

Example note:

```txt
cleanup은 이 프로젝트의 EventSource close / resource lifecycle 예시로 먼저 설명하면 좋음.
```

### Heuristic 3: repeated use of interview output

Trigger:

- Multiple `why.answered` events for concepts with generated interview sections.
- Future implementation can detect this indirectly through command usage, not raw transcript text.

Suggestion type:

```txt
interview-practice
```

Example note:

```txt
개념 설명 후 면접 문장으로 1문장 압축을 함께 제공하면 좋음.
```

### Heuristic 4: profile viewed after learning events

Trigger:

- Recent `learn.generated` or `why.answered` followed by `profile.viewed` or `profile.diff.viewed`.

Suggestion type:

```txt
explanation-preference
```

Use low confidence unless repeated.

## Confidence rules

| Confidence | Minimum evidence | Allowed wording |
| --- | --- | --- |
| low | one event or weak correlation | "후보", "가능성", "좋을 수 있음" |
| medium | repeated events for same concept or direct evidence + weak term | "반복 신호가 있음" |
| high | repeated direct evidence across sessions plus explicit profile action | still phrase as suggestion, not fact about the user |

For v0.2, prefer `low` and `medium`. `high` can exist in schema but should be rare.

## What must not drive suggestions

Do not generate suggestions from:

- raw chat transcripts;
- hidden agent prompts;
- a single frustrated phrase without repeated evidence;
- inferred age, seniority, personality, intelligence, or job level;
- secrets or environment values;
- project code snippets beyond file/concept evidence;
- team-shared data.

## Storage behavior

For the first implementation PR, `profile suggest` can be read-only.

Optional later event:

```json
{
  "schemaVersion": 1,
  "kind": "conversation-memory",
  "signalType": "profile-suggestion.generated",
  "command": "profile.suggest",
  "suggestionCount": 2
}
```

This event should only record that suggestions were generated, not the full suggestion text unless the user explicitly saves it.

## Tests for implementation PR

Add or update smoke tests to prove:

1. `contextbook profile suggest` runs with an empty learner store and prints "No suggestions yet".
2. Repeated `why` questions for the same concept produce a suggestion.
3. Suggestions include confidence and evidence level.
4. Suggestions do not modify `profile.md`, `preferences.json`, or `weak-terms.json`.
5. Suggestions do not include unsafe labels such as `beginner`, `low ability`, or `이해력이 낮`.
6. `--json` output, if implemented, matches the `ProfileSuggestion` schema.
7. `npm test` passes.
8. `npm pack --dry-run` still excludes private docs, `.omx`, and `.contextbook`.

## Implementation sketch for follow-up PR

Recommended files:

```txt
src/learner/profile-suggestions.ts
src/commands/profile.ts
src/types.ts
scripts/smoke-test.mjs
README.md
CHANGELOG.md
```

Suggested function boundaries:

```ts
readProfileSuggestionInputs(learner, root?)
buildProfileSuggestions(inputs): ProfileSuggestion[]
formatProfileSuggestionsMarkdown(suggestions): string
```

Do not add dependencies.

## Sources

- OpenAI Help, Memory FAQ: https://help.openai.com/en/articles/8590148-memory-faq
- OpenAI, How ChatGPT learns while protecting privacy: https://openai.com/index/how-chatgpt-protects-privacy/
- ICO, Data minimisation principle: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/the-principles/data-minimisation/
- JSON Lines format: https://jsonlines.org/
