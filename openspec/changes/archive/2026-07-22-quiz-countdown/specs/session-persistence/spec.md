## ADDED Requirements

### Requirement: Snapshot stores question countdown deadline
When the live session is in QUESTION with an active countdown, the system SHALL persist the absolute `questionDeadlineMs` (epoch milliseconds) in the local session snapshot together with phase and question index. When there is no active countdown, the snapshot MAY omit the field or store null. Restoring a snapshot MUST NOT require countdown fields on older snapshots.

#### Scenario: Mid-question deadline saved
- **WHEN** the session is in QUESTION with an active countdown deadline
- **AND** the system writes a snapshot
- **THEN** the snapshot includes that `questionDeadlineMs`

#### Scenario: Untimed question snapshot
- **WHEN** the session is in QUESTION without an active countdown
- **AND** the system writes a snapshot
- **THEN** the snapshot omits `questionDeadlineMs` or stores null

### Requirement: Restore resumes or completes QUESTION countdown
On process start, when restoring a snapshot whose phase is QUESTION:

- If `questionDeadlineMs` is present and still in the future, the system SHALL restore that deadline and schedule expiry for the remaining time.
- If `questionDeadlineMs` is present and already in the past, the system SHALL apply countdown expiry (advance out of QUESTION with the same scoring rules as a live expiry) before serving the room, or equivalently leave the session in the post-QUESTION state that expiry would have produced.
- If phase is QUESTION, an active effective countdown would apply, and the snapshot has no deadline field (legacy), the system SHALL start a new full countdown from restore time using the current effective duration.

#### Scenario: Restart with time remaining
- **WHEN** the process restores a QUESTION snapshot with `questionDeadlineMs` 20 seconds in the future
- **THEN** clients see an active countdown ending at that deadline
- **AND** expiry still advances out of QUESTION when that deadline is reached

#### Scenario: Restart after deadline passed
- **WHEN** the process restores a QUESTION snapshot with `questionDeadlineMs` in the past
- **THEN** the restored session is not left indefinitely in QUESTION waiting on a dead timer
- **AND** unanswered scoring for that question follows expiry/advance rules

#### Scenario: Legacy snapshot without deadline
- **WHEN** the process restores a QUESTION snapshot that lacks `questionDeadlineMs`
- **AND** the current question has an effective countdown greater than `0`
- **THEN** a new full countdown starts from restore time
