## 1. Project scaffold

- [x] 1.1 Create Deno entrypoint layout (`main.ts`, `deno.json` if needed, `README.md` with run + tunnel notes)
- [x] 1.2 Add sample `quiz.json` matching the agreed schema
- [x] 1.3 Wire env config: `PUBLIC_URL`, `PROJECTOR_PORT` (default 3000), `PLAYER_PORT` (default 3001), quiz file path

## 2. Quiz config

- [x] 2.1 Implement JSON load + schema validation (title, questions, choices ≥ 2, correct in range, optional explain)
- [x] 2.2 Fail fast on invalid/missing file with clear stderr message

## 3. Session engine

- [x] 3.1 Implement in-memory session: phase, question index, participants (id, name, joinOrder, score, answers)
- [x] 3.2 Implement join (name → id), allow duplicates, late join with score 0
- [x] 3.3 Implement answer once per question during QUESTION; +1 if correct; reject otherwise
- [x] 3.4 Implement advance phase machine: LOBBY → QUESTION → CORRECT → EXPLAIN → LEADERBOARD → next QUESTION | END
- [x] 3.5 Implement leaderboard sort (score desc, join order asc for ties)
- [x] 3.6 Mark unanswered as 0 when leaving QUESTION (no retroactive answers)

## 4. HTTP servers

- [x] 4.1 Start projector server bound to localhost only
- [x] 4.2 Start player server bound to 0.0.0.0
- [x] 4.3 Player API: `POST /api/join`, `POST /api/answer`, `GET /api/state` (no advance; no correct index before answer)
- [x] 4.4 Projector API: `GET /api/state` (host view), `POST /api/advance` only on projector port
- [x] 4.5 Reject advance (and host-only routes) on player port

## 5. Projector UI

- [x] 5.1 Serve projector HTML/CSS/JS with professional high-contrast training style
- [x] 5.2 LOBBY: large QR + URL text from `PUBLIC_URL` or local player URL fallback
- [x] 5.3 Non-lobby phases: small QR top-right
- [x] 5.4 Render QUESTION / CORRECT / EXPLAIN / LEADERBOARD / END content per specs
- [x] 5.5 Next button calls advance and refreshes view

## 6. Player UI

- [x] 6.1 Serve player HTML/CSS/JS (name entry, wait, question, feedback)
- [x] 6.2 Persist participant id in `localStorage` and reattach on reload
- [x] 6.3 Poll `/api/state` (~1s) and update UI on phase/question changes
- [x] 6.4 Answer pad during QUESTION; instant correct/incorrect UI after submit
- [x] 6.5 Waiting states for lobby, post-answer, and non-QUESTION phases

## 7. QR + run docs

- [x] 7.1 Generate QR client-side or server-side for player join URL
- [x] 7.2 Document: start Deno, start cloudflared to player port, set `PUBLIC_URL`, open projector on localhost

## 8. Smoke check

- [x] 8.1 Manual run-through: join two names (including duplicate), answer, advance full cycle, late join, leaderboard, end
