## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Projector client uses session-scoped API base
The projector client MUST call host APIs under `/s/{sessionId}/api/…` (state, advance, reset) derived from the current page path.

#### Scenario: Advance under session prefix
- **WHEN** the host activates Next
- **THEN** the client posts to `/s/{sessionId}/api/advance`
