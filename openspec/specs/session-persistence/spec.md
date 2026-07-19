## Purpose

Local session snapshot persistence, restore on process start, and fresh-session controls. TBD.

## Requirements

### Requirement: Local session snapshot on disk
The system SHALL persist the live session to a local snapshot file on the host machine whose **filename stem is the session UUID** (`{sessionsDir}/{sessionId}.json`). The snapshot MUST include phase, current question index, next join order, every participant's id, display name, join order, score, and per-question answer map, and the session's effective per-question choice order with remapped correct indices.

#### Scenario: Snapshot path uses session id
- **WHEN** the system saves the live session with id `{sessionId}`
- **THEN** the snapshot is written to `{sessionsDir}/{sessionId}.json`

#### Scenario: Snapshot after join
- **WHEN** a participant successfully joins
- **THEN** the snapshot on disk includes that participant with score 0 and an empty answer map

#### Scenario: Snapshot after answer
- **WHEN** a participant successfully submits an answer
- **THEN** the snapshot records their choice for that question index and their updated score

#### Scenario: Snapshot after advance
- **WHEN** the host successfully advances the phase
- **THEN** the snapshot records the new phase and question index

#### Scenario: Snapshot includes effective choices
- **WHEN** the system saves a live session after creation
- **THEN** the snapshot includes effective `choices` and `correct` for each question used for play

### Requirement: Restore session on process start
On process start, after the quiz is loaded, the system SHALL resolve the active session id (pointer file and/or configuration), then restore from `{sessionsDir}/{sessionId}.json` when the file exists, is valid, matches the loaded quiz identity, and includes a usable effective choice order for the snapshot format. Restored state MUST preserve phase, question index, participants, scores, answers, effective choice order, and MUST keep the same session id for path routing.

#### Scenario: Restart mid-session
- **WHEN** the process starts with a valid matching snapshot for the active session id from a session in QUESTION with participants and scores
- **THEN** the live session resumes at that phase with the same participants, scores, answers, effective choice order, and the same session id

#### Scenario: Missing snapshot
- **WHEN** the process starts and no snapshot file exists for the active session id
- **THEN** the system starts a new empty session in LOBBY (minting a new session id if none was configured)

#### Scenario: Corrupt snapshot
- **WHEN** the process starts and the snapshot file is unreadable or invalid JSON
- **THEN** the system starts a new empty session in LOBBY and does not crash

### Requirement: Snapshot retains effective choice order
The session snapshot MUST include the session's effective per-question choice order and remapped correct indices used for play. On restore with a matching quiz identity, the system SHALL rebuild the live session with that same effective order so existing answer indices and correct highlighting remain valid. A snapshot that lacks a usable effective choice order for the current snapshot format MUST NOT be applied as a partial restore of participants/answers under a newly shuffled order.

#### Scenario: Round-trip preserves order and answers
- **WHEN** participants have answered using effective choice indices
- **AND** the process saves a snapshot and later restores it with the same loaded quiz identity
- **THEN** the restored session exposes the same effective choices and correct indices
- **AND** each participant's recorded answers and scores are unchanged

#### Scenario: Restore rejects unusable order payload
- **WHEN** the process starts with a snapshot whose effective choice order is missing or incompatible with the snapshot format/version
- **THEN** the system does not restore participants/answers onto a freshly shuffled order
- **AND** starts a new empty LOBBY session (same class of outcome as an invalid snapshot)

### Requirement: Quiz identity guard
The system SHALL refuse to restore a snapshot whose quiz identity does not match the currently loaded quiz. On mismatch, the system MUST start a new empty session in LOBBY.

#### Scenario: Quiz content changed
- **WHEN** the process starts with a snapshot whose quiz identity differs from the loaded quiz
- **THEN** the snapshot is not applied and a new empty LOBBY session is used

### Requirement: Atomic snapshot writes
The system SHALL write snapshots in a way that avoids leaving a truncated target file after a crash mid-write (write-then-replace or equivalent).

#### Scenario: Crash during write
- **WHEN** a write is interrupted after the previous successful snapshot existed
- **THEN** a subsequent start either restores the previous complete snapshot or starts empty if no complete snapshot remains — never a partially parsed corrupt half-file as the only option without recovery path

### Requirement: Fresh session controls
The system SHALL support starting a fresh session that discards persisted participants and scores: (1) a boot-time configuration that ignores or deletes the active session snapshot, and (2) a projector-only reset action under `/s/{sessionId}/api/reset` that clears the in-memory session to an empty LOBBY and removes that session's snapshot file while **keeping the same session id** so existing join URLs remain valid.

#### Scenario: Boot with fresh flag
- **WHEN** the process starts with the fresh-session configuration enabled
- **THEN** any existing snapshot for the active session is ignored or deleted and the session starts empty in LOBBY

#### Scenario: Host reset during run
- **WHEN** a valid reset request is made on the projector listener for the active session path
- **THEN** the live session becomes empty LOBBY, the snapshot file for that session id is cleared, the session id is unchanged, and player-port reset is rejected

#### Scenario: Reset rejected on player port
- **WHEN** a reset request is made on the player listener
- **THEN** the system rejects it and neither session nor snapshot change
