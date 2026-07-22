## ADDED Requirements

### Requirement: Projector shows QUESTION countdown
While the projector phase is QUESTION and projector state includes an active countdown (`totalSeconds` and `deadlineMs`), the projector UI MUST display the remaining time in whole seconds derived from the server deadline (not a purely client-started independent timer). When countdown is null/absent or phase is not QUESTION, the projector UI MUST NOT show a question countdown.

#### Scenario: Timed question displays remaining seconds
- **WHEN** the projector is in QUESTION and state has countdown with a future `deadlineMs`
- **THEN** the UI shows a visible remaining-seconds countdown that decreases toward zero

#### Scenario: Untimed question hides countdown
- **WHEN** the projector is in QUESTION and state has no countdown
- **THEN** the UI does not show a question countdown control

#### Scenario: Countdown hidden after phase leaves QUESTION
- **WHEN** the projector phase becomes CORRECT (or any non-QUESTION phase)
- **THEN** the question countdown display is hidden

#### Scenario: Auto-advance reflected without host Next
- **WHEN** the server auto-advances out of QUESTION because the deadline was reached
- **AND** the projector polls state
- **THEN** the UI reflects CORRECT (or the new phase) without requiring the host to press Next
