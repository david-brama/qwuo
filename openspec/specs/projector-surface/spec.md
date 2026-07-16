## Purpose

Localhost projector UI: QR placement, phase content, host Next control.

## Requirements

### Requirement: Projector binds localhost only
The system SHALL serve the projector surface on a dedicated HTTP port bound to localhost only (default port 3000, overridable by configuration). The live projector room MUST be served under `/s/{sessionId}/` for the active session UUID.

#### Scenario: Local access at session path
- **WHEN** a browser on the host machine requests `/s/{sessionId}/` on the projector port
- **THEN** the projector UI is served

#### Scenario: Not exposed with player tunnel
- **WHEN** an operator tunnels only the player port
- **THEN** the projector surface remains unreachable via that tunnel

### Requirement: Lobby shows large QR
While the session phase is LOBBY, the projector UI MUST display a large QR code encoding the **session-scoped** public player join URL (`…/s/{sessionId}`), plus human-readable URL text.

#### Scenario: Lobby QR content
- **WHEN** the projector is in LOBBY and `PUBLIC_URL` is set
- **THEN** the QR encodes `{PUBLIC_URL}/s/{sessionId}` (normalized)

#### Scenario: Lobby without PUBLIC_URL
- **WHEN** the projector is in LOBBY and `PUBLIC_URL` is not set
- **THEN** the QR encodes the local player base URL plus `/s/{sessionId}`

### Requirement: Small QR on non-lobby screens
On all projector phases other than LOBBY, the projector UI MUST show a small QR code in the top-right corner encoding the same **session-scoped** player join URL.

#### Scenario: Question phase QR placement
- **WHEN** the projector is in QUESTION, CORRECT, EXPLAIN, LEADERBOARD, or END
- **THEN** a small QR appears in the top-right encoding the session-scoped join URL and main content remains readable

### Requirement: Projector client uses session-scoped API base
The projector client MUST call host APIs under `/s/{sessionId}/api/…` (state, advance, reset) derived from the current page path.

#### Scenario: Advance under session prefix
- **WHEN** the host activates Next
- **THEN** the client posts to `/s/{sessionId}/api/advance`

### Requirement: Phase-specific main content
The projector UI MUST show phase-appropriate main content:

- QUESTION: question text and all choices without indicating the correct answer
- CORRECT: same content with the correct choice highlighted
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

### Requirement: Host advances with Next button
The projector UI MUST provide a visible **Next** button that advances the session phase. Keyboard shortcuts are not required.

#### Scenario: Next advances phase
- **WHEN** the host activates the Next button
- **THEN** the session advances one step in the phase machine and the UI reflects the new phase

### Requirement: Professional training appearance
The projector UI MUST use a clean, high-contrast, professional visual style suitable for a training projector (large readable type, no party-game chrome).

#### Scenario: Readable on projector
- **WHEN** the projector page is displayed fullscreen on a typical 1080p display
- **THEN** question text and choices remain legible from a training-room distance
