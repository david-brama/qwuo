## MODIFIED Requirements

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
