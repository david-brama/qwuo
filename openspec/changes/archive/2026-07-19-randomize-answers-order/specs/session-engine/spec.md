## ADDED Requirements

### Requirement: Session shuffles choice order for play
When a new live session is created from a loaded quiz, or when the host resets the session to an empty LOBBY, the system SHALL produce an effective play order for each question by randomly permuting that question's `choices` and remapping `correct` so it still identifies the same choice text. The multiset of choice strings MUST be preserved. Projector state, player state, and answer validation for that session MUST use the effective play order and remapped correct index. All participants in the same session MUST see the same effective order for a given question. Restoring a session from hydrate/snapshot MUST NOT apply a new random shuffle.

#### Scenario: New session gets effective order
- **WHEN** a new session is created from a loaded quiz
- **THEN** each question exposed via projector and player state uses an effective `choices` array that is a permutation of the authoring choices
- **AND** `choices[correct]` equals the authoring correct choice text

#### Scenario: Host and players share order
- **WHEN** the session is in QUESTION for a question with multiple choices
- **THEN** projector state and player state list the same choices in the same order for that question

#### Scenario: Scoring uses remapped index
- **WHEN** a participant submits the choice index of the correct choice text under the effective order during QUESTION
- **THEN** the answer is scored correct and their score increases by 1

#### Scenario: Reset reshuffles
- **WHEN** the host resets the session to empty LOBBY
- **THEN** the system builds a new effective choice order for play (independent of the previous session order)

#### Scenario: Restore does not reshuffle
- **WHEN** a session is restored from hydrate or snapshot that includes an effective choice order
- **THEN** the restored session keeps that effective order and does not draw a new random permutation
