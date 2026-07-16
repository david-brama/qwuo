## MODIFIED Requirements

### Requirement: Player binds for tunnel access
The system SHALL serve the player surface on a dedicated HTTP port bound to all interfaces (default port 3001, overridable by configuration) so it can be exposed via an ad-hoc tunnel. The live player room MUST be served under `/s/{sessionId}/` for the active session UUID, not at the unscoped player root.

#### Scenario: Player reachable at session path
- **WHEN** a client requests the session-scoped player URL `/s/{sessionId}/` on the player port
- **THEN** the player UI is served

#### Scenario: Unscoped player root is not the room
- **WHEN** a client requests `/` on the player port without a session path
- **THEN** the live player room UI is not served

### Requirement: Name entry to join
The player UI MUST prompt for a display name and join the session without login or password. Join MUST target the session-scoped join API under the current `/s/{sessionId}/` prefix.

#### Scenario: Successful join
- **WHEN** a participant enters a non-empty name and submits
- **THEN** they join the session and proceed to the waiting or question UI

#### Scenario: Empty name rejected
- **WHEN** a participant submits an empty or whitespace-only name
- **THEN** join is rejected and they remain on the name entry UI

## ADDED Requirements

### Requirement: Player client uses session-scoped API base
The player client MUST derive its API base path from the current page path (`/s/{sessionId}`) so state, join, and answer requests hit `/s/{sessionId}/api/…`.

#### Scenario: State poll under session prefix
- **WHEN** the player UI polls session state
- **THEN** the request path is under `/s/{sessionId}/api/state`

#### Scenario: Join under session prefix
- **WHEN** the player UI submits a join
- **THEN** the request path is `/s/{sessionId}/api/join`
