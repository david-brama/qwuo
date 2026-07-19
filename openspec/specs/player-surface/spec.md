## Purpose

Public player UI: name join, answer pad, instant feedback, wait states, poll sync.

## Requirements

### Requirement: Player binds for tunnel access
The system SHALL serve the player surface on a dedicated HTTP port bound to loopback only (`127.0.0.1`, default port 3001, overridable by configuration). The system MUST NOT bind the player listener to all interfaces (`0.0.0.0`) for LAN phone access. Public phone access MUST go through an ad-hoc tunnel (e.g. cloudflared) to that localhost port. The live player room MUST be served under `/s/{sessionId}/` for the active session UUID, not at the unscoped player root.

#### Scenario: Player reachable at session path
- **WHEN** a client requests the session-scoped player URL `/s/{sessionId}/` on the player port from the host loopback
- **THEN** the player UI is served

#### Scenario: Unscoped player root is not the room
- **WHEN** a client requests `/` on the player port without a session path
- **THEN** the live player room UI is not served

#### Scenario: Not reachable via host LAN IP without tunnel
- **WHEN** a device on the local network requests the player port using the host's non-loopback address
- **THEN** the connection fails because the player listener is not bound to that interface

### Requirement: Name entry to join
The player UI MUST prompt for a display name and join the session without login or password. Join MUST target the session-scoped join API under the current `/s/{sessionId}/` prefix.

#### Scenario: Successful join
- **WHEN** a participant enters a non-empty name and submits
- **THEN** they join the session and proceed to the waiting or question UI

#### Scenario: Empty name rejected
- **WHEN** a participant submits an empty or whitespace-only name
- **THEN** join is rejected and they remain on the name entry UI

### Requirement: Player client uses session-scoped API base
The player client MUST derive its API base path from the current page path (`/s/{sessionId}`) so state, join, and answer requests hit `/s/{sessionId}/api/…`.

#### Scenario: State poll under session prefix
- **WHEN** the player UI polls session state
- **THEN** the request path is under `/s/{sessionId}/api/state`

#### Scenario: Join under session prefix
- **WHEN** the player UI submits a join
- **THEN** the request path is `/s/{sessionId}/api/join`

### Requirement: Session reattach
The player client MUST retain its participant id across page reloads in the same browser and reattach to the existing participant when the server still knows that id. Reattach MUST succeed after a server process restart when the restored session still contains that participant.

#### Scenario: Reload mid-session
- **WHEN** a joined participant reloads the player page while the server still has their participant
- **THEN** they resume as the same participant without re-entering a name

#### Scenario: Reattach after server restart
- **WHEN** a joined participant has a stored participant id
- **AND** the server process restarts and restores a snapshot that includes that id
- **AND** the participant opens or reloads the player page
- **THEN** they resume as the same participant with the restored score and answer state without re-entering a name

#### Scenario: Stale id after fresh session
- **WHEN** a client has a stored participant id that is not present in the current session
- **THEN** the client clears the stored id and prompts for a new name join

### Requirement: Answer pad during QUESTION
While the session phase is QUESTION and the participant has not answered the current question, the player UI MUST show the question text and tappable choices in the session's effective choice order as provided by the player state API (the same order used for scoring and by the projector for that session).

#### Scenario: Display current question
- **WHEN** phase is QUESTION and the participant has not answered
- **THEN** the UI shows the question and all choices

#### Scenario: Choices match session order
- **WHEN** phase is QUESTION and the participant has not answered
- **THEN** the choices appear in the order returned by the session-scoped player state for the current question

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
