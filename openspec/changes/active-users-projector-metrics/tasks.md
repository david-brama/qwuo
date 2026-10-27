## 1. Session engagement metrics

- [x] 1.1 Add pure helpers in `src/session.ts` for engagement window indices from phase / `questionIndex` / `questionCount` (LOBBY empty, END = last index, question cycle = current index, max width 4)
- [x] 1.2 Implement active-user predicate: participant is active iff ≥2 recorded answers in the window (correct or incorrect)
- [x] 1.3 Compute `activeUserCount` and `activeAnsweredCount` and include both on `projectorState()`; keep `playerState()` unchanged
- [x] 1.4 Unit tests in `src/session_test.ts` covering: short window / Q0 never active, 2-of-4 active, incorrect counts, non-active excluded from answered count, LOBBY zeros, END window, answer then re-read state, reset clears metrics

## 2. Projector UI

- [x] 2.1 Show `activeUserCount` in projector chrome (status / lobby summary), labeled distinctly from joined `participantCount`
- [x] 2.2 On QUESTION, CORRECT, and EXPLAIN, show active answered progress from `activeAnsweredCount` / `activeUserCount` (e.g. `K / N active answered`)
- [x] 2.3 Ensure polled state updates refresh both numbers; hide current-question active-answered line in LOBBY
- [x] 2.4 Minimal styles in `src/styles.ts` if needed for readability on projector

## 3. Verification

- [x] 3.1 Run session (and any related) tests and fix regressions
- [x] 3.2 Smoke-check projector HTML/state shape manually or via existing HTTP tests if present for `projectorState` fields
