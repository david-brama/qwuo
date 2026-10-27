## ADDED Requirements

### Requirement: Projector shows active user count
The projector UI MUST display the session’s `activeUserCount` from projector state in host-visible chrome (status area and/or lobby summary), labeled so it is distinct from total joined participants. The displayed number MUST update when polled projector state changes.

#### Scenario: Lobby shows zero active
- **WHEN** the projector is in LOBBY and state has `activeUserCount` 0
- **THEN** the UI shows an active count of 0 (distinct from the joined participant count)

#### Scenario: Status reflects active users mid-session
- **WHEN** projector state has `activeUserCount` 12 and `participantCount` 20
- **THEN** the UI shows 12 as the active user count and continues to show joined participants separately

### Requirement: Projector shows active users who answered the current question
While projector phase is `QUESTION`, `CORRECT`, or `EXPLAIN` and projector state includes a current question, the projector UI MUST display how many active users have already answered that question using `activeAnsweredCount`, in relation to `activeUserCount` (for example `K / N active answered`). When phase is `LOBBY` or there is no current question content, the UI MUST NOT show a current-question active-answered line as primary question chrome.

#### Scenario: Question phase shows active answered progress
- **WHEN** the projector is in QUESTION
- **AND** state has `activeUserCount` 10 and `activeAnsweredCount` 4
- **THEN** the UI shows that 4 of 10 active users have answered

#### Scenario: Progress updates as answers arrive
- **WHEN** the projector is in QUESTION
- **AND** a subsequent state poll increases `activeAnsweredCount`
- **THEN** the displayed active-answered figure updates without requiring the host to press Next

#### Scenario: Correct phase keeps active answered visible
- **WHEN** the projector is in CORRECT
- **AND** state has non-zero `activeUserCount` and `activeAnsweredCount`
- **THEN** the active-answered figure remains visible with the question content

#### Scenario: Lobby hides question active-answered line
- **WHEN** the projector is in LOBBY
- **THEN** the UI does not show a current-question “active answered” progress line
