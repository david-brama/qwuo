## 1. Start script skeleton

- [x] 1.1 Add `scripts/start-with-tunnel.sh` (POSIX, executable) with `set -euo pipefail` and usage header
- [x] 1.2 Resolve `PLAYER_PORT` (default 3001) and `PROJECTOR_PORT` (default 3000) from env
- [x] 1.3 Check `deno` on PATH; exit non-zero with clear message if missing

## 2. Tunnel lifecycle

- [x] 2.1 If `PUBLIC_URL` already set, skip cloudflared and jump to app start
- [x] 2.2 Check `cloudflared` on PATH when tunnel needed; exit with install + LAN-only hint if missing
- [x] 2.3 Start `cloudflared tunnel --url http://127.0.0.1:$PLAYER_PORT` in background; capture PID and combined logs
- [x] 2.4 Parse first public HTTPS quick-tunnel URL from cloudflared output (timeout ~30s); fail clear if none
- [x] 2.5 Export/set `PUBLIC_URL` to parsed base URL (no trailing slash)

## 3. App supervision + cleanup

- [x] 3.1 Start `deno run -A main.ts` (or project task) as child with `PUBLIC_URL` in env
- [x] 3.2 Trap INT/TERM/EXIT: kill Deno and cloudflared children the script started
- [x] 3.3 If Deno exits, stop cloudflared (when owned) and exit with Deno’s status
- [x] 3.4 Print projector URL and join/`PUBLIC_URL` on successful start

## 4. Project wiring + docs

- [x] 4.1 Add `deno.json` task `start:tunnel` pointing at the script
- [x] 4.2 Update README: recommend tunnel script for training rooms; keep LAN-only `deno task start`
- [x] 4.3 Smoke: script fails without cloudflared (no PUBLIC_URL); with mock/manual path document how to verify cleanup on Ctrl+C
