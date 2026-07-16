## Why

Live quiz sessions die when Deno restarts: all joins, answers, and scores live only in process memory. Hosts lose the room on crash, accidental stop, or laptop sleep kill — players must rejoin and scores reset mid-training. Local persistence on the host machine makes the ad-hoc session durable without accounts or cloud.

## What Changes

- Persist live session state to local disk on the host: phase, question index, participants (id, name, joinOrder, score, per-question answers).
- Restore that state on process start when a valid snapshot matches the loaded quiz.
- Write after state-changing events (join, answer, advance) so a restart recovers the latest room.
- Provide a clear way to start a fresh session (discard snapshot) for the next training run.
- Keep player reattach via browser-held participant id working across server restarts when the snapshot still holds that participant.
- No cloud sync, multi-room history store, auth, or analytics export in this change.

## Capabilities

### New Capabilities
- `session-persistence`: Local durable snapshot of the single live session (load, save, reset) on the host filesystem.

### Modified Capabilities
- `session-engine`: Session lifecycle includes hydrate-from-disk and durable writes; in-memory rules for join/answer/score/phase stay the same but survive process restart.
- `player-surface`: Reattach after server restart succeeds when the restored session still contains the stored participant id (stale-id clear path remains for missing participants).

## Impact

- **Code**: `src/session.ts` (serialize/hydrate hooks), new persistence module, `main.ts` (load on boot, wire reset), possibly `src/config.ts` (snapshot path env).
- **APIs**: Existing join/answer/state/advance behavior unchanged for happy path; optional host-facing reset (projector) or startup flag/env for fresh session.
- **Player UI**: Reattach path benefits; no new client storage beyond existing `ltq_participant_id`.
- **Deps**: Deno filesystem APIs only (no SQLite/cloud unless design later chooses otherwise).
- **Ops**: Snapshot file on host disk; privacy = laptop-local only; restart no longer wipes the room by default.
