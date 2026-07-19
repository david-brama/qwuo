## Why

Quiz authors need a place for non-scoring, authoring-time data (source IDs, tags, difficulty, external links, CMS fields) without overloading `title`/`questions` or relying on undocumented extra keys that `validateQuiz` currently drops. An optional top-level `metadata` object makes that contract explicit and stable.

## What Changes

- Extend the quiz JSON schema and `validateQuiz` / `Quiz` type so the root MAY include an optional `metadata` field whose value is a JSON object with arbitrary properties (any JSON values nested under that object).
- Preserve `metadata` through load so callers and future surfaces can read it from the in-memory `Quiz`.
- Document validation rules: omit or null → no metadata; non-object (array, string, number, boolean) → validation failure.
- Keep gameplay, scoring, session phases, and player/projector UI unchanged for this change (metadata is carried, not rendered or acted on by default).
- Clarify fingerprinting: session restore continues to key off quiz content that affects play; metadata either is excluded from the fingerprint or included only if we decide restore should treat metadata edits as a quiz change (design will pick one and stick to it).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiz-config`: Add requirement that quiz root MAY include optional `metadata` as an arbitrary JSON object, loaded and retained with the quiz.

## Impact

- `quiz.schema.json` — declare optional `metadata` object (`additionalProperties` allowed under it).
- `src/quiz.ts` — `Quiz` type, `validateQuiz` acceptance/rejection and return value.
- Tests that construct or assert on `Quiz` / load paths (e.g. `persist_test.ts`, any quiz unit tests).
- `src/persist.ts` `quizFingerprint` — only if design includes metadata in the hash; otherwise no persist behavior change.
- Sample `quiz.json` — optional example only; not required for the change.
- No change required to session engine, player UI, or projector UI unless a later change consumes metadata.
