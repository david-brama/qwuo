## 1. Config and session id identity

- [x] 1.1 Replace file-oriented `SESSION_PATH` with `SESSIONS_DIR` (default `.qwuo`) and optional `SESSION_ID` in `src/config.ts`
- [x] 1.2 Add helpers: validate UUID, build snapshot path `{dir}/{id}.json`, read/write active pointer (`{dir}/current`)
- [x] 1.3 Change `playerJoinUrl` to append `/s/{sessionId}` (normalize origin + path)
- [x] 1.4 Update `deno.json` / README env docs for new vars; note `SESSION_PATH` removed

## 2. Persistence path by UUID

- [x] 2.1 Wire `save`/`load`/`clear` to `{sessionsDir}/{sessionId}.json` in `main.ts` + hooks
- [x] 2.2 On boot: resolve id (env → pointer → mint UUID), restore if valid fingerprint, write pointer
- [x] 2.3 `SESSION_FRESH`: clear active snapshot (and handle pointer); keep or mint id per design
- [x] 2.4 Update `src/persist_test.ts` paths to UUID-named files

## 3. HTTP path routing

- [x] 3.1 Add shared path parser: extract `{sessionId, rest}` from `/s/{uuid}/…`; reject malformed/wrong id with 404
- [x] 3.2 Move projector routes to `/s/{id}/`, `/s/{id}/api/state|advance|reset` in `createProjectorHandler`
- [x] 3.3 Move player routes to `/s/{id}/`, `/s/{id}/api/state|join|answer` in `createPlayerHandler`
- [x] 3.4 Pass active `sessionId` into handlers; reject mismatched UUID
- [x] 3.5 Unscoped `/` and `/api/*` return non-room 404

## 4. Client API base from path

- [x] 4.1 Player UI: derive base `/s/{uuid}` from `location.pathname`; fetch state/join/answer under it
- [x] 4.2 Projector UI: same for state/advance (and reset if present); QR still uses server-provided join URL
- [x] 4.3 Ensure projector HTML still receives session-scoped join URL + QR from server

## 5. Reset keeps UUID

- [x] 5.1 Projector reset clears memory + deletes `{id}.json` but does not change active session id or join URL
- [x] 5.2 Player reset remains 403 under session path

## 6. Tests and smoke

- [x] 6.1 Update `src/http_persist_test.ts` (and any http tests) to use `/s/{uuid}/…` paths
- [x] 6.2 Add tests: wrong UUID → 404; unscoped `/api` → 404; join URL contains `/s/{uuid}`; snapshot file named `{uuid}.json`
- [x] 6.3 Run full test suite; fix regressions
- [x] 6.4 Manual smoke: boot → log session URL → open projector + player under `/s/{uuid}/` → join/answer/advance → restart restores same uuid path
