## ADDED Requirements

### Requirement: Active user engagement window
The system SHALL define a participant’s engagement window as the contiguous set of playable question indices from `max(0, ref - 3)` through `ref` inclusive (at most four indices). The reference index `ref` MUST be:

- the current `questionIndex` when phase is `QUESTION`, `CORRECT`, `EXPLAIN`, or `LEADERBOARD`
- undefined (empty window) when phase is `LOBBY`
- `questionCount - 1` when phase is `END` and `questionCount > 0`; empty window when `questionCount` is 0

#### Scenario: Mid-session window of four
- **WHEN** phase is `QUESTION` and `questionIndex` is 7
- **THEN** the engagement window is indices 4, 5, 6, and 7

#### Scenario: Early session short window
- **WHEN** phase is `QUESTION` and `questionIndex` is 1
- **THEN** the engagement window is indices 0 and 1

#### Scenario: Lobby has empty window
- **WHEN** phase is `LOBBY`
- **THEN** the engagement window is empty

#### Scenario: End uses last playable index
- **WHEN** phase is `END` and `questionCount` is 10
- **THEN** the engagement window is indices 6, 7, 8, and 9

### Requirement: Active user definition
A participant is an **active user** if and only if they have a recorded answer for at least two distinct indices in the current engagement window. A recorded answer MUST count whether the choice was correct or incorrect. Participants with fewer than two answers in the window MUST NOT be counted as active. When the window contains fewer than two indices, no participant MUST be active.

#### Scenario: Two of last four answered
- **WHEN** the window is indices 3–6
- **AND** a participant has answers only for indices 4 and 6
- **THEN** that participant is an active user

#### Scenario: One answer is not enough
- **WHEN** the window is indices 0–3
- **AND** a participant has answered only index 2
- **THEN** that participant is not an active user

#### Scenario: Incorrect answers still count
- **WHEN** a participant has two incorrect answers in the window and no correct ones
- **THEN** that participant is an active user

#### Scenario: First question only cannot activate
- **WHEN** phase is `QUESTION` and `questionIndex` is 0
- **THEN** no participant is an active user even if they answered question 0

#### Scenario: Late joiner with one prior answer
- **WHEN** the window has four indices
- **AND** a late joiner has answered only the current question
- **THEN** that joiner is not an active user

### Requirement: Projector state exposes active engagement counts
Host projector state MUST include:

- `activeUserCount`: the number of participants who currently meet the active user definition
- `activeAnsweredCount`: when phase is `QUESTION`, `CORRECT`, `EXPLAIN`, or `LEADERBOARD`, the number of active users who have a recorded answer for the current `questionIndex`; when phase is `LOBBY` or `END`, `0`

Player state MUST NOT be required to include these fields. Counts MUST be derived from current participant answer maps and MUST NOT require separate durable storage.

#### Scenario: Active count on projector state
- **WHEN** three participants are active under the current window and two others are not
- **THEN** projector state `activeUserCount` is 3

#### Scenario: Active answered during question
- **WHEN** phase is `QUESTION` with five active users
- **AND** two of those active users have answered the current question
- **THEN** projector state `activeAnsweredCount` is 2

#### Scenario: Non-active answers excluded from active answered
- **WHEN** phase is `QUESTION`
- **AND** a non-active participant has answered the current question
- **THEN** that participant does not increase `activeAnsweredCount`

#### Scenario: Lobby zeros
- **WHEN** phase is `LOBBY`
- **THEN** projector state has `activeUserCount` 0 and `activeAnsweredCount` 0

#### Scenario: Answer increases counts without host advance
- **WHEN** phase is `QUESTION` and a participant submits a second in-window answer that newly makes them active and is for the current question
- **AND** the host fetches projector state
- **THEN** `activeUserCount` and `activeAnsweredCount` reflect that answer

#### Scenario: Reset clears active metrics
- **WHEN** participants had answers and were active
- **AND** the host resets the session (answers cleared)
- **THEN** projector state `activeUserCount` is 0 and `activeAnsweredCount` is 0
