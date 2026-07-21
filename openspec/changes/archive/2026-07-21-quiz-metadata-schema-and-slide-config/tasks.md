## 1. Schema and types

- [x] 1.1 Update `quiz.schema.json`: structure root `metadata` with well-known `domains` / `use_cases` (string arrays), optional `credential` / `note`, keep `additionalProperties`; add root `config` with optional `slideMetadataKeys` (array of non-empty strings)
- [x] 1.2 Extend `Quiz` in `src/quiz.ts` with optional `config?: { slideMetadataKeys: string[] }` (omit property when absent)

## 2. Load and validate

- [x] 2.1 Parse root `config` in `validateQuiz` (omit/null absent, object retained with known fields only, non-object error; validate `slideMetadataKeys` non-empty unique strings)
- [x] 2.2 After questions load, enforce catalog membership for `domains`→`domain` and `use_cases`→`use-case` per design (catalog element types, exact string match, clear errors with path/index)
- [x] 2.3 Add unit tests in `quiz_test.ts` for config load/reject/duplicates and catalog accept/reject/omit/non-string cases
- [x] 2.4 Assert `quizFingerprint` ignores config-only differences in `persist_test.ts` (or quiz tests)

## 3. Projector state and UI

- [x] 3.1 Add helper to resolve `slideMetadata` from `config.slideMetadataKeys` + question metadata (scalar stringification; skip missing/null/object/array)
- [x] 3.2 Include `slideMetadata` on `projectorState().question` when question is non-null; leave `playerState` unchanged
- [x] 3.3 Render ordered metadata on projector slides in `projector_ui.ts` when non-empty; plain-text escape; styles in `styles.ts`
- [x] 3.4 Add session/projector tests covering ordered resolution, skipped keys, and empty config

## 4. Sample content and docs

- [x] 4.1 Add `"config": { "slideMetadataKeys": ["domain", "use-case"] }` to `quiz.json` (keep existing root metadata catalogs)
- [x] 4.2 Document root metadata catalogs and `config.slideMetadataKeys` in README quiz-file section
- [x] 4.3 Run full test suite and fix regressions
