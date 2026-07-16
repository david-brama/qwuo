## ADDED Requirements

### Requirement: Single command starts tunnel and app
The system SHALL provide a start script that, when invoked for the tunnel path, starts a Cloudflare quick tunnel to the player port and starts the quiz application with `PUBLIC_URL` set to the tunnel's public HTTPS URL.

#### Scenario: Successful training-room start
- **WHEN** the operator runs the tunnel start script and `cloudflared` and `deno` are available
- **THEN** the script starts cloudflared targeting the player port, obtains a public HTTPS URL, starts the quiz app with that URL as `PUBLIC_URL`, and the process remains running until interrupted

#### Scenario: PUBLIC_URL already set
- **WHEN** the operator runs the tunnel start script with `PUBLIC_URL` already set in the environment
- **THEN** the script does not start cloudflared and starts the quiz app using the existing `PUBLIC_URL`

### Requirement: Tunnel targets player port only
The start script MUST point the Cloudflare tunnel at the local player HTTP port (default 3001, or `PLAYER_PORT` when set) and MUST NOT tunnel the projector port.

#### Scenario: Tunnel origin
- **WHEN** the script starts cloudflared
- **THEN** the tunnel URL targets `http://127.0.0.1:<player-port>` (or equivalent localhost player origin)

### Requirement: Public URL discovery
The start script MUST extract the public HTTPS join URL from cloudflared output before starting the quiz app, and MUST fail with a non-zero exit and a clear error if no URL is obtained within a bounded wait time.

#### Scenario: URL parsed from cloudflared output
- **WHEN** cloudflared prints a trycloudflare (or equivalent quick-tunnel) HTTPS URL
- **THEN** the script sets `PUBLIC_URL` to that base URL and proceeds to start the app

#### Scenario: URL timeout
- **WHEN** cloudflared runs but no public HTTPS URL is parsed before the wait timeout
- **THEN** the script exits non-zero, prints a clear error, and does not leave the quiz app running

### Requirement: Prerequisite checks
The start script MUST verify that required tools exist on PATH before starting the tunnel flow.

#### Scenario: cloudflared missing
- **WHEN** the operator runs the tunnel start script and `cloudflared` is not on PATH (and `PUBLIC_URL` is not pre-set)
- **THEN** the script exits non-zero with a message that cloudflared is required and how to install or use the LAN-only start path

#### Scenario: deno missing
- **WHEN** the operator runs the tunnel start script and `deno` is not on PATH
- **THEN** the script exits non-zero with a clear error

### Requirement: Process cleanup on exit
When the start script or its child app terminates (including SIGINT/SIGTERM), the script MUST terminate the cloudflared child it started so the tunnel does not remain running orphaned.

#### Scenario: Ctrl+C stops both
- **WHEN** the operator interrupts the running start script
- **THEN** both the quiz app process and the cloudflared process started by the script are stopped

#### Scenario: App exit stops tunnel
- **WHEN** the quiz app process exits while supervised by the script
- **THEN** the script stops cloudflared (if it started it) and exits

### Requirement: LAN-only start remains available
The project MUST continue to support starting the quiz without a tunnel (direct Deno start), without requiring cloudflared.

#### Scenario: Direct start without tunnel
- **WHEN** the operator runs the existing non-tunnel start path (e.g. `deno task start`)
- **THEN** the app starts without launching cloudflared

### Requirement: Documentation for tunnel start
Project documentation MUST describe the tunnel start script as the recommended path for training rooms with phones off the host LAN, including prerequisites (`deno`, `cloudflared`) and the projector localhost URL.

#### Scenario: README documents one-command tunnel start
- **WHEN** an operator reads the project README
- **THEN** they can find how to run the tunnel start script and open the projector on localhost
