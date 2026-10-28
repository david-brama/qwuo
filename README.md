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
- Duplicate display names get a suffix: a second "Dana" (case and spaces ignored) joins as "Dana (2)", on the phone and the leaderboard  
- Room state is saved under `.qwuo/` so a Deno restart can resume  

---

## Requirements

- [Deno](https://deno.land/) **1.40+** (or 2.x)
- For phones off your laptop: [Docker](https://docs.docker.com/get-docker/) + Compose (default tunnel), **or** [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) on your `PATH`

---

## Before the course

1. **Pick the question set** (details: [Pick the question set](#pick-the-question-set)):
   - `QUIZ_FILTER='live=true'` — the questions marked live, or
   - `QUIZ_IDS='Q1,Q7,Q12'` — exactly these questions, in this order.
2. **Set up the named tunnel (one time).** With a named tunnel the join URL and the QR stay the same when the script or the tunnel restarts. You need a Cloudflare account, a domain on Cloudflare, and `cloudflared` on your `PATH` (already logged in: `~/.cloudflared/cert.pem` exists). Do these steps yourself:
   ```bash
   cloudflared tunnel create <tunnel-name>                           # writes ~/.cloudflared/<tunnel-id>.json
   cloudflared tunnel route dns <tunnel-name> quiz.<your-domain>     # DNS record (see the warning below)
   cp .env.tunnel.example .env.tunnel                                # gitignored
   ```
   Then set these lines in `.env.tunnel`:
   ```bash
   TUNNEL_NAME=<tunnel-name>
   PUBLIC_URL=https://quiz.<your-domain>
   # optional: TUNNEL_CRED_FILE=~/.cloudflared/<tunnel-id>.json (full path)
   ```
   The script runs `cloudflared tunnel --config <own temp file> run --url http://127.0.0.1:$PLAYER_PORT <tunnel-name>`. It uses its own config file, so other tunnel configs in `~/.cloudflared` (`config.yml`, `config-*.yml`) have no effect.

   **Token alternative** (dashboard tunnel; works with Docker or native cloudflared): Cloudflare dashboard → Zero Trust → Networks → Tunnels → create a tunnel, copy the token, and add the public hostname `quiz.<your-domain>` with service `http://localhost:3001` (native) or `http://host.docker.internal:3001` (Docker). Then in `.env.tunnel` set `TUNNEL_TOKEN=<token>` and `PUBLIC_URL=https://quiz.<your-domain>` instead. The script never prints the token. Details: [Stable hostname](#stable-hostname-named-tunnel-recommended-for-the-course).
3. **Start:**
   ```bash
   QUIZ_FILTER='live=true' deno task start:tunnel
   ```
   It must print `Health check OK: phones can reach https://quiz.<your-domain>`. Environment variables win over `.env.tunnel`. If no named tunnel is set, or the named tunnel fails its health check, the script starts a **quick tunnel** and shows a loud `QUICK TUNNEL` warning: the URL and the QR then **change on every restart**. Do not continue with a quick tunnel by accident: fix the named tunnel, then start again.
4. **Check the layout** on this laptop: `deno task test:ui` (about 2 minutes). It must end with `OK`.
5. **Learn the keys** (keyboard or clicker) on the projector: → · PageDown · Space · Enter = **Next**; ← · PageUp = **Back**. Any key or mouse movement also shows the hidden host controls. No key does Reset.

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

Tunnel settings come from the environment and from `.env.tunnel` (see `.env.tunnel.example`); the environment wins. If `PUBLIC_URL` is set (and no `TUNNEL_TOKEN` / `TUNNEL_NAME`), the script skips starting cloudflared and just runs the app with that join origin.

What the script does for you:

- **URL check:** it only accepts a real `https://<name>.trycloudflare.com` quick-tunnel hostname from the cloudflared output (never `api.trycloudflare.com` from an error line).
- **Health check:** after the app starts, it fetches `PUBLIC_URL/s/<session>/api/state` (local port first, then the public URL). If the public URL does not answer within `HEALTH_WAIT_SECS` (default 60), it prints a loud error. With a **named** tunnel it then falls back to a quick tunnel (loud warning; the app restarts on the quick URL with the same session); otherwise it **stops**. `HEALTH_CHECK=0` skips this.
- **Supervision:** if cloudflared exits, it prints a loud warning and restarts it. For a **quick** tunnel the hostname changes on restart: the script restarts the app with the new `PUBLIC_URL` (the session, roster and scores are restored from the snapshot, so the lobby QR is correct again), but **phones on the old URL must rescan the QR and join again** (a new hostname is a new browser origin, so their saved player id is gone). A named tunnel avoids this.

### Stable hostname (named tunnel, recommended for the course)

A quick tunnel has no uptime guarantee and gets a new random hostname on every start. A named tunnel keeps one fixed hostname (needs a Cloudflare account and a domain on Cloudflare).

**Token (works with Docker or native cloudflared):**

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → **Create a tunnel** (cloudflared) → copy the token.
2. Add a **public hostname**, e.g. `quiz.<your-domain>`, with service:
   - Docker backend: `http://host.docker.internal:3001`
   - Native backend: `http://localhost:3001`
3. Start:

```bash
TUNNEL_TOKEN='<token>' PUBLIC_URL=https://quiz.<your-domain> deno task start:tunnel
```

The token is passed to cloudflared through the environment (not the command line) and is never printed.

**Locally managed tunnel (native cloudflared only):** after `cloudflared tunnel login`, `cloudflared tunnel create <tunnel-name>` and `cloudflared tunnel route dns <tunnel-name> quiz.<your-domain>` (see [Named tunnel DNS](#named-tunnel-dns)), put `TUNNEL_NAME=<tunnel-name>` and `PUBLIC_URL=https://quiz.<your-domain>` in `.env.tunnel`, or:

```bash
TUNNEL_NAME=<tunnel-name> PUBLIC_URL=https://quiz.<your-domain> TUNNEL_MODE=native deno task start:tunnel
```

The script gives cloudflared its own config file, so `~/.cloudflared/config.yml` (for example from another project) is never used.

### Tunnel settings

| Env var | Default | Meaning |
|---------|---------|---------|
| `TUNNEL_MODE` | `auto` | `auto`: Docker Compose first, then native `cloudflared`. `docker`: Compose only (`docker-compose.yml`, image pinned to `cloudflare/cloudflared:2026.10.5`). `native`: `cloudflared` on PATH only (handy on Linux if Docker can’t reach host loopback) |
| `TUNNEL_TOKEN` | _(unset)_ | Named tunnel token → `cloudflared tunnel run`; needs `PUBLIC_URL` |
| `TUNNEL_NAME` | _(unset)_ | Locally managed named tunnel (native only); needs `PUBLIC_URL` |
| `TUNNEL_CRED_FILE` | _(unset)_ | Credentials JSON for `TUNNEL_NAME` (`--credentials-file`); default: cloudflared finds it by tunnel id |
| `TUNNEL_ENV_FILE` | `.env.tunnel` | File with `TUNNEL_TOKEN` / `TUNNEL_NAME` / `TUNNEL_CRED_FILE` / `PUBLIC_URL` (parsed, not sourced; environment wins) |
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
4. Optional: **Fullscreen** control; **text size** slider. Slides size themselves to the screen: text starts large and shrinks only as much as needed, so a slide never scrolls (checked at 1024×768 … 1920×1080, see [Projector layout check](#projector-layout-check)).
5. Learners scan QR → enter a display name (max 40 characters; up to 500 participants).
6. **Next** leaves LOBBY into the first QUESTION.
7. During QUESTION, phones answer once and see only **Answer locked in** with the choice they picked; correct/incorrect and the correct answer appear on the phone when the answer is revealed (CORRECT), so nobody can tell neighbours early. A player who did not answer sees **You didn't answer** and the correct answer. The result comes from the server, so it survives a page reload. You still control the room pace with Next/Back (unless a countdown expires).
   The header shows **X of N answered**: X = answers to this question, N = participants who can answer it (phone polled in the last 15 s, or already answered), so closed or abandoned phones do not inflate N. The footer keeps `joined`, `online` and `active` (≥ 2 answers in the last 4 questions).
8. Flow: show correct → explanation → leaderboard → next question… → END. The explanation slide repeats the question and the correct choice, marked by ✓, bold text and a thick outline. On screens 900 px tall or more it also shows the other choices, unless that would make the explanation text too small. The leaderboard shows the top 10 with scores out of the questions asked so far; tied scores share a rank (1, 1, 3). END shows the final standings on a podium.
9. **Back** steps one phase backward (does not wipe scores). Back from CORRECT shows the question again **read-only** ("Answers closed"): no timer, answers are rejected, Next reveals it again. Re-entering a question whose answer was **not** shown yet starts a full timer.
10. **Reset** (soft): back to LOBBY, clear runtime filters and per-question answers, **keep** names, **zero** scores, **same** session URL/QR. Snapshot is updated, not deleted.

**Presenter keys** (keyboard or clicker) on the projector:

| Key | Action |
|-----|--------|
| → · PageDown · Space · Enter | Next |
| ← · PageUp | Back |

The host controls (text size, Fullscreen, Reset, Back, Next) and the mouse pointer hide after 3 s without mouse movement and come back when you move the mouse or press a key other than Next/Back (so clicker presses do not flash them at the room). **Reset** asks for confirmation in an in-page dialog; Cancel has focus, so Enter or Escape cancel.

If the projector cannot reach the server for two polls in a row (about 3 s; a request that hangs for 4 s counts as failed), an amber **Connection lost · reconnecting…** banner appears at the top with the time since the drop. It clears on the next good response.

Phones show the same kind of banner at the top of the screen after two failed polls (about 2 s), or at once when a tapped answer cannot be sent ("Your answer was not sent… tap again"). Answer errors also show at the top, so they are visible while the choices are scrolled into view.

Keys are ignored while you type in a field or the filter panel, while a dialog is open, and while a key is held. Two presses within 0.4 s count as one, so a clicker double-send does not skip a slide. No key triggers Reset.

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
| `QUIZ_IDS` | _(unset)_ | Explicit question list by `metadata.id`, comma/space separated, **played in the given order** (see [Pick the question set](#pick-the-question-set)) |
| `SESSIONS_DIR` | `.qwuo` | Snapshots `{uuid}.json` + active pointer `current` |
| `SESSION_ID` | _(unset)_ | Pin a session UUID; otherwise restore pointer or mint new |
| `SESSION_FRESH` | _(unset)_ | `1` / `true` / `yes` → wipe that session’s snapshot on boot and start empty LOBBY (new UUID unless `SESSION_ID` is set) |
| `TRUST_PROXY_HEADER` | _(unset)_ | Header that holds the real client IP for rate limiting, e.g. `cf-connecting-ip`. Unset → client IP headers (`X-Forwarded-For`, `cf-connecting-ip`, `x-real-ip`, …) are **ignored** and the socket address is used. For `x-forwarded-for` the right-most entry is used. Only set this when every request reaches the player port through that proxy |

**CLI** (after `--` when using Deno tasks):

```bash
deno run -P main.ts -- --filter live=true
deno run -P main.ts -- --ids Q1,Q7,Q12
./scripts/start-with-tunnel.sh -- --filter live=true
```

Env filters are applied first, then CLI filters; together they follow the same AND/OR rules. `QUIZ_IDS` ids come first, then `--ids` ids.

> **Permissions:** `deno.json` grants read access to `quiz.json`, `logo.png`, and `./.qwuo` by default. A custom `QUIZ_PATH` outside those paths needs a matching permission entry (or a broader `-A` for experiments).

### Optional logo

Drop a gitignored `logo.png` next to `main.ts` (repo root). If present at startup, it shows top-right on projector and player. Missing file is fine.

---

## Quiz file

Content lives in JSON (default `quiz.json`, often gitignored so banks stay private). Shape is documented in **`quiz.schema.json`** and enforced at load by `validateQuiz`.

> **`quiz.json` is in `.gitignore` in this repo, so git does not keep it.** Keep your own copy (backup or private repo), especially after content edits such as answer-length balancing. `deno task quiz:lengths` checks a bank; the matching test in `deno task test` is skipped when `quiz.json` is missing.

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
| `> 0` | Server starts a deadline; UIs show remaining whole seconds. The projector shows a large ring with the seconds in the header and a full-width bar under it (amber at 10 s, red at 5 s); both are hidden when answers are locked |

When the deadline hits, the session advances **QUESTION → CORRECT** with the same scoring as host **Next** (unanswered = 0). Host Next/Back still work anytime. **Back** from CORRECT does **not** restart the timer (the question is read-only once its answer was shown); re-entering a not-yet-revealed QUESTION starts a **new full** timer (does not resume leftover seconds).

---

## Pick the question set

Two ways, which you can combine. Both work with `deno task start` and the tunnel script (env vars are passed through; CLI flags go after `--`).

**Only the `live=true` questions** (file order):

```bash
deno run -P main.ts -- --filter live=true
QUIZ_FILTER='live=true' deno task start
./scripts/start-with-tunnel.sh -- --filter live=true
QUIZ_FILTER='live=true' deno task start:tunnel
```

**An explicit list of question ids** (matched on `metadata.id`, exact and case-sensitive). The quiz plays them **in the order you list them**, not the file order:

```bash
deno run -P main.ts -- --ids Q1,Q7,Q12
QUIZ_IDS='Q1,Q7,Q12' deno task start
./scripts/start-with-tunnel.sh -- --ids Q1,Q7,Q12
QUIZ_IDS='Q1 Q7 Q12' deno task start:tunnel        # spaces work too
```

- An unknown id, an id listed twice, or an id used by two questions stops the app with an error that names the ids.
- `--ids` and `--filter` together = AND: the id list is taken first (in your order), then filters remove non-matching questions. Example: `--ids Q1,Q2,Q3 --filter live=true` plays only the live ones of Q1–Q3.
- Alternative in **file order**: `--filter id=Q1 --filter id=Q7 --filter id=Q12` (OR within one key).
- Changing the selection changes the quiz fingerprint, so the next start is a new LOBBY (old snapshot not restored). Add `SESSION_FRESH=1` on the course morning anyway.

The startup log confirms the result, e.g. `Ids: 60 → 3 questions in the given order (Q1, Q7, Q12)` or `Filter: 60 → 30 questions (filters: live=true)`.

## Filters

Two layers stack:

1. **Startup filters** (`QUIZ_IDS` / `--ids`, then `QUIZ_FILTER` / `--filter`) shrink the process bank for the whole process.  
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
scripts/ui_check.ts          Projector layout check in headless Chrome (deno task test:ui)
src/
  config.ts                  Env + CLI filters / ids
  quiz.ts                    Load, validate, filter helpers, countdown resolve
  session.ts                 Phases, join, answer, shuffle, countdown, filters
  persist.ts                 Snapshot fingerprint / save / restore
  http.ts                    Projector + player handlers
  projector_ui.ts            Host UI
  projector_keys.ts          Presenter key / clicker mapping (embedded in host UI)
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
| `deno task test` | Unit tests under `src/`, tunnel script tests and a short projector layout check under `scripts/` |
| `deno task test:ui` | Full projector layout check (every question, see below) |
| `deno task quiz:lengths` | Answer-length balance: share of questions whose correct choice is the longest, mean len(correct)/len(distractors), offenders. `deno task test` fails above 30% or 1.08 |

### Projector layout check

`scripts/ui_check.ts` starts the app on free ports with a temp session dir, joins 12 players plus a phone, and walks LOBBY → QUESTION → CORRECT → EXPLAIN → LEADERBOARD → END in headless Chrome at **1920×1080, 1280×720, 1280×800 and 1024×768**. It fails when:

- the document or `#main` scrolls (`scrollHeight > clientHeight`)
- a choice, the question, the explanation, a leaderboard row or the join URL is outside the viewport, clipped by a parent, cut inside its box, or covered by another element
- the lobby QR is outside the viewport, covered, smaller than about `min(65vh, 45vw)`, or does not decode (jsQR) to the join URL
- the footer wraps, or question/choice text is below the floor (1080p: 40 px / 30 px; other sizes: 24 px / 20 px)
- CORRECT/EXPLAIN do not mark exactly one choice ✓, EXPLAIN does not show the question, EXPLAIN below 900 px tall shows more than the correct choice, or the explanation (choices) fall below 36 px (22 px) at 1080p / 28 px (14 px) elsewhere
- the countdown is missing on a timed question, shown when answers are locked, smaller than 44 px (1080p) / 28 px, or its ring or time bar overlaps the logo, QR, counter or slide
- the host controls do not hide after 3 s idle or do not come back on mouse movement / any key (clicker Next/Back keys too, which must still navigate), or Reset does not use the in-page confirm (Enter/Escape cancel; a native dialog fails the check)
- the reconnecting banner does not appear when `/api/state` fails twice in a row, appears after one failure, or does not clear on recovery
- a presenter key does the wrong thing (→/PageDown/Space/Enter, ←/PageUp, double press, held key, keys on the slider or with the QR modal open, Reset-like keys)
- the leaderboard does not show the top 10 (or text is below 40 px at 1080p / 22 px elsewhere), or END has no podium
- on the **375×667 phone**: any question does not show all its choices without scrolling, question/choice text is below 15 px / 14 px, the countdown is off screen, or the page scrolls sideways
- on the phone: fewer than 20 of 20 slow (400 ms) presses register, the offline banner or answer error is missing or not visible without scrolling, correct/incorrect shows before the reveal, the result is lost on reload, or a skipped question does not show "You didn't answer" with the correct answer

```bash
deno task test:ui                              # every question in quiz.json (~2 min)
UI_CHECK_LONGEST=8 deno task test:ui           # 8 longest slides + 8 longest explanations + every 10th
SHOTS_DIR=/tmp/qwuo-shots deno task test:ui    # also save PNGs per view and size (incl. phone 375×667)
SHOTS_ALL=1 SHOTS_DIR=/tmp/qwuo-shots deno task test:ui   # screenshot every question
CHROME_PATH=/path/to/chrome deno task test:ui  # pick the browser
```

It looks for Chrome in `/Applications`, common Linux paths and `~/Library/Caches/ms-playwright` / `~/.cache/ms-playwright`. With no browser, `test:ui` prints "skipped" and exits 0, and the short check inside `deno task test` (6 longest + a sample) is ignored. `SKIP_UI_CHECK=1` skips it on purpose. `QUIZ_PATH` selects another quiz file.

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
