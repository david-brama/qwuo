## ADDED Requirements

### Requirement: Player shows QUESTION countdown
While the player phase is QUESTION and player state includes an active countdown (`totalSeconds` and `deadlineMs`), the player UI MUST display the remaining time in whole seconds derived from the server deadline. When countdown is null/absent or phase is not QUESTION, the player UI MUST NOT show a question countdown. The countdown display MUST NOT replace the answer pad; participants MAY still submit an answer until the phase leaves QUESTION or they have already answered.

#### Scenario: Timed question shows remaining on answer pad
- **WHEN** the player is in QUESTION, has not answered, and state has an active countdown
- **THEN** the UI shows remaining seconds along with the question and choices

#### Scenario: Untimed question has no countdown chrome
- **WHEN** the player is in QUESTION and state has no countdown
- **THEN** the UI does not show a question countdown

#### Scenario: Expiry ends answering via phase change
- **WHEN** the server auto-advances out of QUESTION at deadline
- **AND** the player polls state
- **THEN** the player leaves the answer-pad QUESTION UI according to the new phase
- **AND** further answers are not accepted for that question
