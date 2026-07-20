## Why

Training banks (e.g. the 60-question CCAF quiz) carry rich per-question `metadata` (`domain`, `use-case`, `live`, `task-statement`, …), but the host can only run the full file. Operators need to start a session on a subset—one domain, several use-cases, or only `live: true` items—without hand-editing JSON. Filtering must accept **multiple** attribute constraints in one boot.

## What Changes

- Retain optional per-question `metadata` objects through `validateQuiz` / `loadQuiz` (today only quiz-root `metadata` is kept; question-level keys are dropped).
- Add startup filter options (CLI flags and/or env) so the host can select questions by metadata attributes before the session is created.
- Support **multiple filter entries** in one invocation (repeatable flag and/or multi-value env). Semantics: AND across different attribute keys; OR across multiple values for the same key (design locks exact matching rules).
- Metadata **keys and values may contain whitespace** (e.g. `domain=Tool Design & MCP Integration`). Filters must preserve internal spaces after parse; hosts MUST shell-quote CLI args and env assignments correctly so the shell does not split on spaces (or mishandle `&`).
- Apply the filter after successful load/validation and before session construct / fingerprint of the **playable** quiz used for the room.
- Fail fast with a clear error when filters are malformed or when the filtered set would be empty (no playable questions).
- Document options in README with **quoted examples** for spaced values; update schema notes for question-level `metadata`.
- No change to live phase machine, scoring rules, player/projector UI contracts, or tunnel start beyond using the filtered question list.

## Capabilities

### New Capabilities

- `question-filter`: Startup selection of quiz questions by per-question metadata attributes (multi-entry CLI/env, match semantics, empty-result failure).

### Modified Capabilities

- `quiz-config`: Per-question optional `metadata` object retained on load (same shape rules as quiz-root metadata); playable question list may be a filtered subset of the loaded file for the process lifetime.

## Impact

- `src/quiz.ts` — `Question.metadata`; validate/retain question metadata; pure filter helper.
- `src/config.ts` / `main.ts` — parse filter options; apply before `Session` / fingerprint path used for play.
- `quiz.schema.json` — optional `metadata` on questions.
- `deno.json` — allow any new env names in permissions.
- Tests: quiz load retention, filter match matrix, empty/malformed filter failures, boot still works with no filters.
- README configuration section.
- Session engine/persist/UI: only affected insofar as they already consume `quiz.questions`; no API shape change required if filter runs before session creation.
- Fingerprint/restore: design must state whether fingerprint is over filtered playable content or full file (restore safety).
