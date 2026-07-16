# Live Training Quiz

Ad-hoc lockstep training quiz for instructor-led sessions. Host runs Deno on a laptop; phones join via QR (optional cloudflared tunnel). No accounts, no SaaS.

## Requirements

- [Deno](https://deno.land/) 1.40+ (or 2.x)
- [Docker](https://docs.docker.com/get-docker/) + Compose for public phone access (runs `cloudflare/cloudflared:latest`)
- Optional: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) on PATH if you prefer native (`TUNNEL_MODE=native`)

## Quick start (training room — recommended)

One command starts a Cloudflare quick tunnel to the **player** port (via Docker Compose by default), sets `PUBLIC_URL`, and runs the app:

```bash
deno task start:tunnel
# or: ./scripts/start-with-tunnel.sh
```

Then open the **projector** session URL printed in the console (host only), e.g.:

```text
http://127.0.0.1:3000/s/<session-uuid>/
```

- Phones scan the large lobby QR (tunnel origin + `/s/<session-uuid>`)
- **Ctrl+C** stops both the quiz and the tunnel container
- Do **not** tunnel the projector port (it binds to `127.0.0.1` only)

If `PUBLIC_URL` is already set, the script skips cloudflared and starts the app with that URL.

Tunnel backend (`TUNNEL_MODE`):

| Value | Behavior |
|-------|----------|
| `auto` (default) | Docker Compose first, then native `cloudflared` |
| `docker` | `docker-compose.yml` → `cloudflare/cloudflared:latest` only |
| `native` | `cloudflared` on PATH only |

### Cleanup check

After Ctrl+C, confirm no orphan tunnel:

```bash
docker compose ps
pgrep -fl cloudflared || echo "no native cloudflared"
```

## Local only (no phones)

Both ports bind `127.0.0.1` only (no LAN). Without a tunnel, only the host can open the player URL:

```bash
deno task start
# or: deno run -P main.ts
```

- **Projector:** http://127.0.0.1:3000/s/\<session-uuid\>/  
- **Player:** http://127.0.0.1:3001/s/\<session-uuid\>/  

Session UUID is printed at boot (and stored in `.qwuo/current`). For phones, use `deno task start:tunnel` (or set `PUBLIC_URL`).

## Manual tunnel (optional)

Docker Compose only:

```bash
PLAYER_PORT=3001 docker compose up cloudflared
# copy the trycloudflare URL from logs, then:
PUBLIC_URL=https://YOUR-SUBDOMAIN.trycloudflare.com deno task start
```

Or native binary:

```bash
cloudflared tunnel --url http://localhost:3001
PUBLIC_URL=https://YOUR-SUBDOMAIN.trycloudflare.com deno task start
```

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `PUBLIC_URL` | _(unset)_ | Public base URL for QR / join (e.g. cloudflared URL). Fallback: `http://localhost:PLAYER_PORT`. App appends `/s/{sessionId}` |
| `PROJECTOR_PORT` | `3000` | Projector HTTP port (localhost only) |
| `PLAYER_PORT` | `3001` | Player HTTP port (`127.0.0.1` only; expose via cloudflared) |
| `QUIZ_PATH` | `quiz.json` | Path to quiz content file |
| `SESSIONS_DIR` | `.qwuo` | Directory for session snapshots (`{uuid}.json`) and active pointer (`current`) |
| `SESSION_ID` | _(unset)_ | Optional fixed session UUID; otherwise restore via pointer or mint a new one |
| `SESSION_FRESH` | _(unset)_ | Set to `1` / `true` / `yes` to wipe active snapshot on boot and start empty LOBBY |

`SESSION_PATH` is removed. Old `.qwuo/session.json` is not loaded; snapshots are now `{SESSIONS_DIR}/{uuid}.json`.

## Quiz file

Edit `quiz.json` (or point `QUIZ_PATH` at another file):

```json
{
  "title": "My Training",
  "questions": [
    {
      "text": "Question text?",
      "choices": ["A", "B", "C"],
      "correct": 0,
      "explain": "Optional explanation shown after the reveal."
    }
  ]
}
```

- `correct` is a **0-based** index into `choices`
- At least 2 choices per question
- `text` and `explain` support Markdown (GFM); `quiz.json` is trusted source, rendered as HTML on projector/player
- `explain` is optional (projector shows “No explanation” if missing)
- Invalid or missing file → process exits with a clear error

## Session flow

```
LOBBY → QUESTION → CORRECT → EXPLAIN → LEADERBOARD → (next QUESTION | END)
```

- Host advances with the projector **Next** button only
- Players get instant correct/incorrect feedback after answering
- +1 per correct answer; late join allowed (score starts at 0)
- Duplicate display names allowed
- No timers; no accounts

## Session persistence

Live session state (phase, question index, participants, scores, per-question answers) is written to a local JSON snapshot after each join, answer, and host advance. Restarting Deno restores that room when the quiz content still matches.

- Snapshot path: `{SESSIONS_DIR}/{sessionId}.json` (default dir `.qwuo`; filename stem = session UUID)
- Active id pointer: `{SESSIONS_DIR}/current` so restart keeps the same room URL without setting `SESSION_ID`
- Room UI and APIs live under `/s/{sessionId}/` on both ports; join QR encodes `{PUBLIC_URL or local}/s/{sessionId}`
- Quiz identity is fingerprinted; if you change `quiz.json` content, an old snapshot is ignored and a new LOBBY starts
- Fresh room without deleting the file by hand:
  - Boot: `SESSION_FRESH=1 deno task start` (clears snapshot; mints new UUID unless `SESSION_ID` is set)
  - Runtime: `POST /s/{sessionId}/api/reset` on the **projector** port only (player port returns 403). Keeps the same UUID so printed QR stays valid
- Snapshot is host-disk only (no cloud sync). Delete the file or reset when the training is done if you do not want scores left on disk

## Layout

```
main.ts                      Entry: load quiz, restore snapshot, start both servers
quiz.json                    Sample content
docker-compose.yml           cloudflare/cloudflared:latest (player port)
scripts/start-with-tunnel.sh Tunnel + app launcher (deno task start:tunnel)
src/
  config.ts          Env config
  quiz.ts            Load + validate quiz JSON
  session.ts         Phase machine, join, answer, scores, hydrate/reset
  persist.ts         Local JSON snapshot load/save
  http.ts            Projector + player HTTP handlers
  projector_ui.ts    Projector HTML/CSS/JS
  player_ui.ts       Player HTML/CSS/JS
  styles.ts          Shared styling
  qr.ts              QR SVG for join URL
```

## Notes

- Session survives Deno restart via the local snapshot and pointer (use `SESSION_FRESH` or projector reset for a clean room)
- Player clients poll `/s/{sessionId}/api/state` about once per second
- Participant id is stored in the phone’s `localStorage` so reload reattaches — including after server restart when the snapshot still has that id
