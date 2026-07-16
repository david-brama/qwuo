## ADDED Requirements

### Requirement: Local session snapshot on disk
The system SHALL persist the live session to a local snapshot file on the host machine. The snapshot MUST include phase, current question index, next join order, and every participant's id, display name, join order, score, and per-question answer map.

#### Scenario: Snapshot after join
- **WHEN** a participant successfully joins
- **THEN** the snapshot on disk includes that participant with score 0 and an empty answer map

#### Scenario: Snapshot after answer
- **WHEN** a participant successfully submits an answer
- **THEN** the snapshot records their choice for that question index and their updated score

#### Scenario: Snapshot after advance
- **WHEN** the host successfully advances the phase
- **THEN** the snapshot records the new phase and question index

### Requirement: Restore session on process start
On process start, after the quiz is loaded, the system SHALL restore the live session from the snapshot when the file exists, is valid, and matches the loaded quiz identity. Restored state MUST preserve phase, question index, participants, scores, and answers.

#### Scenario: Restart mid-session
- **WHEN** the process starts with a valid matching snapshot from a session in QUESTION with participants and scores
- **THEN** the live session resumes at that phase with the same participants, scores, and answers

#### Scenario: Missing snapshot
- **WHEN** the process starts and no snapshot file exists
- **THEN** the system starts a new empty session in LOBBY

#### Scenario: Corrupt snapshot
- **WHEN** the process starts and the snapshot file is unreadable or invalid JSON
- **THEN** the system starts a new empty session in LOBBY and does not crash

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
The system SHALL support starting a fresh session that discards persisted participants and scores: (1) a boot-time configuration that ignores or deletes the snapshot, and (2) a projector-only reset action that clears the in-memory session to an empty LOBBY and removes the snapshot.

#### Scenario: Boot with fresh flag
- **WHEN** the process starts with the fresh-session configuration enabled
- **THEN** any existing snapshot is ignored or deleted and the session starts empty in LOBBY

#### Scenario: Host reset during run
- **WHEN** a valid reset request is made on the projector listener
- **THEN** the live session becomes empty LOBBY, the snapshot is cleared, and player-port reset is rejected

#### Scenario: Reset rejected on player port
- **WHEN** a reset request is made on the player listener
- **THEN** the system rejects it and neither session nor snapshot change
