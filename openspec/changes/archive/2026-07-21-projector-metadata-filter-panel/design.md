## Context

Qwuo already supports **startup** metadata filters (`QUIZ_FILTER`, repeatable `--filter`) that shrink the in-memory quiz before the session is created. Match rules live in `filterQuestionsByMetadata` (AND across keys, OR within a key; scalar/array rules). The projector is localhost-only, Origin-guarded, and drives the session from LOBBY through END. Question metadata (`domain`, `use-case`, `live`, `task-statement`, `id`, …) and optional root catalogs (`domains`, `use_cases`) are loaded and validated; the projector already shows configured slide metadata on the **left** rail.

There is no host UI to further narrow the bank for a specific room without restarting. Persistence today assumes `effectiveQuestions.length === quiz.questions.length` (same bank, only choice order differs), so a runtime subset requires an explicit snapshot model update.

## Goals / Non-Goals

**Goals:**

- Right-side projector panel: one **single-select dropdown** per filterable metadata key, values discovered from the **process bank**.
- Combined filter is **intersection across keys only** (at most one value per key), reusing existing match helpers for each entry.
- Apply/clear mutates the session playable set only in **LOBBY**; empty matches rejected without change.
- Projector state + API carry facets, active filters, and bank vs playable counts.
- Restore keeps the same runtime filter and playable subset across process restarts.
- Startup filters remain the outer bound (process bank); panel cannot resurrect startup-dropped questions.

**Non-Goals:**

- Player-facing filter UI or player-visible filter details.
- Free-text / range / nested-object query language beyond existing scalar/array match rules.
- Hot-reload of `quiz.json` or editing metadata from the panel.
- Changing phase machine, scoring, or slide-metadata display keys (`config.slideMetadataKeys`).
- Auto-apply on every dropdown change (explicit Apply keeps host intent clear and avoids thrash with joined lobby).

## Decisions

### 1. Two-tier question sets: process bank vs playable

- **Process bank** = `quiz.questions` after startup filters (unchanged load path in `main.ts`). Session keeps this as the immutable-for-process source list (authoring order).
- **Playable set** = ordered subset of the bank after **runtime** filters, then choice-shuffled for play (today’s `playQuestions`).
- `questionCount` / indices / advance always refer to the playable set.
- Facets (keys → distinct values + counts) are computed from the **process bank**, not the current playable subset, so clearing a value remains possible after a tight filter.

**Alternatives considered:** Replace startup filters entirely with UI-only — rejected; ops still need headless `--filter`. Filter only client-side without session rebuild — rejected; players and scoring must share the same playable list.

### 2. Reuse `filterQuestionsByMetadata` for runtime apply

- UI selections serialize to `MetadataFilter[]` (`key` + string `value`; booleans as `"true"`/`"false"`).
- At most one entry per key (dropdown single-select). Duplicate keys on apply → `400`.
- No selection for a key (“Any”) → that key is unconstrained.
- Apply with empty selection list → playable set = full process bank (clear runtime filter).

**Alternatives considered:** Multi-select / OR-within-key in the panel — rejected per product; keep OR for startup CLI only. New match engine with case-insensitive / substring modes — rejected; keep one scalar match surface.

### 3. LOBBY-only apply; Reset returns to LOBBY without clearing filters

- `POST …/api/filter` succeeds only when `phase === LOBBY`. Otherwise `409` (or equivalent) and no mutation.
- On successful apply: set runtime filters, rebuild playable list (filter bank → shuffle choices), `questionIndex = 0`, keep participants (lobby roster).
- Host **Reset** returns to LOBBY, **clears runtime filters** (full bank + fresh shuffle), and **keeps participants and scores**. Per-question answers are cleared so indices stay valid against the rebuilt set.
- **Back** does not change filters.

**Alternatives considered:** Allow apply mid-game with answer wipe — too surprising for live training. Clear filters on Reset — worse for repeated runs of the same subset.

### 4. Right-side panel UX

- Fixed **right** rail (mirrors left slide-metadata rail; does not cover main question column on wide layouts).
- For each facet key: label (humanized key) + native single-select `<select>` with “Any” plus each facet value (count shown in option label).
- Show live **preview count** of how many bank questions match the current unchecked/checked draft (client-side using facet data is approximate only if dependent; prefer server preview via state recomputation on Apply, and optional client-side filter of bank metadata if state embeds enough — simplest path: client sends draft only on Apply; show “N selected keys” + post-apply `questionCount`/`bankQuestionCount` in status).
- Practical preview: include enough per-question metadata summaries in projector state **or** a lightweight `POST …/api/filter/preview` that returns match count without mutating. Prefer **preview endpoint or dry-run flag** to avoid shipping full bank metadata to the browser when banks are large.
  - **Chosen:** `POST /s/{sessionId}/api/filter` with `{ "filters": [...], "preview": true }` returns `{ matchCount, bankQuestionCount }` without mutation; without `preview` applies when LOBBY.
