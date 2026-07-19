## Why

Quiz authors often write the correct choice first (or in a fixed authoring order), so live players can learn position patterns instead of reading the options. Randomizing choice order per session removes that cue while keeping scoring and host/player views aligned.

## What Changes

- When a live session is created (or reset to a fresh lobby), the system shuffles each question’s `choices` array and remaps `correct` to the new index so gameplay still scores against the right answer.
- Player and projector surfaces show the same shuffled order for a given session (shared room truth, not per-device shuffle).
- Answer submission and stored answers continue to use the **display** choice index for that session; scoring compares against the remapped correct index.
- Session restore after process restart MUST restore the same choice order used during play so recorded answers and correct highlights stay valid.
- Authoring file (`quiz.json`) order remains the source of truth on disk; shuffle is a runtime/session concern, not a rewrite of the quiz file.
- No change to phase machine, join rules, or scoring rules beyond using the session’s effective choice order.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiz-config`: Clarify that on-disk `choices` / `correct` are the canonical authoring order; runtime presentation may reorder choices without changing the file.
- `session-engine`: Session holds an effective per-question choice order (shuffled at session start/reset); answer validation and projector/player state expose that order; host and players share one order.
- `session-persistence`: Snapshots retain enough data to restore the session’s effective choice order (not only phase/scores), so restart mid-session does not reshuffle under existing answers.
- `player-surface`: Answer pad renders choices in the session’s effective order (already driven by API state; requirement updated to make order contract explicit).
- `projector-surface`: QUESTION/CORRECT choice lists use the same session effective order and correct index as players.

## Impact

- `src/session.ts` — shuffle on construct/reset; include effective quiz/order in hydrate; `answer` / state builders use shuffled questions.
- `src/persist.ts` — snapshot/hydrate carry effective choice order (or equivalent permutation); fingerprint stays tied to **canonical** loaded quiz content so a reshuffle alone does not look like a different quiz file.
- `src/quiz.ts` — possible pure helper to shuffle a question’s choices + remap `correct` (unit-tested); load/validate schema unchanged for required fields.
- `src/player_ui.ts` / `src/projector_ui.ts` — no structural change if they already render `state.question.choices` and `correct` from the API; verify feedback/highlight still match.
- Tests: `quiz_test.ts`, session/persist tests for shuffle stability, scoring after shuffle, and restore-with-same-order.
- `quiz.schema.json` / sample `quiz.json` — no required authoring changes.
