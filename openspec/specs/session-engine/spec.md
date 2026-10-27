## Purpose

In-memory live quiz session: phases, join, answers, scoring, leaderboard, host advance, runtime metadata filters, soft reset.

## Requirements

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

### Requirement: Mutating operations leave durable state
After a successful join, answer, or advance, the system SHALL update durable local state so a subsequent process restart can restore that outcome. Scoring and phase rules remain as defined by other session-engine requirements.

#### Scenario: Answer survives restart
- **WHEN** a participant answers correctly and the process restarts with a matching snapshot
- **THEN** that participant still has the recorded answer and the increased score

#### Scenario: Phase survives restart
- **WHEN** the host advances to LEADERBOARD and the process restarts with a matching snapshot
- **THEN** the session is in LEADERBOARD at the same question index

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

### Requirement: Runtime metadata filters subset the process bank
The session MUST retain the process question bank (the quiz `questions` array after startup filters) separately from the playable question list used for phases, indices, scoring, and `questionCount`. The session MUST support an ordered list of runtime metadata filter entries. When runtime filters are empty, the playable list MUST include every bank question (after normal per-question choice shuffle for play). When runtime filters are non-empty, the playable list MUST be the ordered subset of bank questions that match those filters under the same AND-across-keys / OR-within-key rules as startup metadata filters, then prepared for play (choice shuffle). Relative order of matching questions MUST match bank order.

#### Scenario: No runtime filters plays full bank
- **WHEN** a session is created with a bank of N questions and no runtime filters
- **THEN** `questionCount` is N

#### Scenario: Runtime filter reduces playable set
- **WHEN** the host applies runtime filter `live=true` against a bank containing both live true and false questions
- **THEN** `questionCount` equals the number of bank questions with `metadata.live` boolean true, in bank order

#### Scenario: Clearing runtime filters restores bank
- **WHEN** runtime filters are applied and later replaced with an empty filter list while apply is allowed
- **THEN** `questionCount` returns to the full bank size

### Requirement: Runtime filter apply only in LOBBY
The session MUST accept a mutating runtime filter apply only while phase is LOBBY. A successful apply MUST set the active runtime filters, rebuild the playable list, and reset `questionIndex` to 0. Participants already in the lobby MUST be retained. If the filters are well-formed but match zero bank questions, the session MUST reject the apply, leave playable questions and active filters unchanged, and signal a client error. Applies outside LOBBY MUST be rejected without mutation.

#### Scenario: Apply in LOBBY succeeds
- **WHEN** phase is LOBBY and filters match at least one bank question
- **THEN** the playable set updates, `questionIndex` is 0, and phase remains LOBBY

#### Scenario: Empty match rejected
- **WHEN** phase is LOBBY and filters match zero bank questions
- **THEN** the apply fails, active filters stay as before, and `questionCount` is unchanged

#### Scenario: Apply during QUESTION rejected
- **WHEN** phase is QUESTION and a runtime filter apply is requested
- **THEN** the apply is rejected and the playable set is unchanged

### Requirement: Reset returns to lobby and clears runtime filters
Host reset MUST set phase to LOBBY and `questionIndex` to 0, clear runtime filters, and rebuild the playable list as the full process bank with a fresh choice shuffle. Reset MUST retain participants and MUST set every score to 0, so replaying a question cannot score twice. Reset MUST clear per-question answer maps so answer indices remain consistent with the rebuilt playable set.

#### Scenario: Reset clears filters and keeps roster
- **WHEN** runtime filters have reduced the bank to M playable questions, participants have joined and scored, and the host resets
- **THEN** the session is in LOBBY, `activeFilters` is empty, `questionCount` equals the full bank size, participants remain with scores of 0, and per-question answers are cleared

### Requirement: Runtime filters are durable
After a successful runtime filter apply, durable session state MUST include enough information to restore the same active runtime filters and playable subset (including play-time choice order) on process restart with a matching quiz fingerprint. Snapshots that predate runtime filters (no filter field, effective list length equal to bank length) MUST continue to restore as a full-bank session with empty runtime filters when otherwise valid.

#### Scenario: Filtered session survives restart
- **WHEN** the host applies runtime filters and the process restarts with a matching snapshot
- **THEN** the restored session has the same runtime filters and the same playable question count and texts in order

#### Scenario: Legacy full-bank snapshot
- **WHEN** a snapshot has no runtime filter field and effective questions length equals the loaded bank length
- **THEN** restore succeeds with empty runtime filters when other snapshot checks pass

### Requirement: Filter facets derived from process bank
The session MUST expose filter facets for projector state by scanning metadata on the process bank: each distinct top-level metadata key that has at least one matchable scalar or array-scalar value yields a facet; each distinct stringified value includes a count of bank questions that match `key=value` alone. Facets MUST NOT be limited to the current playable subset.

#### Scenario: Facet count ignores current playable hide
- **WHEN** the bank has 5 questions with `domain=A` and runtime filters currently play only a subset that still includes some `domain=A` questions
- **THEN** the `domain`/`A` facet count remains 5

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
When the session enters QUESTION for a question whose answer has not been revealed yet, the system SHALL recompute the effective duration and, if active, start a **new** full countdown from the time of entry (it MUST NOT resume a previous partial remaining time).

#### Scenario: Re-entering an unrevealed question restarts full timer
- **WHEN** the host goes Back from QUESTION N+1 to LEADERBOARD N and then Next into QUESTION N+1 again, with effective `30`
- **THEN** a new countdown with `totalSeconds` `30` starts from the Next transition time

### Requirement: Revealed questions are read-only
Once a question has reached CORRECT (host Next or countdown expiry), re-entering QUESTION for that question (host Back from CORRECT, or later Back/Next paths) SHALL show it read-only: `answersLocked` is true in projector and player state, no countdown runs, and answer submissions MUST be rejected with status 409. Next from a locked QUESTION goes to CORRECT. The revealed watermark MUST survive restart; legacy snapshots derive it from phase and question index. Reset clears it.

#### Scenario: Back from CORRECT does not reopen answering
- **WHEN** the host moves from CORRECT back to QUESTION for a timed question
- **THEN** countdown is null, `answersLocked` is true, and an answer from a player who had not answered is rejected with 409 and does not change scores

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