- **Apply** / **Clear all** buttons; Clear sends empty filters.
- Panel available in all phases (read-only selections when not LOBBY; Apply disabled with short reason).
- Keys ordered: well-known first when present (`live`, `domain`, `use-case`, `task-statement`), then remaining keys sorted alphabetically. Omit keys that have zero matchable scalar/array values on the bank.
- Value labels: string form of the scalar; sort lexicographically; show optional count badge per value (questions in bank with that value).

### 5. Projector state additions

Extend `projectorState()` (and thus `GET …/api/state`) with:

| Field | Meaning |
|--------|---------|
| `bankQuestionCount` | Process bank size |
| `questionCount` | Playable size (existing) |
| `activeFilters` | `MetadataFilter[]` currently applied (empty = none) |
| `filterFacets` | `Array<{ key, values: Array<{ value, count }> }>` from bank |
| `canApplyFilter` | `phase === "LOBBY"` |

Player state unchanged except `questionCount` already reflects playable size.

### 6. HTTP surface (projector only)

- Reuse session path prefix `/s/{sessionId}/api/…`.
- `POST /api/filter` body: `{ "filters": [ { "key": string, "value": string }, ... ], "preview"?: boolean }`.
- Success apply: `200` + full projector state (same shape as GET state) so UI can refresh in one round-trip.
- Preview: `200` + `{ "preview": true, "matchCount", "bankQuestionCount", "filters" }`.
- Empty match on apply: `400` with clear message; session unchanged.
- Malformed body: `400`.
- Non-LOBBY apply: `409`.
- Same loopback Origin guard as advance/reset.
- Persist hook fires after successful apply (not preview), like advance.

### 7. Persistence / snapshot

- Add optional `runtimeFilters: MetadataFilter[]` to snapshot (default `[]` for old files).
- `effectiveQuestions` becomes the **playable** list (may be shorter than `quiz.questions`).
- **BREAKING internal contract:** relax `effectiveQuestions.length === quiz.questions.length`.
- Validation on restore:
  1. Fingerprint still matches process-bank quiz identity (startup-filtered content).
  2. Each effective question’s scoring fields must match **some** bank question (by stable content equality on text/choices authoring — today snapshots store shuffled choices; keep storing play-time choices; match bank row by `metadata.id` when present, else by canonical text + correct authoring is harder). **Chosen practical rule:** store runtimeFilters; on restore re-filter the **loaded bank** with those filters to get the ordered authoring subset, then if snapshot `effectiveQuestions` length matches that subset length and each entry’s `text` equals the subset entry’s `text` (play choices may differ), accept and hydrate with snapshot choice order. If filters empty, require length === bank length as today.
  3. If runtimeFilters produce a different count than snapshot effective length → treat as mismatch, start fresh (same as quiz mismatch policy).
- `Session` constructor: accept full bank as `quiz`; optional initial `runtimeFilters`; build playable from filter+shuffle unless hydrating.

### 8. Facet value extraction

For each top-level metadata key on any bank question:

- string / number / boolean / null → one facet value (stringified with same rules as filter values: bool `true`/`false`, null `null`, number canonical string).
- array of scalars → each scalar contributes a facet value (union membership).
- object / nested non-array → key still listed only if some question has a scalar/array form; pure-object keys omitted.

Counts = number of bank questions that would match `key=value` alone.

## Risks / Trade-offs

- **[Risk] Snapshot length check change breaks old assumptions in tests** → Update `persist` validation and all fixtures; old snapshots without `runtimeFilters` and full-length effective lists still restore.
- **[Risk] High-cardinality keys (`id`) clutter the panel** → Still show them (host may want Q-id pins); CSS scroll per list; optional later hide list via config (out of scope).
- **[Risk] Host applies filter with people already in lobby** → Allowed; roster kept; question count drops — status line shows new `Q—/N`. Document in README.
- **[Risk] Empty bank after startup filter** → Unchanged (process exits at boot). Runtime clear cannot go below 1 on apply (empty match rejected); cannot apply filters that match 0.
- **[Risk] Panel + left meta rail squeeze main content** → Responsive CSS: collapse panel to drawer on narrow widths; default open on desktop projector widths.
- **[Trade-off] Preview requires POST** → Slightly more chatty than pure client preview; keeps match rules single-sourced on server.

## Migration Plan

1. Implement quiz facet helper + session runtime filter APIs with unit tests (no UI).
2. Relax snapshot schema + restore path; migrate tests.
3. Add projector HTTP route + Origin tests.
4. Build right-panel UI wired to state + filter API.
5. README: startup filter vs projector panel.
6. Rollback: revert change; old full-length snapshots remain valid; new snapshots with shorter effective lists won’t load on old code (acceptable for local tool — delete snapshot / `SESSION_FRESH`).

## Open Questions

- None blocking: well-known key order and LOBBY-only apply are fixed above. If product later wants mid-game refilter, that is a separate change.
