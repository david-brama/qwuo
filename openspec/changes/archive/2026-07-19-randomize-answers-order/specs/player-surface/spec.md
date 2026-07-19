## MODIFIED Requirements

### Requirement: Answer pad during QUESTION
While the session phase is QUESTION and the participant has not answered the current question, the player UI MUST show the question text and tappable choices in the session's effective choice order as provided by the player state API (the same order used for scoring and by the projector for that session).

#### Scenario: Display current question
- **WHEN** phase is QUESTION and the participant has not answered
- **THEN** the UI shows the question and all choices

#### Scenario: Choices match session order
- **WHEN** phase is QUESTION and the participant has not answered
- **THEN** the choices appear in the order returned by the session-scoped player state for the current question
