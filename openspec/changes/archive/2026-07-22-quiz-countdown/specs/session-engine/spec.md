## ADDED Requirements

### Requirement: QUESTION countdown from effective duration
When the session enters the QUESTION phase, the system SHALL resolve the effective countdown seconds for the current question (see quiz-config effective resolution). When the effective value is greater than `0`, the system SHALL start a server-authoritative countdown by recording an absolute deadline of approximately now plus that many seconds and SHALL expose countdown state on projector and player payloads. When the effective value is unset or `0`, the system MUST NOT run a countdown for that QUESTION (host-paced as today) and MUST expose null/absent countdown on state payloads.

#### Scenario: Positive effective starts deadline
- **WHEN** the session enters QUESTION for a question whose effective countdown is `30`
- **THEN** projector and player state include countdown with `totalSeconds` `30` and a `deadlineMs` approximately 30 seconds in the future

#### Scenario: No effective countdown
- **WHEN** the session enters QUESTION for a question with no active countdown (unset or effective `0`)
- **THEN** projector and player state have null/absent countdown and the phase does not auto-advance due to time

#### Scenario: Override used for deadline length
- **WHEN** the quiz default is `30` and the current question override is `10`
- **AND** the session enters QUESTION for that question
- **THEN** countdown `totalSeconds` is `10`

### Requirement: Countdown expiry advances out of QUESTION
While the phase is QUESTION and an active countdown deadline has been reached, the system SHALL advance the session out of QUESTION using the same phase transition and scoring rules as a successful host advance from QUESTION (unanswered participants receive 0 for that question; phase becomes CORRECT). The system MUST cancel the active countdown when leaving QUESTION for any reason (expiry, host Next, host Back, or reset).

#### Scenario: Timer reaches zero
- **WHEN** the session is in QUESTION with an active countdown
- **AND** the deadline is reached
- **THEN** the session phase becomes CORRECT for the same question index
- **AND** participants without answers do not gain points for that question

#### Scenario: Host advances before expiry
- **WHEN** the session is in QUESTION with an active countdown
- **AND** the host advances before the deadline
- **THEN** the session leaves QUESTION immediately
- **AND** the countdown is cleared and does not fire a second advance later

#### Scenario: Stale timeout cannot skip ahead
- **WHEN** a countdown was scheduled for question index N
- **AND** the host has already moved the session past that QUESTION before the timer fires
- **THEN** the late timer MUST NOT change the current phase or question index

### Requirement: Re-entering QUESTION restarts countdown
When the session enters QUESTION again (including host Back from CORRECT into QUESTION, or advancing from LEADERBOARD into the next QUESTION), the system SHALL recompute the effective duration and, if active, start a **new** full countdown from the time of entry (it MUST NOT resume a previous partial remaining time).

#### Scenario: Back from CORRECT restarts full timer
- **WHEN** the host moves from CORRECT back to QUESTION for a timed question with effective `30`
- **THEN** a new countdown with `totalSeconds` `30` starts from the Back transition time

#### Scenario: Next question gets its own effective duration
- **WHEN** the session advances from LEADERBOARD into QUESTION for the next question
- **THEN** countdown state reflects that next question’s effective duration (or null if none)

### Requirement: State payloads expose countdown for clients
While phase is QUESTION and a countdown is active, both `projectorState` and `playerState` MUST include a countdown object with at least `totalSeconds` (positive integer) and `deadlineMs` (epoch milliseconds). When phase is not QUESTION, or no countdown is active, countdown MUST be null or omitted. Countdown MUST NOT leak the correct answer index.

#### Scenario: Projector sees deadline during QUESTION
- **WHEN** phase is QUESTION with an active countdown
- **THEN** projector state includes countdown `totalSeconds` and `deadlineMs`

#### Scenario: Player sees deadline during QUESTION
- **WHEN** phase is QUESTION with an active countdown
- **THEN** player state includes countdown `totalSeconds` and `deadlineMs`

#### Scenario: Countdown absent after leaving QUESTION
- **WHEN** phase is CORRECT, EXPLAIN, LEADERBOARD, LOBBY, or END
- **THEN** countdown is null or omitted on projector and player state
