## Context

Live Training Quiz already accepts `PUBLIC_URL` for the projector QR and join link. Hosts must manually start `cloudflared tunnel --url http://localhost:PLAYER_PORT`, copy the trycloudflare URL, then start Deno with that env var. That multi-step flow is easy to skip; the QR then points at localhost and phones cannot join.

This change adds a single start path that owns the tunnel + app lifecycle.

## Goals / Non-Goals

**Goals:**

- One command starts cloudflared (player port only) and the quiz app with `PUBLIC_URL` set to the tunnel URL
- Parse the public URL from cloudflared stdout/stderr reliably
- Clean up: killing the start script stops both tunnel and app; app exit stops tunnel
- Clear errors when `cloudflared` is missing or URL never appears within a timeout
- Preserve LAN-only start without tunnel (`deno task start` / direct `main.ts`)

**Non-Goals:**

- Named Cloudflare tunnels, custom domains, or account login flows
- Tunneling the projector port
- Installing cloudflared for the user
- Changing quiz session logic, ports, or UI beyond receiving env
- Windows-first packaging (POSIX shell is fine for v1; note Windows later)

## Decisions

### 1. Shell wrapper script as primary entry

- **Choice:** `scripts/start-with-tunnel.sh` (or `start.sh`) invoked via `deno.json` task `start:tunnel` / documented as recommended training start
- **Why:** Spawning and supervising two processes with signal handling is natural in shell; no need to embed process management inside the Deno app for v1
- **Alternatives:** Deno orchestrator (`Deno.Command`) — nicer cross-platform later but more code; npm-style concurrent runners — wrong runtime

### 2. Start order: tunnel first, then app

- **Choice:** Start cloudflared → wait until public URL is parsed → export `PUBLIC_URL` → start `deno run -A main.ts`
- **Why:** App loads QR URL at startup (config + HTML embed); URL must exist before the process starts. Avoids hot-reload of `PUBLIC_URL`
- **Alternatives:** Start app first then inject URL — would require runtime QR refresh API (out of scope)

### 3. URL extraction

- **Choice:** Stream cloudflared stderr/stdout combined; match first `https://*.trycloudflare.com` (or generic `https://` Cloudflare quick-tunnel host) with a regex; timeout ~30s
- **Why:** Quick tunnels print a line like `| https://random.trycloudflare.com |`; parsing stdout is the documented ad-hoc approach
- **Alternatives:** cloudflared metrics API — heavier; fixed subdomain — needs account

### 4. Port alignment

- **Choice:** Script uses same defaults/env as app: `PLAYER_PORT` (default 3001), `PROJECTOR_PORT` (default 3000). Tunnel targets `http://127.0.0.1:$PLAYER_PORT`
- **Why:** Matches existing config; tunnel to localhost player port only
- **Note:** App must be started after tunnel URL is known, but player server must listen before phones hit the tunnel. Order is: start tunnel process (cloudflared will retry if origin down) → wait for URL → start Deno. Brief tunnel 502s before Deno is up are acceptable.

### 5. Process supervision

- **Choice:** Script traps INT/TERM/EXIT; kills cloudflared and Deno child PIDs. Use process group or explicit PID tracking
- **Why:** Training hosts Ctrl+C once; no orphaned tunnels burning quota/confusion
- **Alternatives:** Leave tunnel running — bad UX

### 6. Override / skip behavior

- **Choice:** If `PUBLIC_URL` is already set when the script runs, skip starting cloudflared and just start the app (power-user / pre-existing tunnel). Optional flag `--no-tunnel` for LAN-only via the same script is nice-to-have; not required if `deno task start` remains
- **Why:** Composes with advanced setups without fighting the script

### 7. Prerequisites check

- **Choice:** `command -v cloudflared` at start; exit non-zero with install link if missing. Same for `deno`
- **Why:** Fail fast beats cryptic spawn errors

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| cloudflared output format changes | Flexible regex; timeout + clear “could not parse URL” message with raw log hint |
| Tunnel ready before Deno → 502 for early scanners | Accept brief window; document “wait for projector to load” |
| Script only tested on macOS/Linux | Document POSIX shell; Windows users keep manual path |
| Double Ctrl+C / zombie children | Trap + kill both PIDs; prefer `set -e` carefully around waits |
| User already has PUBLIC_URL wrong | Document that pre-set PUBLIC_URL skips tunnel |

## Migration Plan

1. Add script + `deno.json` task
2. Update README: recommended path = tunnel start script; keep LAN-only section
3. No data migration; no API break

Rollback: delete/ignore script; continue manual cloudflared + `PUBLIC_URL` flow.

## Open Questions

- Exact script filename: prefer `scripts/start-with-tunnel.sh` with task `start:tunnel` — **decided**
- Whether Deno should re-read PUBLIC_URL after start — **no for v1** (start order guarantees correctness)
