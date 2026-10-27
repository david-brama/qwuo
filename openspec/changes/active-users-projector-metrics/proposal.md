## Why

The projector already shows how many participants joined, but joins alone do not tell the host who is still engaged. During a live training session the host needs a clearer pulse: how many people are actively answering, and how many of those active people have responded to the current question so the host knows when to advance.

## What Changes

- Define **active user** for a live session: a participant who has **answered at least two of the last four questions** (correct or incorrect both count; unanswered does not).
- Compute this metric on the session from existing per-participant answer maps (no new client reporting).
- Expose **active user count** on projector state and **display it on the projector UI**.
- For the current question (when one is shown), expose and **display how many active users have already answered that question**.
- Player surface does not need these metrics; host-only projector concern.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `session-engine`: Define and compute active-user engagement from answer history over a rolling last-four-questions window; include counts on host projector state.
- `projector-surface`: Show active user count on the projector, and on each question show how many of those active users have already answered it.

## Impact

- `src/session.ts` — pure helpers + fields on `projectorState()` (`activeUserCount`, and per-current-question answered-among-active count).
- `src/projector_ui.ts` (+ styles if needed) — status/chrome and question-phase display for the two numbers.
- Tests: `src/session_test.ts` (and projector/HTTP state shape if covered) for window edge cases (fewer than four questions, ties on correct/incorrect, late joiners).
- No persistence schema change required if metrics are derived from existing answer maps on every state read.
- No player API or quiz file format changes.
