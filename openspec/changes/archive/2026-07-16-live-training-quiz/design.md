## Context

Greenfield ad-hoc training quiz for live instructor-led sessions. Host runs the app on a laptop; phones join through an ephemeral public tunnel. No product distribution, no accounts, no CMS — content is a JSON file. Professional presentation for training rooms (projector + phones), Kahoot-style lockstep pacing without party aesthetics.

## Goals / Non-Goals

**Goals:**

- One Deno process serves projector (localhost) and players (bind all interfaces for tunnel)
- Host advances phases with an on-screen **Next** button on the projector page
- Players join with a display name only; answer once per question; see correct/incorrect immediately
- Scoring: +1 per correct answer; leaderboard on projector
- QR: large on lobby; small top-right on other projector phases
- Late join allowed; missed questions count as 0
- Duplicate names allowed
- `PUBLIC_URL` (env) used as QR target when tunnel is in use

**Non-Goals:**

- Auth, multi-room, persistence, analytics export
- Admin/CMS UI for editing questions
- Timers, speed scoring, team mode
- Packaging/installers or multi-platform distribution
- Custom domains or long-lived hosting
- Hotkeys as primary host control (Next button only, to avoid accidents)

## Decisions

### 1. Runtime: Deno

- **Choice:** Deno + TypeScript, standard `Deno.serve`
- **Why:** Native TS, few deps, single command to run, good fit for ad-hoc local tools
- **Alternatives:** Node/Express (more ceremony), Go (faster binary but slower UI iteration), Python (fine but weaker static TS story)

### 2. Two HTTP ports, one process

- **Choice:** `:3000` projector (localhost only), `:3001` players (`0.0.0.0`)
- **Why:** Tunnel only exposes player surface; projector never leaves the host machine
- **Alternatives:** Path-based roles on one port (harder to keep projector private through tunnel); reverse-proxy rules (overkill)

Ports configurable via env (`PROJECTOR_PORT`, `PLAYER_PORT`) with those defaults.

### 3. In-memory session state

- **Choice:** Single process memory for phase, question index, participants, answers
- **Why:** Ad-hoc session dies with process; no DB needed
- **Alternatives:** SQLite (unnecessary), Redis (wrong scale)

### 4. Host control: Next button on projector UI

- **Choice:** Explicit button on projector page; no keyboard shortcuts in v1
- **Why:** Prevents accidental advance during discussion; training-friendly
- **Alternatives:** Space/Enter hotkeys (faster but error-prone); separate terminal TUI (extra surface)

Advance is only accepted from the projector origin/port (not from player port).

### 5. Phase machine

```
LOBBY → QUESTION → CORRECT → EXPLAIN → LEADERBOARD → (next QUESTION | END)
```

- Host presses Next to move forward
- If `explain` is empty/missing, still show EXPLAIN phase with empty/minimal body (keeps cycle predictable) or skip — **decision: show phase with placeholder "No explanation"** so host always has the same rhythm
- After last question's LEADERBOARD, Next → END

### 6. Player feedback timing

- **Choice:** Immediate right/wrong after player selects; does not wait for host
- **Why:** Personal learning feedback; group reveal stays on host clock for discussion
- **Lock:** One answer per player per question; unanswered when host leaves QUESTION → 0 for that question

### 7. Player sync mechanism

- **Choice:** Short polling (~1s) of session state from player clients
- **Why:** Simple, good enough for ~30 phones, fewer moving parts than WebSockets
- **Alternatives:** SSE (nice upgrade later), WebSocket (more code)

### 8. Identity

- **Choice:** Server-assigned participant id (opaque); display name free text; duplicates allowed
- **Why:** Stable scoring identity without auth; names are cosmetic
- Store id in player browser (`localStorage` or cookie) so refresh mid-session reattaches

### 9. QR / public URL

- **Choice:** `PUBLIC_URL` env var (e.g. cloudflared URL) for QR payload; fallback `http://localhost:PLAYER_PORT` for LAN-only
- **Why:** Tunnel URL is random each run; cannot hardcode
- Document a tiny shell wrapper: start tunnel → export URL → start Deno

### 10. UI delivery

- **Choice:** Server-rendered or static HTML/CSS/JS served by Deno (no SPA build pipeline required)
- **Why:** Ad-hoc, professional-looking CSS, zero frontend toolchain
- **Alternatives:** Vite/React (heavier than needed)

### 11. quiz.json schema

```json
{
  "title": "string",
  "questions": [
    {
      "text": "string",
      "choices": ["string", "..."],
      "correct": 0,
      "explain": "string (optional)"
    }
  ]
}
```

- `correct` is 0-based index into `choices`
- Load once at startup; invalid file → exit with clear error
- No hot-reload required for v1

### 12. API sketch (player port)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/state` | Phase, question public fields, scores (no correct index until answered or phase ≥ CORRECT for projector; players never get correct index until after they answer or phase past QUESTION — **players learn correctness only via answer response**) |
| POST | `/api/join` | `{ name }` → `{ id, name }` |
| POST | `/api/answer` | `{ id, choiceIndex }` → `{ correct, correctIndex, score }` |

Projector port:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/state` | Full host state including correct index when useful for display |
| POST | `/api/advance` | Next phase (host only) |

Strict separation: `/api/advance` only on projector port.

### 13. Leaderboard

- Sort by score desc; ties broken by earlier join order (stable, boring, fair enough)
- Show all participants

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Tunnel URL forgotten → QR points at localhost | Fail soft: show URL text under QR; README documents `PUBLIC_URL` |
| Process restart wipes session | Accept for ad-hoc; restart = new session |
| Duplicate names confuse host | Allow; optional future: show join order; not in v1 |
| Player polls lag ~1s | Acceptable for training; SSE later if needed |
| Griefing via public tunnel | Accept URL obscurity + short lifetime; no auth by design |
| Empty explain text | Show "No explanation" placeholder |
| Host opens projector via tunnel by mistake | Projector binds localhost only |

## Migration Plan

N/A — new app. Run: `deno run -A main.ts` (exact entry TBD in tasks) with optional env vars.

## Open Questions

- Exact default ports if 3000/3001 busy (auto-increment vs fail) — **default: fail with clear message**
- Whether END screen needs export of scores — **no for v1**
