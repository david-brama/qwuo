## MODIFIED Requirements

### Requirement: Session phase machine
The system SHALL drive a single live session through phases: LOBBY, QUESTION, CORRECT, EXPLAIN, LEADERBOARD, and END. The host advances phases only via the projector advance action. The live session MAY be restored from a local snapshot on process start; while running, phase transitions follow the same machine whether the session was freshly created or restored.

#### Scenario: Start from lobby
- **WHEN** the session is in LOBBY and the host advances
- **THEN** the session enters QUESTION for the first question

#### Scenario: Full question cycle
- **WHEN** the session is in QUESTION and the host advances repeatedly
- **THEN** the session moves QUESTION → CORRECT → EXPLAIN → LEADERBOARD

#### Scenario: Next question after leaderboard
- **WHEN** the session is in LEADERBOARD for a question that is not the last
- **AND** the host advances
- **THEN** the session enters QUESTION for the next question index

#### Scenario: End after last leaderboard
- **WHEN** the session is in LEADERBOARD for the last question
- **AND** the host advances
- **THEN** the session enters END

#### Scenario: Restored mid-cycle continues machine
- **WHEN** the process restores a session that was in EXPLAIN for question index N
- **AND** the host advances
- **THEN** the session enters LEADERBOARD for question index N

## ADDED Requirements

### Requirement: Mutating operations leave durable state
After a successful join, answer, or advance, the system SHALL update durable local state so a subsequent process restart can restore that outcome. Scoring and phase rules remain as defined by other session-engine requirements.

#### Scenario: Answer survives restart
- **WHEN** a participant answers correctly and the process restarts with a matching snapshot
- **THEN** that participant still has the recorded answer and the increased score

#### Scenario: Phase survives restart
- **WHEN** the host advances to LEADERBOARD and the process restarts with a matching snapshot
- **THEN** the session is in LEADERBOARD at the same question index
