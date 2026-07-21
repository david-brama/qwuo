## 1. Facet discovery and shared filter helpers

- [x] 1.1 Add `buildMetadataFilterFacets(questions)` in `src/quiz.ts` (keys with matchable scalar/array values, stringified values, per-value counts, well-known key order then alpha)
- [x] 1.2 Unit-test facet discovery for strings, booleans, numbers, array membership, and omission of pure-object keys (`src/quiz_test.ts`)

## 2. Session runtime filter model

- [x] 2.1 Split process bank vs playable list in `Session` (`quiz.questions` bank immutable; `playQuestions` from runtime filters + shuffle)
- [x] 2.2 Implement `getRuntimeFilters`, `getFilterFacets`, `previewRuntimeFilters`, `applyRuntimeFilters` (LOBBY-only mutate; empty match error; clear via empty list; reset `questionIndex` to 0; keep participants)
- [x] 2.3 Update `reset()` to re-apply current runtime filters then fresh shuffle (do not clear filters)
- [x] 2.4 Extend `projectorState()` with `bankQuestionCount`, `activeFilters`, `filterFacets`, `canApplyFilter`
- [x] 2.5 Session unit tests: reduce/clear, empty match, reject outside LOBBY, reset preserves filters, facets from bank (`src/session_test.ts`)

## 3. Persistence

- [x] 3.1 Add optional `runtimeFilters` to snapshot / hydrate types; default `[]` for legacy
- [x] 3.2 Relax `effectiveQuestions.length === quiz.questions.length`; validate restore by re-filtering bank with `runtimeFilters` and matching effective texts/length
- [x] 3.3 Persist tests: filtered restore round-trip; legacy full-bank snapshot still loads (`src/persist_test.ts`, `src/http_persist_test.ts` as needed)

## 4. Projector HTTP API

- [x] 4.1 Add `POST /s/{sessionId}/api/filter` on projector handler (parse body, preview vs apply, map session errors to 400/409)
- [x] 4.2 Enforce loopback Origin guard; call persist save hook on successful non-preview apply
- [x] 4.3 HTTP tests for preview, apply, empty match, non-LOBBY, foreign Origin (`src/http_persist_test.ts` or dedicated tests)

## 5. Projector UI — right filter panel

- [x] 5.1 Add right-side panel markup/styles (multi-select checkboxes per facet, Apply / Clear, scrollable lists; responsive so main content stays readable)
- [x] 5.2 Wire panel to projector state: render facets, show active filters, disable Apply when `!canApplyFilter`, status shows bank vs playable counts
- [x] 5.3 Client: draft selections → preview match count; Apply / Clear POST filter API; refresh state on success; surface errors on empty match
- [x] 5.4 Ensure left slide-meta rail and right filter panel do not collide; keyboard/focus basics for checkbox groups

## 6. Docs and verification

- [x] 6.1 README: document projector filter panel vs startup `--filter` / `QUIZ_FILTER` (intersection semantics, LOBBY-only apply, Reset keeps filters)
- [x] 6.2 Run full test suite and fix regressions
