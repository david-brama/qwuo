# Qwuo — Live Training Quiz

Run a lockstep quiz on your laptop. You control the big screen (projector). Learners join on their phones by scanning a QR code. No accounts, no cloud quiz SaaS — just Deno, a JSON file, and an optional Cloudflare quick tunnel for phones.

```text
  You (host laptop)                    Learners (phones)
  ┌─────────────────────┐              ┌────────────────┐
  │  Projector :3000    │   QR code    │  Player :3001  │
  │  Next / Back /      │ ──────────►  │  (via tunnel)  │
  │  Filters / Reset    │              │  name + tap    │
  └─────────────────────┘              └────────────────┘
         both bind 127.0.0.1 only
```

## What you get

| Surface | Who | Purpose |
|---------|-----|---------|
| **Projector** | You | Fullscreen-friendly slides, QR join, phase control, filters |
| **Player** | Phones | Join with a name, answer pad, instant correct/incorrect |

**Session phases** (you drive most steps with **Next** / **Back**):

```text
LOBBY → QUESTION → CORRECT → EXPLAIN → LEADERBOARD → … → END
```

- Optional per-question **countdown** can auto-leave `QUESTION` when time is up  
- Choices are **shuffled** for the room (same order on projector and phones)  
- **+1** per correct answer; late joiners start at 0  
- Duplicate display names are allowed  
- Room state is saved under `.qwuo/` so a Deno restart can resume  

---

## Requirements

