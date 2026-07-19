## MODIFIED Requirements

### Requirement: Phase-specific main content
The projector UI MUST show phase-appropriate main content:

- QUESTION: question text and all choices in the session's effective choice order without indicating the correct answer
- CORRECT: same content and order with the correct choice highlighted using the session's remapped correct index
- EXPLAIN: explanation text for the current question (or a "No explanation" placeholder if empty)
- LEADERBOARD: ranked participant names and scores
- END: session complete indication

#### Scenario: Question hides correct answer
- **WHEN** the projector phase is QUESTION
- **THEN** no visual treatment identifies which choice is correct

#### Scenario: Correct highlights answer
- **WHEN** the projector phase is CORRECT
- **THEN** the correct choice is visually highlighted

#### Scenario: Empty explanation
- **WHEN** the projector phase is EXPLAIN and the question has no explanation text
- **THEN** the UI shows a "No explanation" placeholder

#### Scenario: Choices match session order
- **WHEN** the projector phase is QUESTION or CORRECT
- **THEN** choices are shown in the order returned by projector state for the current question (shared with players)
