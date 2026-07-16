## Context

qwuo is a single-process Deno quiz host: projector on port 3000, player on port 3001, session path `/s/{uuid}/`. Phones join via Cloudflare quick tunnel to the player port. A security review found:

1. Projector `POST …/api/advance` and `…/api/reset` trust network locality alone; browsers can CSRF localhost when `Origin` is foreign.
2. Quiz Markdown is rendered with marked into `innerHTML` with no HTML sanitizer; CSP allows `'unsafe-inline'` scripts.
3. Player bound `0.0.0.0` for LAN joins; that expands exposure and is unused when tunnel is the intended phone path.

Main specs for player bind and tunnel messaging were partially updated during exploration; this change locks the full contract and implementation checklist.

## Goals / Non-Goals

**Goals:**

- Loopback-only player bind; tunnel required for phones.
- Reject non-loopback `Origin` on the projector listener.
- Sanitize marked HTML with DOMPurify in client render path.
- Align README, tunnel script hints, and capability specs.

**Non-Goals:**

- Host auth tokens / CSRF cookies (Origin check only).
- Fix rate-limit trust of `X-Forwarded-For` / `CF-Connecting-IP` (document only).
- Strict CSP nonces / externalizing inline scripts.
- Server-side Markdown render or DOMPurify in Deno without a DOM.

## Decisions

### 1. Player bind `127.0.0.1` (not `0.0.0.0`)

- **Choice:** Same as projector; cloudflared (native) targets `http://127.0.0.1:PLAYER_PORT`.
- **Why:** Removes LAN attack surface; matches “tunnel is the public path.”
- **Alternatives:** Keep `0.0.0.0` for LAN; env `PLAYER_BIND` — rejected to drop LAN support entirely.
- **Docker:** Compose still uses `host.docker.internal`; Docker Desktop usually reaches host loopback; Linux Docker may need `TUNNEL_MODE=native`.

### 2. Projector Origin: reject non-local when present

- **Choice:** If `Origin` header is set and not loopback host (`127.0.0.1`, `localhost`, `::1`) with `http:`/`https:`, return 403. Missing `Origin` allowed (curl, unit tests).
- **Why:** Blocks browser CSRF from `https://evil` without breaking non-browser tooling.
- **Alternatives:** Require Origin on all POST (stricter, breaks bare curl); host secret token (stronger, more UX); SameSite cookie (overkill for localhost host UI).

### 3. DOMPurify after marked (client)

- **Choice:** Embed `dompurify` UMD like `marked`; `md(src) = DOMPurify.sanitize(marked.parse(...))`.
- **Why:** XSS sink is browser `innerHTML`; no server DOM needed.
- **Alternatives:** Server sanitize with linkedom/jsdom; marked hooks only — weaker than a maintained sanitizer.

### 4. XFF/CF rate-limit headers deferred

- **Choice:** No code change; risk known (spoof when client hits player port directly).
- **Why:** After loopback bind, only local processes (and tunnel proxy) reach player; spoof surface shrinks for random internet, remains for local/tunnel edge. Separate change if proxy allowlist needed.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Docker cloudflared cannot reach host `127.0.0.1` on some Linux setups | Document `TUNNEL_MODE=native`; native already uses `127.0.0.1` |
| Missing Origin still allows non-browser CSRF-like tools on localhost | Accept for host-local admin; browser CSRF is the target threat |
| DOMPurify default allowlist may strip useful quiz HTML | Prefer safe defaults; quiz authors use GFM without custom HTML |
| Operators expect LAN Wi‑Fi join | **BREAKING** — README + script errors point to tunnel |

## Migration Plan

1. Deploy code with loopback player + Origin + DOMPurify.
2. Always use `deno task start:tunnel` (or set `PUBLIC_URL` + tunnel) for rooms with phones.
3. Rollback: re-bind `0.0.0.0` only if LAN join required again (not planned).

## Open Questions

- None for this change. Optional follow-up: trusted-proxy allowlist for rate-limit keys.
