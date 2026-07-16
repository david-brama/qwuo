## 1. Snapshot model and FS module

- [x] 1.1 Add `src/persist.ts` with snapshot types, quiz fingerprint helper, `sessionToSnapshot` / `sessionFromSnapshot`
- [x] 1.2 Implement atomic `loadSnapshot` / `saveSnapshot` / `clearSnapshot` (temp file + rename)
- [x] 1.3 Handle missing, corrupt, and quiz-mismatch snapshots by returning empty/null (no throw on boot)

## 2. Config and session wiring

- [x] 2.1 Extend `src/config.ts` with `SESSION_PATH` and `SESSION_FRESH` (or equivalent names matching project style)
- [x] 2.2 Add Session hydrate constructor or factory from snapshot; export serializable state for persist
- [x] 2.3 Wire `main.ts`: load quiz → load/ignore snapshot → build Session → pass save callback into HTTP layer
- [x] 2.4 Persist after successful join, answer, and advance; log and continue on write failure

## 3. Fresh session / reset

- [x] 3.1 Honor boot-time fresh flag: ignore/delete snapshot, start empty LOBBY
- [x] 3.2 Add projector-only `POST /api/reset` that clears session to empty LOBBY and clears snapshot
- [x] 3.3 Reject reset on player port (same isolation pattern as advance)

## 4. Player reattach and docs

- [x] 4.1 Confirm player reattach path works with restored ids (no client change unless stale handling needs tweak)
- [x] 4.2 Update README: session survives restart, snapshot path, `SESSION_FRESH`, reset behavior

## 5. Tests

- [x] 5.1 Unit tests for serialize/hydrate round-trip (phase, scores, answers maps)
- [x] 5.2 Unit tests for fingerprint mismatch, corrupt file, atomic save load
- [x] 5.3 Integration-style tests: join/answer/advance → save → new Session from file matches; reset clears file
