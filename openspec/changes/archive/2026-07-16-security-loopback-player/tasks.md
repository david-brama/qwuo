## 1. Loopback player bind

- [x] 1.1 Bind player `Deno.serve` to `127.0.0.1` (not `0.0.0.0`) in `main.ts`
- [x] 1.2 Update boot logs and no-`PUBLIC_URL` tip to tunnel-first messaging
- [x] 1.3 Update README: remove LAN phone join; document localhost-only + tunnel for phones
- [x] 1.4 Update `scripts/start-with-tunnel.sh` error hints (no LAN-only phone path)
- [x] 1.5 Note Docker vs native loopback reachability in `docker-compose.yml`

## 2. Projector Origin guard

- [x] 2.1 Add `isLocalOrigin` / reject non-local `Origin` on projector handler
- [x] 2.2 Return 403 without mutating session on foreign Origin
- [x] 2.3 Allow missing Origin (tests/curl) and loopback Origin
- [x] 2.4 Tests: foreign Origin blocked; local Origin allowed on reset

## 3. Markdown sanitize

- [x] 3.1 Add `dompurify` import in `deno.json`
- [x] 3.2 Embed purify UMD + wrap `md()` with `DOMPurify.sanitize` after marked
- [x] 3.3 Load purify script in player and projector HTML

## 4. Specs and verification

- [x] 4.1 Confirm main `openspec/specs/*` match delta after apply/archive (player-surface, projector-surface, quiz-config, tunnel-start)
- [x] 4.2 Run `deno test -A src/` (origin tests + existing suite)
- [x] 4.3 Smoke: `deno task start` binds both ports on 127.0.0.1 only; tunnel path still joins phones
