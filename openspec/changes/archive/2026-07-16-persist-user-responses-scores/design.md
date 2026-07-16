## Context

qwuo runs a single live quiz session in Deno process memory (`Session` in `src/session.ts`). Participants, answers (`Map<questionIndex, choiceIndex>`), scores, phase, and question index vanish on restart. Player browsers only keep `ltq_participant_id` in localStorage; reattach works only while the process still holds that id. Original product non-goal was persistence; hosts now need crash/restart survival for ad-hoc training rooms without cloud accounts.

Constraints: single host laptop, no auth, max ~200 participants, Deno-only stack, keep join/answer/advance API shapes stable.

## Goals / Non-Goals

**Goals:**
- Survive Deno restart with same phase, scores, and answer maps.
- Players reattach with existing browser id after server restart when snapshot still has them.
- Explicit host path to start a clean room (wipe snapshot).
- Local host disk only; minimal new surface area.

**Non-Goals:**
- Multi-session history / analytics export / cloud backup.
- Multi-room concurrent sessions.
- Auth, encryption-at-rest beyond OS file permissions.
- Client-side answer/score cache as source of truth.
- Changing scoring rules, phase machine, or leaderboard order.

## Decisions

### 1. JSON snapshot file on host disk (not SQLite)

- **Choice**: Single JSON file (e.g. `.qwuo/session.json` or path from `SESSION_PATH` env) written via Deno FS.
- **Why**: One live session, small state, zero deps, easy inspect/debug. SQLite is overkill for ~200 rows of answers.
- **Alternatives**: SQLite (heavier), append-only log (harder hydrate), no file / only client (server remains truth today).

### 2. Snapshot content + quiz identity

- **Choice**: Persist `{ version, quizFingerprint, phase, questionIndex, nextJoinOrder, participants[] }` where each participant is `{ id, name, joinOrder, score, answers: Record<string, number> }` (question index keys as strings in JSON).
- **Quiz fingerprint**: hash or canonical identity of loaded quiz content/path (e.g. absolute path + mtime or content hash of `quiz.json`). On boot, load only if fingerprint matches current quiz; otherwise start fresh and optionally rename old file aside.
- **Why**: Prevents restoring answers against a different question set after host edits `quiz.json`.

### 3. Write triggers: after every mutating op

- **Choice**: Persist after successful `join`, `answer`, and `advance` (and after explicit reset). Synchronous await of write before returning response is preferred for durability over throughput.
- **Why**: Ad-hoc training; crash between mutations rare; correctness beats write batching. Cap is 200 players — write cost trivial.
- **Alternatives**: Debounced flush (risk last answer lost), write only on advance (loses mid-question answers).

### 4. Atomic replace writes

- **Choice**: Write temp file in same directory, then `rename` over the target (atomic on same volume).
- **Why**: Avoids half-written JSON on crash mid-write.

### 5. Hydrate at process start in `main.ts`

- **Choice**: After `loadQuiz`, try load snapshot → if valid + fingerprint match, construct `Session` from snapshot; else `new Session(quiz)`.
- **Why**: Single boot path; HTTP servers always see fully built session.

### 6. Fresh session / reset

- **Choice**: Two controls:
  1. Env/flag `SESSION_FRESH=1` (or CLI) deletes/ignores snapshot on boot.
  2. Projector-only `POST /api/reset` (or equivalent) clears in-memory session to LOBBY empty participants and deletes snapshot — for next training without process restart.
- **Why**: Hosts need both “clean start after restart” and “new class without killing Deno”.

### 7. No change to player storage model

- **Choice**: Keep `ltq_participant_id` only; server remains authority for score/answers. After restore, `GET /api/state?id=` rehydrates as today.
- **Why**: Already designed; persistence makes reattach work across process death without new client code beyond removing “process still running” assumption in docs/specs.

### 8. Module shape

- **Choice**: New `src/persist.ts` with `loadSnapshot(path)`, `saveSnapshot(path, state)`, `clearSnapshot(path)`, and pure `sessionToSnapshot` / `sessionFromSnapshot` helpers. `Session` stays domain logic; main/http wire persist callbacks.
- **Why**: Keep session engine testable without FS; match existing small-module style.

## Risks / Trade-offs

- **[Stale snapshot after quiz edit]** → Fingerprint mismatch → ignore snapshot, start fresh; log clear message.
- **[Corrupt JSON]** → Treat as missing; start fresh; do not crash boot.
- **[Disk full / permission error on save]** → Log error; keep serving in-memory; do not fail the player answer if possible (prefer durability but not room death). Document that last successful write is recovery point.
- **[Privacy: scores on disk]** → Host laptop only; document path; no network upload.
- **[Reset while players connected]** → Players with old ids reattach to empty session → treated as unknown id → existing clear-and-rejoin path.
- **[Trade-off: sync disk on every answer]** → Slight latency; acceptable at scale of room.

## Migration Plan

1. Ship code that loads if file exists, else creates empty session (backward compatible: no file = current behavior).
2. Default path under cwd or XDG-style local dir; document `SESSION_PATH` / `SESSION_FRESH`.
3. Rollback: delete snapshot module usage / delete file → pure in-memory again.
4. No data migration from prior versions (nothing persisted before).

## Open Questions

- Exact default path and env names (`SESSION_PATH`, `SESSION_FRESH`) — finalize in implementation to match `src/config.ts` style.
- Whether projector UI needs a visible “New session” button in v1 or flag-only is enough for first cut (spec allows projector reset API; UI can follow).
