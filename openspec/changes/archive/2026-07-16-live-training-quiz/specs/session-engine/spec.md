## ADDED Requirements

### Requirement: Session phase machine
The system SHALL drive a single in-memory session through phases: LOBBY, QUESTION, CORRECT, EXPLAIN, LEADERBOARD, and END. The host advances phases only via the projector advance action.

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

### Requirement: Participants join by name only
The system SHALL allow a participant to join by submitting a display name without authentication. The system SHALL assign a stable opaque participant id. Duplicate display names MUST be allowed.

#### Scenario: Join with name
- **WHEN** a client submits a non-empty display name
- **THEN** the system creates a participant with score 0 and returns the participant id and name

#### Scenario: Duplicate names
- **WHEN** two clients join with the same display name
- **THEN** both are accepted as separate participants with distinct ids

### Requirement: Late join
The system SHALL allow join after the session has left LOBBY. Late joiners start with score 0 and receive no credit for questions already completed.

#### Scenario: Join during an active question
- **WHEN** a participant joins while the session is past LOBBY
- **THEN** their score is 0 and they may answer only the current question if the phase is QUESTION and they have not yet answered it

### Requirement: One answer per question with immediate scoring
While the phase is QUESTION, a participant who has not yet answered the current question MAY submit a choice index once. The system SHALL record the answer, award +1 if the choice equals the question's correct index (else +0), and return whether the answer was correct and the correct index. After answering, further answers for that question MUST be rejected.

#### Scenario: Correct answer
- **WHEN** a participant submits the correct choice index during QUESTION
- **THEN** their score increases by 1 and the response indicates correct

#### Scenario: Incorrect answer
- **WHEN** a participant submits an incorrect choice index during QUESTION
- **THEN** their score is unchanged and the response indicates incorrect and includes the correct index

#### Scenario: Double submit
- **WHEN** a participant who already answered the current question submits again
- **THEN** the system rejects the submission and does not change the score

#### Scenario: Answer outside QUESTION phase
- **WHEN** a participant submits an answer while phase is not QUESTION
- **THEN** the system rejects the submission

### Requirement: Unanswered questions score zero
When the host advances out of QUESTION, any participant who has not answered the current question SHALL receive 0 points for that question (no later answer opportunity for that question).

#### Scenario: Host advances before all answer
- **WHEN** the phase leaves QUESTION
- **AND** a participant has no recorded answer for that question
- **THEN** that participant's score does not increase for that question

### Requirement: Leaderboard ordering
The system SHALL compute leaderboard rankings as total score descending, with ties broken by earlier join order.

#### Scenario: Ranking by score
- **WHEN** participants have different scores
- **THEN** higher scores appear before lower scores

#### Scenario: Tie break
- **WHEN** two participants have the same score
- **THEN** the one who joined earlier ranks higher

### Requirement: Advance restricted to projector
The system SHALL accept phase advance only on the projector HTTP listener, not on the player HTTP listener.

#### Scenario: Advance on projector port
- **WHEN** a valid advance request is made to the projector port
- **THEN** the session phase advances according to the phase machine

#### Scenario: Advance on player port rejected
- **WHEN** an advance request is made to the player port
- **THEN** the system rejects it and the phase does not change
