## Why

Training banks already ship a top-level `metadata` catalog (allowed domains, use-cases, credential, notes) and rich per-question tags, but the schema still treats both as opaque bags. Authors and editors get no structural guidance, invalid question tags are not caught at load, and the projector has no quiz-owned way to choose which question metadata appears on the slide.

## What Changes

- Structure quiz-root `metadata` in `quiz.schema.json` (and runtime validation) as an optional **catalog** of allowed question-level metadata values (e.g. `domains`, `use_cases`), plus free-form authoring fields that are not catalogs (`credential`, `note`, …).
- When catalog arrays are present, validate that matching per-question metadata string fields (e.g. `domain` ↔ `domains`, `use-case` ↔ `use_cases`) use a value from the corresponding catalog list; unknown keys on questions remain allowed for filters (`id`, `live`, `task-statement`, …).
- Add optional quiz-root `config` object to the schema and loader. `config` enumerates which **question-level metadata keys** the projector should show on question slides (ordered list).
- Expose the selected question metadata (and the show-key list from config) on projector state so the projector UI can render them during QUESTION / CORRECT / EXPLAIN.
- Keep metadata/config out of the quiz identity fingerprint (authoring/display config, not gameplay content).
- Update the sample `quiz.json` with a sensible default `config` for slide metadata (e.g. `domain`, `use-case`) without requiring every quiz file to adopt catalogs.

## Capabilities

### New Capabilities

- _(none)_

### Modified Capabilities

- `quiz-config`: Root `metadata` catalog shape; optional root `config` for slide metadata keys; load/validate rules; fingerprint exclusion for `config`.
- `projector-surface`: Projector shows configured question-level metadata on slide phases when present.

## Impact

- `quiz.schema.json` — structured `metadata` + new `config` properties.
- `src/quiz.ts` — parse/retain `config`; catalog-aware validation of question metadata values when catalogs are declared.
- `src/session.ts` / projector state payloads — include ordered slide metadata for the current question.
- `src/projector_ui.ts` (+ styles) — render configured metadata chips/labels on the slide.
- `quiz.json` — add `config` (and keep existing catalog `metadata` valid under the tighter schema).
- Tests: `quiz_test.ts`, projector/HTTP state tests; README note on catalog + slide config.
- No player-surface change required (metadata stays host/projector-facing by default).
