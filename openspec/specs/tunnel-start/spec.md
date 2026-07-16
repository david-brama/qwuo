## Purpose

Start script that launches cloudflared against the player port, sets PUBLIC_URL, and runs the quiz app with process cleanup.

## Requirements

### Requirement: Single command starts tunnel and app
The system SHALL provide a start script that, when invoked for the tunnel path, starts a Cloudflare quick tunnel to the player port and starts the quiz application with `PUBLIC_URL` set to the tunnel's public HTTPS URL. The default tunnel backend SHALL be Docker Compose using image `cloudflare/cloudflared:latest`.

#### Scenario: Successful training-room start (Docker)
- **WHEN** the operator runs the tunnel start script and Docker Compose and `deno` are available
- **THEN** the script starts the compose `cloudflared` service targeting the player port, obtains a public HTTPS URL, starts the quiz app with that URL as `PUBLIC_URL`, and the process remains running until interrupted

#### Scenario: Successful training-room start (native fallback)
- **WHEN** Docker Compose is unavailable, `cloudflared` is on PATH, and `TUNNEL_MODE` is `auto` or `native`
- **THEN** the script starts native cloudflared targeting the player port and proceeds as above

#### Scenario: PUBLIC_URL already set
- **WHEN** the operator runs the tunnel start script with `PUBLIC_URL` already set in the environment
- **THEN** the script does not start cloudflared and starts the quiz app using the existing `PUBLIC_URL`

### Requirement: Tunnel targets player port only
The start script MUST point the Cloudflare tunnel at the local player HTTP port (default 3001, or `PLAYER_PORT` when set) and MUST NOT tunnel the projector port.

#### Scenario: Tunnel origin
- **WHEN** the script starts cloudflared (Docker or native)
- **THEN** the tunnel URL targets the player port on the host (`http://host.docker.internal:<player-port>` for Docker, or `http://127.0.0.1:<player-port>` for native)

### Requirement: Public URL discovery
The start script MUST extract the public HTTPS join URL from cloudflared output before starting the quiz app, and MUST fail with a non-zero exit and a clear error if no URL is obtained within a bounded wait time.

#### Scenario: URL parsed from cloudflared output
- **WHEN** cloudflared prints a trycloudflare (or equivalent quick-tunnel) HTTPS URL
- **THEN** the script sets `PUBLIC_URL` to that base URL and proceeds to start the app

#### Scenario: URL timeout
- **WHEN** cloudflared runs but no public HTTPS URL is parsed before the wait timeout
- **THEN** the script exits non-zero, prints a clear error, and does not leave the quiz app running

### Requirement: Prerequisite checks
The start script MUST verify that required tools exist before starting the tunnel flow.

#### Scenario: no tunnel backend
- **WHEN** the operator runs the tunnel start script, `PUBLIC_URL` is not pre-set, and neither Docker Compose nor native `cloudflared` is available
- **THEN** the script exits non-zero with a message describing Docker (preferred) and native install options, plus the LAN-only start path

#### Scenario: deno missing
- **WHEN** the operator runs the tunnel start script and `deno` is not on PATH
- **THEN** the script exits non-zero with a clear error

### Requirement: Process cleanup on exit
When the start script or its child app terminates (including SIGINT/SIGTERM), the script MUST terminate the cloudflared child it started so the tunnel does not remain running orphaned. For Docker, cleanup MUST run `docker compose down` (or equivalent) for the project compose file.

#### Scenario: Ctrl+C stops both
- **WHEN** the operator interrupts the running start script
- **THEN** both the quiz app process and the cloudflared process/container started by the script are stopped

#### Scenario: App exit stops tunnel
- **WHEN** the quiz app process exits while supervised by the script
- **THEN** the script stops cloudflared (if it started it) and exits

### Requirement: LAN-only start remains available
The project MUST continue to support starting the quiz without a tunnel (direct Deno start), without requiring cloudflared or Docker.

#### Scenario: Direct start without tunnel
- **WHEN** the operator runs the existing non-tunnel start path (e.g. `deno task start`)
- **THEN** the app starts without launching cloudflared

### Requirement: Documentation for tunnel start
Project documentation MUST describe the tunnel start script as the recommended path for training rooms with phones off the host LAN, including prerequisites (`deno`, Docker Compose) and the projector localhost URL.

#### Scenario: README documents one-command tunnel start
- **WHEN** an operator reads the project README
- **THEN** they can find how to run the tunnel start script and open the projector on localhost
