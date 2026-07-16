## Context

qwuo serves one live `Session` on two ports (projector localhost, player all-interfaces). HTTP paths are flat (`/`, `/api/state`, `/api/join`, …). Persistence writes a single file (`SESSION_PATH`, default `.qwuo/session.json`). Join QR encodes bare player origin (`PUBLIC_URL` or `http://localhost:PLAYER_PORT`).

Hosts need the join link and snapshot to name the same room: path carries session UUID; filename is that UUID.

Constraints: Deno-only, no auth, single concurrent live room for v1, keep phase/join/answer semantics, tunnel still only player port.

## Goals / Non-Goals

**Goals:**
- Every live session has a UUID id.
- Snapshot file basename is that UUID (`{sessionsDir}/{uuid}.json`).
- Projector + player UI/API only serve under `/s/{uuid}/…`.
- Join QR encodes session-scoped player URL.
- Boot restore: load snapshot by active UUID when file valid + quiz fingerprint matches.

**Non-Goals:**
- Concurrent multi-room hosting (many UUIDs live at once).
- Session list UI, history browser, or cloud store.
- Auth / signed URLs / UUID secrecy as access control.
- Migrating old `.qwuo/session.json` automatically.
- Changing session-engine scoring or phase machine.

## Decisions

### 1. Path prefix `/s/{uuid}/…`

- **Choice**: Canonical base path is `/s/<sessionId>/` where `sessionId` is a UUID string. UI at `/s/<id>/` (and `/s/<id>/index.html`); APIs at `/s/<id>/api/state|join|answer|advance|reset`.
- **Why**: Clear namespace; avoids clashing with future static assets; easy parse with one regex/split.
- **Alternatives**: `/{uuid}/…` (pollutes root), query `?session=` (QR ugly, easy to drop), header-only (QR cannot set).

### 2. Filename = UUID (no extension-less; use `.json`)

- **Choice**: Snapshot path = `{sessionsDir}/{uuid}.json`. UUID in path and filename are the same string (filename stem = uuid).
- **Why**: 1:1 map path → file; inspectable on disk; matches user requirement “session filename is the uuid”.
- **Note**: Extension `.json` kept for type clarity; stem is the UUID.

### 3. Config: sessions directory + optional fixed id

- **Choice**:
  - `SESSIONS_DIR` default `.qwuo` (replaces file-oriented `SESSION_PATH` default).
  - `SESSION_ID` optional: if set, use that UUID (must be valid UUID form); else generate new UUID on boot when no restore target.
  - Boot restore: if `SESSION_ID` set, try `{dir}/{id}.json`; if unset, either generate new id always, or restore “last active” via small pointer file `{dir}/current` containing the uuid — **prefer pointer file** so restart keeps same room without env.
- **Why**: Pointer file keeps crash recovery UX of current product; env override for ops/tests.
- **Migration**: Document `SESSION_PATH` removed/ignored; old `session.json` not loaded.

### 4. Single live session in process (v1)

- **Choice**: Process still holds one `Session` + one `sessionId`. Handlers reject requests whose path UUID ≠ active id (404).
- **Why**: Minimal rewrite of main/http; unlocks URL/file identity without multi-room complexity.
- **Later**: Map of sessions if needed.

### 5. Client API base from current path

- **Choice**: Player and projector inline JS derive API base from `location.pathname` (strip to `/s/{uuid}`) rather than hardcoding `/api/…`.
- **Why**: Same HTML bundle works for any session id; no server-side HTML templating of every fetch URL beyond existing patterns.
- **Projector QR**: `playerJoinUrl` becomes `{publicOrLocalPlayerOrigin}/s/{uuid}` (no trailing slash issues: normalize).

### 6. Reset behavior: clear in-memory, keep same UUID

- **Choice**: `POST /s/{uuid}/api/reset` clears session to empty LOBBY and deletes `{dir}/{uuid}.json`, **keeps same UUID** so QR/links stay valid for next class.
- **Why**: Hosts reprinting QR mid-day is painful; new room content under same link is enough.
- **Fresh boot**: `SESSION_FRESH=1` deletes active snapshot (and pointer) then starts empty under same or new id — if no `SESSION_ID`, mint new UUID and update pointer.
- **Alternative rejected**: Mint new UUID on every reset (breaks printed QR).

### 7. Invalid / wrong UUID

- **Choice**: Malformed UUID path → 404. Valid UUID ≠ active session → 404 JSON/HTML. No auto-create on unknown path (avoids accidental multi-session via random URLs).
- **Why**: Process is single-room; creating on GET would be footgun.

### 8. Root paths

- **Choice**: Bare `/` and `/api/*` on both ports return 404 (or short text pointing that session path required). No silent redirect to active session (avoids leaking id on shared tunnels if we later multi-tenant).
- **Why**: Forces correct join URL; QR always has uuid.

## Risks / Trade-offs

- **[Breaking join URLs / bookmarks]** → Document; hosts restart with new QR after upgrade.
- **[Old SESSION_PATH users]** → README migration: set `SESSIONS_DIR`, ignore old file; optional one-line note in boot log if `session.json` present.
- **[UUID in public URL]** → Not a secret; anyone with link joins (same as today with open tunnel). No new threat model.
- **[Pointer file race]** → Single process writer only; acceptable.
- **[Clients hardcoding /api]** → Update both UIs + tests in same change.
- **[Trade-off: no multi-room]** → Explicit; path shape ready for later map.

## Migration Plan

1. Ship path routing + `{uuid}.json` + pointer `current`.
2. Default: first boot mints UUID, writes pointer, empty LOBBY (or restore if pointer + file valid).
3. Operators: set `PUBLIC_URL` to tunnel origin only (no path); app appends `/s/{uuid}`.
4. Rollback: revert code; delete pointer/uuid files; old flat paths return if running old binary.
5. No automated import of `.qwuo/session.json`.

## Open Questions

- None blocking: pointer file name `current` vs `active` — use `current`.
- Whether projector root could show active session link for host convenience — out of scope; host uses logged URL.
