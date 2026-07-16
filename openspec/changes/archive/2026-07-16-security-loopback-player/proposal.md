## Why

Host-side projector APIs had no browser origin check, so a malicious page could CSRF `advance`/`reset` against `127.0.0.1` when the session UUID was known. Quiz Markdown rendered via `marked` without sanitization, so untrusted `quiz.json` could XSS host and players under `script-src 'unsafe-inline'`. Player bound `0.0.0.0` for LAN joins, widening the attack surface beyond the intended tunnel path.

## What Changes

- **BREAKING (ops):** Drop LAN phone join. Player HTTP listener binds `127.0.0.1` only (same posture as projector). Phones require cloudflared (or equivalent) + `PUBLIC_URL`.
- Projector handler rejects requests whose `Origin` is present and not loopback (`127.0.0.1` / `localhost` / `::1`).
- Client Markdown pipeline: parse with marked, then sanitize with DOMPurify before `innerHTML`.
- Docs/scripts/specs: no LAN-as-supported path; tunnel is the phone path; localhost-only start remains for host-only dry runs.
- **Out of scope:** X-Forwarded-For / CF-Connecting-IP rate-limit trust (document risk only; no code change in this change).

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `player-surface`: Player bind is loopback-only; public access only via tunnel.
- `projector-surface`: Non-local `Origin` rejected on projector listener (CSRF guard for host mutate/state).
- `quiz-config`: Quiz Markdown rendered as sanitized HTML (not raw marked output).
- `tunnel-start`: Messaging and requirements align with loopback player + tunnel-required phones (no LAN-only phone path).

## Impact

- **Code:** `main.ts` (player bind), `src/http.ts` (origin guard), `src/markdown.ts` + player/projector UI embeds, `deno.json` (`dompurify`), README, `scripts/start-with-tunnel.sh`, `docker-compose.yml` notes.
- **Runtime dep:** `npm:dompurify@3` (UMD bundle embedded like marked).
- **Ops:** Operators must use `deno task start:tunnel` (or set `PUBLIC_URL`) for phones; direct Wi‑Fi join without tunnel no longer works.
- **Tests:** Projector origin allow/deny cases; existing handler tests remain valid (missing Origin allowed for non-browser clients).
