# Live Training Quiz

Ad-hoc lockstep training quiz for instructor-led sessions. Host runs Deno on a laptop; phones join via QR (optional cloudflared tunnel). No accounts, no SaaS.

## Requirements

- [Deno](https://deno.land/) 1.40+ (or 2.x)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) for public phone access (training rooms)

## Quick start (training room — recommended)

One command starts a Cloudflare quick tunnel to the **player** port, sets `PUBLIC_URL`, and runs the app:

```bash
deno task start:tunnel
# or: ./scripts/start-with-tunnel.sh
```

Then open the **projector** on the host only:

```text
http://127.0.0.1:3000
```

- Phones scan the large lobby QR (points at the tunnel URL)
- **Ctrl+C** stops both the quiz and the tunnel
- Do **not** tunnel the projector port (it binds to `127.0.0.1` only)

If `PUBLIC_URL` is already set, the script skips cloudflared and starts the app with that URL.

### Cleanup check

After Ctrl+C, confirm no orphan tunnel:

```bash
pgrep -fl cloudflared || echo "no cloudflared"
```

## LAN only (no tunnel)

Same Wi‑Fi as the host; no cloudflared required:

```bash
deno task start
# or: deno run -A main.ts
```

- **Projector:** http://127.0.0.1:3000  
- **Player:** http://\<your-lan-ip\>:3001  

## Manual tunnel (optional)

If you prefer two terminals:

```bash
cloudflared tunnel --url http://localhost:3001
PUBLIC_URL=https://YOUR-SUBDOMAIN.trycloudflare.com deno task start
```

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `PUBLIC_URL` | _(unset)_ | Public base URL for QR / join (e.g. cloudflared URL). Fallback: `http://localhost:PLAYER_PORT` |
| `PROJECTOR_PORT` | `3000` | Projector HTTP port (localhost only) |
| `PLAYER_PORT` | `3001` | Player HTTP port (`0.0.0.0`) |
| `QUIZ_PATH` | `quiz.json` | Path to quiz content file |
| `SESSION_PATH` | `.qwuo/session.json` | Local snapshot of live session (phase, participants, answers, scores) |
| `SESSION_FRESH` | _(unset)_ | Set to `1` / `true` / `yes` to wipe snapshot on boot and start empty LOBBY |

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

- Default file: `.qwuo/session.json` (override with `SESSION_PATH`)
- Quiz identity is fingerprinted; if you change `quiz.json` content, an old snapshot is ignored and a new LOBBY starts
- Fresh room without deleting the file by hand:
  - Boot: `SESSION_FRESH=1 deno task start`
  - Runtime: `POST /api/reset` on the **projector** port only (player port returns 403)
- Snapshot is host-disk only (no cloud sync). Delete the file or reset when the training is done if you do not want scores left on disk

## Layout

```
main.ts                      Entry: load quiz, restore snapshot, start both servers
quiz.json                    Sample content
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

- Session survives Deno restart via the local snapshot (use `SESSION_FRESH` or projector reset for a clean room)
- Player clients poll `/api/state` about once per second
- Participant id is stored in the phone’s `localStorage` so reload reattaches — including after server restart when the snapshot still has that id
