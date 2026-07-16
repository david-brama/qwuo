## MODIFIED Requirements

### Requirement: Localhost-only start remains available
The project MUST continue to support starting the quiz without a tunnel (direct Deno start), without requiring cloudflared or Docker. Both HTTP listeners MUST bind loopback only. Phones MUST require a tunnel (or a pre-set `PUBLIC_URL` that reaches the player via some tunnel). Direct LAN Wi‑Fi join without a tunnel is not a supported phone path.

#### Scenario: Direct start without tunnel
- **WHEN** the operator runs the existing non-tunnel start path (e.g. `deno task start`)
- **THEN** the app starts without launching cloudflared; player and projector are reachable only on `127.0.0.1`

### Requirement: Documentation for tunnel start
Project documentation MUST describe the tunnel start script as the recommended path for training rooms with phones, including prerequisites (`deno`, Docker Compose) and the projector localhost URL. Documentation MUST NOT present LAN-only phone join (binding player to all interfaces) as a supported mode.

#### Scenario: README documents one-command tunnel start
- **WHEN** an operator reads the project README
- **THEN** they can find how to run the tunnel start script and open the projector on localhost

#### Scenario: README does not document LAN phone join
- **WHEN** an operator reads the project README for phone access
- **THEN** the documented path is tunnel (or equivalent public URL), not host LAN IP on the player port
