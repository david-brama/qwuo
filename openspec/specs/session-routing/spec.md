## Purpose

Session UUID identity, path-prefix routing, join URL shape, and active-session pointer across restarts. TBD.

## Requirements

### Requirement: Session identified by UUID
The system SHALL assign each live session a UUID string as its session id. The session id SHALL be the sole path segment that selects the live room in HTTP routes and the sole stem of the session snapshot filename.

#### Scenario: New session gets UUID
- **WHEN** the process starts without a restorable snapshot for an active session id
- **THEN** the system creates a new session id (UUID) and uses it for routing and persistence

#### Scenario: Filename stem equals session id
- **WHEN** the system persists the live session
- **THEN** the snapshot file is written as `{sessionsDir}/{sessionId}.json` where `{sessionId}` equals the UUID used in the HTTP path

### Requirement: Session path prefix routing
The system SHALL serve the live room only under the path prefix `/s/{sessionId}/` on both projector and player ports, where `{sessionId}` is the active session UUID.

#### Scenario: Session-scoped UI
- **WHEN** a client requests `GET /s/{activeSessionId}/` (or `…/index.html`) on the appropriate port
- **THEN** the system serves the projector or player UI for that session

#### Scenario: Session-scoped API
- **WHEN** a client requests a known API under `/s/{activeSessionId}/api/…` with the correct method
- **THEN** the system handles the request against the live session

#### Scenario: Wrong session id rejected
- **WHEN** a client requests `/s/{otherUuid}/…` where `{otherUuid}` is a well-formed UUID but not the active session id
- **THEN** the system responds with 404

#### Scenario: Malformed session segment rejected
- **WHEN** a client requests `/s/{notAUuid}/…`
- **THEN** the system responds with 404

#### Scenario: Unscoped root not the room
- **WHEN** a client requests `/` or `/api/*` without a session path prefix
- **THEN** the system does not serve the live room UI or session APIs (404 or equivalent non-room response)

### Requirement: Join URL includes session path
The system SHALL build the player join URL as the public or local player origin plus `/s/{sessionId}` (normalized, no double slashes). The projector QR MUST encode that session-scoped join URL.

#### Scenario: PUBLIC_URL set
- **WHEN** `PUBLIC_URL` is set to a tunnel origin without a path
- **THEN** the join URL is `{PUBLIC_URL}/s/{sessionId}`

#### Scenario: PUBLIC_URL unset
- **WHEN** `PUBLIC_URL` is not set
- **THEN** the join URL is `http://localhost:{playerPort}/s/{sessionId}` (or equivalent local player base plus session path)

### Requirement: Active session pointer for restart
The system SHALL remember the active session id across process restarts (via a pointer file under the sessions directory, or an explicit `SESSION_ID` configuration) so restore targets the same UUID path and filename.

#### Scenario: Restart keeps same id
- **WHEN** the process stops and starts again with a valid snapshot for the remembered session id and matching quiz fingerprint
- **THEN** the same session id remains active and the room is restorable at `/s/{sessionId}/…`
