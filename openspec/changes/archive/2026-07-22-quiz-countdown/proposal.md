## Why

Live training quizzes are host-paced today (“no timers”), but many rooms need a visible per-question countdown so players feel urgency and the host does not have to watch the clock. Authors need one quiz-wide default duration plus the ability to give harder or discussion questions a different limit without duplicating config on every item.

## What Changes

- Add optional quiz-root **`config.countdownSeconds`**: non-negative integer default seconds for the QUESTION phase when a question does not set its own value.
- Add optional per-question **`countdownSeconds`**: non-negative integer that overrides the quiz default for that question only.
- Update **`quiz.schema.json`** and runtime validation (`validateQuiz` / load types) so both fields are documented and enforced (integer ≥ 0; reject non-integers / negatives / non-numbers).
- Resolve effective countdown at session time: question override if present, else quiz default, else **no countdown** (current host-only pacing).
- When effective countdown is **> 0**, start a server-authoritative timer on entry to QUESTION; expose remaining/end time on projector and player state; show a countdown UI on both surfaces.
- When the timer reaches zero while still in QUESTION, the session **auto-advances** out of QUESTION (same scoring rules as host Next: unanswered score 0). Host Next/Back remain available and supersede the timer as today.
- Effective `0` (explicit on question or as quiz default with no override) means **no countdown** for that question (not a zero-second auto-skip).
- Keep countdown fields out of the quiz identity fingerprint (presentation/pacing config, same policy as other `config` / non-scoring authoring).
- Update sample `quiz.json` and README (replace “No timers” with the new optional model).

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `quiz-config`: Optional root `config.countdownSeconds` and per-question `countdownSeconds`; load/validate rules; resolution semantics; fingerprint exclusion.
- `session-engine`: Server-authoritative QUESTION countdown from effective seconds; state fields for clients; auto-advance on expiry; interaction with host advance.
- `session-persistence`: Snapshot/restore of question deadline so mid-QUESTION restarts keep a coherent timer.
- `projector-surface`: Display countdown during QUESTION when active.
- `player-surface`: Display countdown during QUESTION when active (answer pad still works until expiry or answer).

## Impact

- `quiz.schema.json` — `config.countdownSeconds`; question `countdownSeconds`.
- `src/quiz.ts` — types, `parseQuizConfig`, question parse/validate; helper to resolve effective seconds.
- `src/session.ts` — timer start on QUESTION entry; tick/expiry → advance; projector/player payloads; snapshot fields if needed for restore mid-question.
- `src/persist.ts` (+ snapshot shape) — restore enough timer state so mid-QUESTION restart does not reset or desync the countdown incorrectly.
- `src/projector_ui.ts`, `src/player_ui.ts` (+ styles) — countdown display synced from server state.
- `quiz.json`, README — sample default + docs.
- Tests: `quiz_test.ts`, `session_test.ts`, UI/HTTP as needed.
- No change to scoring formula (+1 correct); no accounts; no mandatory timers on every quiz.
