## Purpose

Public player UI: name join, answer pad, instant feedback, wait states, poll sync.

## Requirements

### Requirement: Player binds for tunnel access
The system SHALL serve the player surface on a dedicated HTTP port bound to all interfaces (default port 3001, overridable by configuration) so it can be exposed via an ad-hoc tunnel.

#### Scenario: Player reachable
- **WHEN** a client requests the player base URL on the player port
- **THEN** the player UI is served

### Requirement: Name entry to join
The player UI MUST prompt for a display name and join the session without login or password.

#### Scenario: Successful join
- **WHEN** a participant enters a non-empty name and submits
- **THEN** they join the session and proceed to the waiting or question UI

#### Scenario: Empty name rejected
- **WHEN** a participant submits an empty or whitespace-only name
- **THEN** join is rejected and they remain on the name entry UI

### Requirement: Session reattach
The player client MUST retain its participant id across page reloads in the same browser and reattach to the existing participant when possible.

#### Scenario: Reload mid-session
- **WHEN** a joined participant reloads the player page
- **THEN** they resume as the same participant without re-entering a name (while the server process is still running)

### Requirement: Answer pad during QUESTION
While the session phase is QUESTION and the participant has not answered the current question, the player UI MUST show the question text and tappable choices.

#### Scenario: Display current question
- **WHEN** phase is QUESTION and the participant has not answered
- **THEN** the UI shows the question and all choices

### Requirement: Immediate feedback after selection
When a participant selects a choice, the player UI MUST immediately show whether their choice was correct or incorrect and indicate the correct choice, without waiting for the host to advance.

#### Scenario: Instant correct feedback
- **WHEN** the participant selects the correct choice
- **THEN** the UI immediately indicates success and their updated score

#### Scenario: Instant incorrect feedback
- **WHEN** the participant selects an incorrect choice
- **THEN** the UI immediately indicates failure and shows which choice was correct

### Requirement: Wait states outside active answering
When the participant cannot answer (not yet joined phase, already answered, or phase is not QUESTION), the player UI MUST show an appropriate waiting state rather than an active answer pad.

#### Scenario: Waiting after answer
- **WHEN** the participant has answered and the host has not yet reached the next QUESTION
- **THEN** the UI shows a waiting/locked state (and may show personal score)

#### Scenario: Waiting in lobby
- **WHEN** the session is in LOBBY and the participant has joined
- **THEN** the UI shows a waiting-for-start state

### Requirement: Client follows host phase
The player UI MUST update when the host advances phases (via short polling or equivalent), so a new QUESTION appears without a full manual refresh.

#### Scenario: New question appears
- **WHEN** the host advances into a new QUESTION phase
- **THEN** the player UI updates to show the new question and answer pad (if not yet answered)
