## Why

Session lives at fixed root paths (`/`, `/api/*`) and a fixed snapshot file (`.qwuo/session.json`). Join URL and disk path do not identify which room is live, so QR links cannot pin a concrete session and snapshot identity is opaque. Path-routing by session UUID (filename = UUID) makes the room addressable and the on-disk snapshot self-describing.

## What Changes

- Assign each live session a UUID; use that UUID as the snapshot **filename** (e.g. `.qwuo/<uuid>.json`), not a fixed `session.json`.
- Route projector and player HTTP under a path prefix that embeds the session UUID (e.g. `/s/<uuid>/…` for UI and APIs).
- **BREAKING**: Join QR / `PUBLIC_URL` target becomes the session-scoped player URL (includes UUID path), not the bare player origin.
- **BREAKING**: Client-relative API calls move under the session prefix (or derive base from current path); root `/` and bare `/api/*` no longer serve the live room (except optional redirect/landing).
- Boot creates or restores a session by UUID; config shifts from single `SESSION_PATH` file to a sessions directory + active session id (or equivalent).
- Projector reset may mint a new UUID (new path + new file) or clear the current UUID file — design picks one explicit behavior.

## Capabilities

### New Capabilities
- `session-routing`: Session UUID identity, path prefix routing for UI/API, join URL construction, snapshot filename = UUID mapping.

### Modified Capabilities
- `player-surface`: Player UI and APIs served and called under session UUID path; join URL / reattach stay session-scoped.
- `projector-surface`: Projector UI, QR content, and host APIs use session UUID path; QR encodes session-scoped player join URL.
- `session-persistence`: Snapshot path is directory + `{uuid}.json` (filename is session id), not a single fixed `session.json`.

## Impact

- **Code**: `src/http.ts` (path parse + dispatch), `src/config.ts` / `main.ts` (session id, dir, boot), `src/persist.ts` (path helper), `src/player_ui.ts` / `src/projector_ui.ts` (API base from path), tests and README env docs.
- **APIs**: All room endpoints move under `/s/<uuid>/…` (or chosen prefix); unscoped `/api/*` rejected or redirected.
- **Ops**: `SESSION_PATH` semantics change to sessions dir (or new env names); old `.qwuo/session.json` not auto-migrated unless design adds a one-shot note.
- **Deps**: None beyond Deno crypto UUID + existing FS.
