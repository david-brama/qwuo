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
| `QUIZ_FILTER` | _(unset)_ | Optional `;`-separated metadata filters (`key=value`). See [Question filters](#question-filters) |
| `SESSIONS_DIR` | `.qwuo` | Directory for session snapshots (`{uuid}.json`) and active pointer (`current`) |
| `SESSION_ID` | _(unset)_ | Optional fixed session UUID; otherwise restore via pointer or mint a new one |
| `SESSION_FRESH` | _(unset)_ | Set to `1` / `true` / `yes` to wipe active snapshot on boot and start empty LOBBY |

`SESSION_PATH` is removed. Old `.qwuo/session.json` is not loaded; snapshots are now `{SESSIONS_DIR}/{uuid}.json`.

### Optional logo

Place a gitignored `logo.png` next to `main.ts` (repo root). If present at startup, it appears in the **top right** of the projector and player UIs. Missing file is fine — branding is simply omitted.

### Question filters

At startup you can keep only questions whose per-question `metadata` matches one or more filters. Filters do **not** rewrite the quiz file; they only shrink the in-memory bank for that process.

**Sources** (merged: env first, then CLI):

- Env: `QUIZ_FILTER` — `;`-separated `key=value` segments
- CLI: repeatable `--filter key=value` or `--filter=key=value`

**Semantics:** **AND** across different keys; **OR** for multiple values of the same key.

**Quoting (required for spaces and `&`):** Metadata values often contain spaces (e.g. domain names). The shell splits unquoted words **before** the app runs; the app does **not** reassemble split tokens. Always quote values that contain spaces or shell-special characters:

```bash
# Live questions only
deno run -P main.ts -- --filter live=true

# One domain (spaces + &)
deno run -P main.ts -- --filter "domain=Tool Design & MCP Integration"

# live AND a use-case (key is use-case with a hyphen, not use_case)
deno run -P main.ts -- \
  --filter live=true \
  --filter "use-case=Customer Support Resolution Agent"

# live AND (domain A OR domain B)
deno run -P main.ts -- \
  --filter live=true \
  --filter "domain=Tool Design & MCP Integration" \
  --filter "domain=Prompt Engineering & Structured Output"

# Env form (quote the whole assignment)
QUIZ_FILTER='live=true;domain=Tool Design & MCP Integration' deno run -P main.ts

# Tunnel script forwards args
./scripts/start-with-tunnel.sh -- --filter live=true --filter "domain=Tool Design & MCP Integration"
```

If filters match **zero** questions, or a filter is malformed / an unknown CLI flag appears, the process exits with a non-zero status and does not start servers.

### Projector filter panel (runtime)

The projector UI has a **right-side Filters panel** for further narrowing the process bank during a room without restarting.

- One **dropdown** (single-select) per question-metadata key; values discovered from the bank (plus **Any**)
- Selected keys combine with **intersection only** (one value per key — no multi-value OR in the panel)
- Panel is shown **only in LOBBY** (hidden once the session advances; use Back or Reset to return)
- **Clear** removes runtime filters and restores the full process bank
- Host **Reset** returns to LOBBY and clears runtime filters; participants and scores are kept
- Startup `--filter` / `QUIZ_FILTER` still define the maximum bank and may use OR within a key; the panel cannot bring back startup-dropped questions


## Quiz file

Edit `quiz.json` (or point `QUIZ_PATH` at another file):

```json
{
  "title": "My Training",
  "config": {
    "slideMetadataKeys": ["domain", "use-case"]
  },
  "questions": [
    {
      "text": "Question text?",
      "choices": ["A", "B", "C"],
      "correct": 0,
      "explain": "Optional explanation shown after the reveal.",
      "metadata": {
        "id": "Q1",
        "live": true,
        "domain": "Tool Design & MCP Integration",
        "use-case": "Customer Support Resolution Agent"
      }
    }
  ],
  "metadata": {
    "credential": "Optional exam name",
    "domains": ["Tool Design & MCP Integration"],
    "use_cases": ["Customer Support Resolution Agent"],
    "note": "Catalogs list allowed values for question domain / use-case."
  }
}
```

- `correct` is a **0-based** index into `choices`
- At least 2 choices per question
- `text` and `explain` support Markdown (GFM); `quiz.json` is trusted source, rendered as HTML on projector/player
- `explain` is optional (projector shows “No explanation” if missing)
- Optional root `metadata` holds authoring fields and **catalogs**: `domains` / `use_cases` are arrays of allowed strings for per-question `metadata.domain` and `metadata.use-case`. When a catalog array is present, load rejects questions whose paired value is missing from that list (exact string match). Omit a catalog to allow free-form values for that field.
- Per-question `metadata` is open-ended (`id`, `live`, `task-statement`, …) for [question filters](#question-filters) and authoring; it does not change scoring or the quiz identity fingerprint
- Optional root `config.slideMetadataKeys` is an ordered list of question metadata keys to show on the **projector** slide (plain text). Missing keys on a question are skipped. Player UI does not show this metadata. `config` is not part of the fingerprint
- Filters never rewrite the quiz file on disk
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
  - Runtime: `POST /s/{sessionId}/api/reset` on the **projector** port only (player port returns 403). Soft reset: LOBBY + clear filters, keep roster/scores; same UUID so printed QR stays valid
- Snapshot is host-disk only (no cloud sync). Delete the snapshot file or use `SESSION_FRESH` when you want a clean room without prior scores

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

- Session survives Deno restart via the local snapshot and pointer (use `SESSION_FRESH` for a clean room without prior roster)
- Player clients poll `/s/{sessionId}/api/state` about once per second
- Participant id is stored in the phone’s `localStorage` so reload reattaches — including after server restart when the snapshot still has that id