- [Deno](https://deno.land/) **1.40+** (or 2.x)
- For phones off your laptop: [Docker](https://docs.docker.com/get-docker/) + Compose (default tunnel), **or** [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) on your `PATH`

---

## Quick start (training room)

**Recommended:** one command starts a quick tunnel to the **player** port, sets `PUBLIC_URL`, and runs the app.

```bash
deno task start:tunnel
# same as: ./scripts/start-with-tunnel.sh
```

1. Open the **projector** URL printed in the console (host only), e.g.  
   `http://127.0.0.1:3000/s/<session-uuid>/`
2. Leave the big lobby QR on screen so phones can join.
3. Use **Next** when you are ready for the first question.
4. **Ctrl+C** stops Deno and tears down the tunnel the script started.

Do **not** tunnel the projector port — it is localhost-only on purpose (host controls).

If `PUBLIC_URL` is already set (and no `TUNNEL_TOKEN` / `TUNNEL_NAME`), the script skips starting cloudflared and just runs the app with that join origin.

What the script does for you:

- **URL check:** it only accepts a real `https://<name>.trycloudflare.com` quick-tunnel hostname from the cloudflared output (never `api.trycloudflare.com` from an error line).
- **Health check:** after the app starts, it fetches `PUBLIC_URL/s/<session>/api/state` (local port first, then the public URL). If the public URL does not answer within `HEALTH_WAIT_SECS` (default 60), it prints a loud error and **stops**. `HEALTH_CHECK=0` skips this.
- **Supervision:** if cloudflared exits, it prints a loud warning and restarts it. For a **quick** tunnel the hostname changes on restart: the script restarts the app with the new `PUBLIC_URL` (the session, roster and scores are restored from the snapshot, so the lobby QR is correct again), but **phones on the old URL must rescan the QR and join again** (a new hostname is a new browser origin, so their saved player id is gone). A named tunnel avoids this.

### Stable hostname (named tunnel, recommended for the course)

A quick tunnel has no uptime guarantee and gets a new random hostname on every start. A named tunnel keeps one fixed hostname (needs a Cloudflare account and a domain on Cloudflare).

**Token (works with Docker or native cloudflared):**

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → **Create a tunnel** (cloudflared) → copy the token.
2. Add a **public hostname**, e.g. `quiz.example.com`, with service:
   - Docker backend: `http://host.docker.internal:3001`
   - Native backend: `http://localhost:3001`
3. Start:

```bash
TUNNEL_TOKEN='<token>' PUBLIC_URL=https://quiz.example.com deno task start:tunnel
```

The token is passed to cloudflared through the environment (not the command line) and is never printed.

**Locally managed tunnel (native cloudflared only):** after `cloudflared tunnel login`, `cloudflared tunnel create qwuo` and `cloudflared tunnel route dns qwuo quiz.example.com`:

```bash
TUNNEL_NAME=qwuo PUBLIC_URL=https://quiz.example.com TUNNEL_MODE=native deno task start:tunnel
```

### Tunnel settings

| Env var | Default | Meaning |
|---------|---------|---------|
| `TUNNEL_MODE` | `auto` | `auto`: Docker Compose first, then native `cloudflared`. `docker`: Compose only (`docker-compose.yml`, image pinned to `cloudflare/cloudflared:2026.10.5`). `native`: `cloudflared` on PATH only (handy on Linux if Docker can’t reach host loopback) |
| `TUNNEL_TOKEN` | _(unset)_ | Named tunnel token → `cloudflared tunnel run`; needs `PUBLIC_URL` |
| `TUNNEL_NAME` | _(unset)_ | Locally managed named tunnel (native only); needs `PUBLIC_URL` |
| `URL_WAIT_SECS` | `30` | Max wait for the quick-tunnel URL |
| `HEALTH_CHECK` | `1` | `0` = skip the public URL check |
| `HEALTH_WAIT_SECS` | `60` | Max wait for the app / public URL to answer |
| `SUPERVISE_INTERVAL` | `2` | Seconds between cloudflared liveness checks |
| `TUNNEL_RESTART_DELAY` | `3` | Seconds before restarting a dead cloudflared |

After Ctrl+C, sanity-check for orphans:

```bash
docker compose ps
pgrep -fl cloudflared || echo "no native cloudflared"
```

---

## Local only (no phones)

Both HTTP listeners bind **`127.0.0.1` only** — no LAN exposure without a tunnel.

```bash
deno task start
# or: deno run -P main.ts
# hot reload while editing code: deno task dev
```

Console prints something like:

| Line | Meaning |
|------|---------|
| `Projector (localhost only): http://127.0.0.1:3000/s/<uuid>/` | Open this on the host |
| `Player (localhost; tunnel this): http://127.0.0.1:3001/s/<uuid>/` | Same machine only unless tunneled |
| `Player join URL (QR): …` | Encoded in the lobby QR |

Session id is also written to `.qwuo/current` so a restart keeps the same room path.

---

## Manual tunnel (optional)

If you prefer to run the tunnel yourself:

```bash
# Docker
PLAYER_PORT=3001 docker compose up cloudflared
# copy https://….trycloudflare.com from logs, then:
PUBLIC_URL=https://YOUR-SUBDOMAIN.trycloudflare.com deno task start
```

```bash
# Native
cloudflared tunnel --url http://localhost:3001
PUBLIC_URL=https://YOUR-SUBDOMAIN.trycloudflare.com deno task start
```

---

## Running a session (host checklist)

1. **Start** with `deno task start:tunnel` (or local + manual tunnel).
2. **Open projector** at the printed `/s/<uuid>/` URL.
3. Optional: **Filter** panel (LOBBY only) to narrow questions for this room.
4. Optional: **Fullscreen** control; **text size** slider for long stems.
5. Learners scan QR → enter a display name (max 40 characters; up to 500 participants).
6. **Next** leaves LOBBY into the first QUESTION.
7. During QUESTION, phones answer once; they see correct/incorrect immediately. You still control the room pace with Next/Back (unless a countdown expires).
8. Flow: show correct → explanation → leaderboard → next question… → END.
9. **Back** steps one phase backward (does not wipe scores). Back from CORRECT shows the question again **read-only** ("Answers closed"): no timer, answers are rejected, Next reveals it again. Re-entering a question whose answer was **not** shown yet starts a full timer.
10. **Reset** (soft): back to LOBBY, clear runtime filters and per-question answers, **keep** names, **zero** scores, **same** session URL/QR. Snapshot is updated, not deleted.

Need a brand-new empty room (no roster)? Use `SESSION_FRESH=1` at boot (see [Configuration](#configuration)).

---

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `PUBLIC_URL` | _(unset)_ | Public origin for QR / join (no trailing path). App appends `/s/{sessionId}`. Fallback origin: `http://localhost:{PLAYER_PORT}` |
| `PROJECTOR_PORT` | `3000` | Projector HTTP port (`127.0.0.1`) |
| `PLAYER_PORT` | `3001` | Player HTTP port (`127.0.0.1`; this is what you tunnel) |
| `QUIZ_PATH` | `quiz.json` | Quiz content file |
| `QUIZ_FILTER` | _(unset)_ | Startup metadata filters: `;`-separated `key=value` (see [Filters](#filters)) |
| `SESSIONS_DIR` | `.qwuo` | Snapshots `{uuid}.json` + active pointer `current` |
| `SESSION_ID` | _(unset)_ | Pin a session UUID; otherwise restore pointer or mint new |
| `SESSION_FRESH` | _(unset)_ | `1` / `true` / `yes` → wipe that session’s snapshot on boot and start empty LOBBY (new UUID unless `SESSION_ID` is set) |
| `TRUST_PROXY_HEADER` | _(unset)_ | Header that holds the real client IP for rate limiting, e.g. `cf-connecting-ip`. Unset → client IP headers (`X-Forwarded-For`, `cf-connecting-ip`, `x-real-ip`, …) are **ignored** and the socket address is used. For `x-forwarded-for` the right-most entry is used. Only set this when every request reaches the player port through that proxy |

**CLI** (after `--` when using Deno tasks):

```bash
deno run -P main.ts -- --filter live=true
./scripts/start-with-tunnel.sh -- --filter live=true
```

Env filters are applied first, then CLI filters; together they follow the same AND/OR rules.

> **Permissions:** `deno.json` grants read access to `quiz.json`, `logo.png`, and `./.qwuo` by default. A custom `QUIZ_PATH` outside those paths needs a matching permission entry (or a broader `-A` for experiments).

### Optional logo

Drop a gitignored `logo.png` next to `main.ts` (repo root). If present at startup, it shows top-right on projector and player. Missing file is fine.

---

## Quiz file

Content lives in JSON (default `quiz.json`, often gitignored so banks stay private). Shape is documented in **`quiz.schema.json`** and enforced at load by `validateQuiz`.

### Minimal example

```json
{
  "$schema": "quiz.schema.json",
  "title": "My Training",
  "config": {
    "slideMetadataKeys": ["domain", "use-case"],
    "countdownSeconds": 45
  },
  "metadata": {
    "credential": "Optional exam name",
    "domains": ["Tool Design & MCP Integration"],
    "use_cases": ["Customer Support Resolution Agent"],
    "note": "Catalogs constrain matching question fields when present."
  },
  "questions": [
    {
      "text": "What drives the agent loop?",
      "choices": ["stop_reason", "A fixed sleep timer", "HTTP status codes only"],
      "correct": 0,
      "explain": "Keep looping while stop_reason is tool_use; stop on end_turn.",
      "countdownSeconds": 60,
      "metadata": {
        "id": "Q1",
        "live": true,
        "domain": "Tool Design & MCP Integration",
        "use-case": "Customer Support Resolution Agent"
      }
    }
  ]
}
```

### Field guide

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | Non-empty quiz title |
| `questions` | yes | At least one question |
| `questions[].text` | yes | Prompt; **Markdown (GFM)** allowed |
| `questions[].choices` | yes | ≥ 2 non-empty strings (authoring order on disk) |
| `questions[].correct` | yes | **0-based** index into `choices` (must be in range) |
| `questions[].explain` | no | After reveal; Markdown; empty → “No explanation” on projector |
| `questions[].countdownSeconds` | no | Override quiz default; see [Countdown](#countdown) |
| `questions[].metadata` | no | Open bag for filters / slides (`domain`, `use-case`, `live`, …) |
| `config.slideMetadataKeys` | no | Ordered metadata keys shown on **projector** slides |
| `config.countdownSeconds` | no | Default QUESTION timer (seconds) |
| `metadata` (root) | no | Authoring + optional catalogs |

**Catalogs (optional but recommended for large banks):**

| Root catalog | Question field |
|--------------|----------------|
| `metadata.domains` | `metadata.domain` |
| `metadata.use_cases` | `metadata.use-case` |

When a catalog array is present, every question that sets the paired key must use an **exact** catalog string (no case-folding). Omit the catalog to allow free-form values. Non-catalog keys (`id`, `live`, `task-statement`, …) stay free-form.

**Load rules worth knowing:**

- Invalid or missing file → process exits with a clear error (no half-started servers).
- Filters and runtime panel never rewrite the file on disk.
- Fingerprint for session restore uses **title + question text/choices/correct/explain only**. Edits to `metadata`, `config`, or `countdownSeconds` alone do **not** invalidate a snapshot.
- `quiz.json` is treated as a **trusted** authoring source; Markdown is sanitized before HTML display. Choice labels stay plain text.

### Countdown

Timers are optional and only apply in the **QUESTION** phase.

| Setting | Role |
|---------|------|
| `config.countdownSeconds` | Quiz-wide default |
| `questions[].countdownSeconds` | Per-question override |

**Resolution:** question override → quiz default → none.

| Effective value | Behavior |
|-----------------|----------|
| unset | Host-paced only (classic) |
| `0` | Explicitly off (use on a question to opt out of a positive default) |
| `> 0` | Server starts a deadline; UIs show remaining whole seconds |

When the deadline hits, the session advances **QUESTION → CORRECT** with the same scoring as host **Next** (unanswered = 0). Host Next/Back still work anytime. **Back** from CORRECT does **not** restart the timer (the question is read-only once its answer was shown); re-entering a not-yet-revealed QUESTION starts a **new full** timer (does not resume leftover seconds).

---

## Filters

Two layers stack:

1. **Startup filters** (`QUIZ_FILTER` / `--filter`) shrink the process bank for the whole process.  
2. **Projector Filters panel** (LOBBY) can narrow further for this room only.

Startup-dropped questions **cannot** be brought back by the panel.

### Startup filters

- **AND** across different keys  
- **OR** for multiple values of the **same** key  
- Match rules: string equality; booleans `true`/`false`; finite numbers; `null` as `"null"`; arrays match if any element matches  

Always quote values with spaces or shell specials — the app does not reassemble split tokens:

```bash
# Live only
deno run -P main.ts -- --filter live=true

# Domain with spaces and &
deno run -P main.ts -- --filter "domain=Tool Design & MCP Integration"

# live AND use-case (hyphenated key)
deno run -P main.ts -- \
  --filter live=true \
  --filter "use-case=Customer Support Resolution Agent"

# live AND (domain A OR domain B)
deno run -P main.ts -- \
  --filter live=true \
  --filter "domain=Tool Design & MCP Integration" \
  --filter "domain=Prompt Engineering & Structured Output"

# Env form
QUIZ_FILTER='live=true;domain=Tool Design & MCP Integration' deno run -P main.ts

# Through the tunnel script
./scripts/start-with-tunnel.sh -- --filter live=true
```

Zero matches or a bad flag → non-zero exit, no servers.

### Projector filter panel (runtime)

- Right-side **Filters** in **LOBBY** only (hidden after you advance; Back/Reset to return)
- One dropdown per metadata key discovered in the bank (**Any** = unconstrained)
- **Intersection only** (one value per key — no multi-value OR in the panel)
- **Clear** restores the full process bank (after startup filters)
- **Reset** also clears runtime filters

---

## Session persistence

After join, answer, advance, back, soft reset, filter apply, and countdown auto-advance, state is written to disk:

| Path | Contents |
|------|----------|
| `{SESSIONS_DIR}/{sessionId}.json` | Phase, question index, roster, scores, answers, play choice order, runtime filters, countdown deadline |
| `{SESSIONS_DIR}/current` | Active session UUID (so restart keeps the same URL) |

**Restore** on boot when the snapshot is valid and the quiz fingerprint still matches. Otherwise you get a fresh LOBBY for that id.

**Fresh empty room:**

```bash
SESSION_FRESH=1 deno task start
# or start:tunnel with SESSION_FRESH=1
```

**Soft Reset** (projector button): LOBBY + clear filters/answers; **keep** participants, **zero** their scores; **same** UUID (QR stays valid). Does **not** delete the snapshot file — it saves the soft-reset state.

Snapshots are host-disk only (no cloud sync). Delete `.qwuo/` entries if you want a manual wipe.

---

## Security model (short)

- Projector and player both listen on **loopback only**
- Public phones should only reach the **player** port via an ad-hoc tunnel you control
- Projector mutating APIs reject non-local `Origin` headers
- Rate limits are built for a whole room behind **one office NAT IP**:
  - Join: 1200 per minute per client IP
  - Answer: 30 per minute per **participant id** (plus a 6000/min per-IP backstop)
  - Client IP = socket address; proxy headers are only trusted with `TRUST_PROXY_HEADER`
- No authentication, no multi-tenant isolation — one room per process

Treat the host machine and `quiz.json` as the trust boundary.

---

## Project layout

```text
main.ts                      Boot: load quiz → restore session → both servers
quiz.schema.json             Documented JSON Schema for quiz files
quiz.json                    Your bank (gitignored sample; create your own)
docker-compose.yml           cloudflared (quick or named) tunnel → player port
scripts/start-with-tunnel.sh deno task start:tunnel (health check + supervision)
scripts/tunnel-lib.sh        Quick-tunnel URL parsing (tested by scripts/tunnel_test.ts)
src/
  config.ts                  Env + CLI filters
  quiz.ts                    Load, validate, filter helpers, countdown resolve
  session.ts                 Phases, join, answer, shuffle, countdown, filters
  persist.ts                 Snapshot fingerprint / save / restore
  http.ts                    Projector + player handlers
  projector_ui.ts            Host UI
  player_ui.ts               Phone UI
  styles.ts                  CSS
  qr.ts                      Join QR SVG
  markdown.ts                Marked + DOMPurify bundles for the browser
openspec/                    Specs and archived change proposals
```

### Useful Deno tasks

| Task | Command purpose |
|------|-----------------|
| `deno task start` | Run the app |
| `deno task start:tunnel` | Tunnel + app |
| `deno task dev` | Watch mode |
| `deno task test` | Unit tests under `src/` and tunnel script tests under `scripts/` |

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Phones can’t open QR URL | Use `start:tunnel` or set `PUBLIC_URL`; confirm only **player** is tunneled |
| QR points at localhost on phones | `PUBLIC_URL` missing when the process started |
| Quiz won’t start | Check load error on stderr; validate against `quiz.schema.json` |
| Filter matches 0 | Exact key/value strings; `use-case` not `use_case`; quote spaces |
| Old scores after restart | Expected if snapshot matches quiz — use **Reset** or `SESSION_FRESH=1` |
| Snapshot ignored after editing quiz | Fingerprint changed (text/choices/correct/explain/title) — new LOBBY is intentional |
| Custom `QUIZ_PATH` permission error | Add the path under `deno.json` → `permissions.default.read` |
| Docker tunnel can’t reach app (Linux) | Try `TUNNEL_MODE=native` |
| `Health check FAILED: PUBLIC_URL does not answer` | Quick tunnel DNS can be slow: retry, or raise `HEALTH_WAIT_SECS`. Named tunnel: check the public hostname’s service URL in the dashboard |
| `cloudflared EXITED` / `hostname CHANGED` | The script restarted the tunnel. Quick tunnel: phones must rescan the new QR and join again. Use a named tunnel to avoid this |

---

## Design notes

- One live session per process; URL space is `/s/{sessionId}/…` on both ports  
- Player clients poll `/api/state` about once per second; participant id lives in `localStorage` for reattach (including after server restart when the snapshot still has that id)  
- Host **Next** / **Back** are the primary control surface; countdown is an optional pacing aid, not a required game mode  
- Specs under `openspec/specs/` describe intended behavior for contributors  

Happy training.
