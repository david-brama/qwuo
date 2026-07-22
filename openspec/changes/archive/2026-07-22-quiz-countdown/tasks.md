## 1. Schema and quiz load

- [x] 1.1 Add `config.countdownSeconds` and per-question `countdownSeconds` to `quiz.schema.json` (integer, minimum 0) with descriptions for default/override/`0` = disabled
- [x] 1.2 Extend `QuizConfig` and `Question` types in `src/quiz.ts`; parse/validate both fields in `parseQuizConfig` and question validation (integer ≥ 0; null → unset; reject floats/strings/negatives)
- [x] 1.3 Export `effectiveCountdownSeconds(quiz, question)` helper implementing override → default → unset resolution
- [x] 1.4 Ensure `quizFingerprint` excludes config and per-question `countdownSeconds`
- [x] 1.5 Add/extend `quiz_test.ts` (and fingerprint cases in `persist_test.ts` if needed) for load, reject, resolution, and fingerprint scenarios

## 2. Session countdown engine

- [x] 2.1 Track `questionDeadlineMs` / generation token on `Session`; start or clear deadline on every enter/leave of QUESTION (`advance`, `back`, soft reset)
- [x] 2.2 Schedule server timeout for active deadlines; on fire, auto-advance QUESTION→CORRECT once if still the same generation; cancel on leave
- [x] 2.3 Expose `countdown: { totalSeconds, deadlineMs } | null` on `projectorState` and `playerState` only during active QUESTION countdown
- [x] 2.4 Wire durable-save hook (or equivalent) so auto-advance persists without requiring host Next
- [x] 2.5 Add `session_test.ts` coverage: start deadline, override vs default, expiry advance + unanswered scoring, host advance cancels timer, Back restarts full timer, stale timeout no-op

## 3. Persistence

- [x] 3.1 Include optional `questionDeadlineMs` in snapshot/hydrate (`sessionToSnapshot` / restore path)
- [x] 3.2 On restore in QUESTION: future deadline → reschedule; past deadline → apply expiry; missing deadline + effective > 0 → new full countdown from now
- [x] 3.3 Add `persist_test.ts` round-trips for deadline save/restore and overdue/legacy cases

## 4. Projector and player UI

- [x] 4.1 Projector: render remaining whole seconds from `deadlineMs` during QUESTION; hide otherwise; update between polls; reflect auto-advance on next poll
- [x] 4.2 Player: same countdown display with answer pad; hide when untimed or non-QUESTION
- [x] 4.3 Minimal styles for readable countdown (optional urgency under ~5s without color-only meaning)

## 5. Sample content and docs

- [x] 5.1 Set a sensible `config.countdownSeconds` on sample `quiz.json`; optionally override one question
- [x] 5.2 Update README: replace “No timers” with optional default/override model and resolution notes
- [x] 5.3 Run full test suite and fix regressions
