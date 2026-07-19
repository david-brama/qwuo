## 1. Question metadata on load

- [x] 1.1 Extend `Question` with optional `metadata?: Record<string, unknown>` in `src/quiz.ts`
- [x] 1.2 In `validateQuiz`, accept/retain/reject per-question `metadata` with the same rules as root metadata (omit/null absent, object shallow-copy, non-object error)
- [x] 1.3 Preserve `metadata` in `copyQuestion` and `shuffleQuestionChoices` when present
- [x] 1.4 Declare optional question `metadata` in `quiz.schema.json`
- [x] 1.5 Add unit tests in `quiz_test.ts` for load retention, null/empty/reject cases; assert fingerprint ignores question-metadata-only diffs in `persist_test.ts` if not already covered

## 2. Filter pure logic

- [x] 2.1 Add `MetadataFilter` type and `parseFilterEntry` / `filterQuestionsByMetadata` in `src/quiz.ts` (or small sibling module)
- [x] 2.2 Implement AND-across-keys / OR-within-key grouping and scalar/array match rules from design (edge-trim key/value only; preserve internal whitespace)
- [x] 2.3 Unit-test match matrix: boolean, string **with internal spaces**, number, null, array membership, missing key/metadata, multi-key AND, multi-value OR, stable order, spacing-significant non-match

## 3. Config: env + CLI

- [x] 3.1 Extend `Config` with `filters: MetadataFilter[]`
- [x] 3.2 Parse `QUIZ_FILTER` (`;`-separated) and repeatable `--filter` / `--filter=` from `Deno.args`; merge env then CLI; reject malformed entries and unknown operands (do not re-join shell-split words)
- [x] 3.3 Allow `QUIZ_FILTER` in `deno.json` permissions `env` list
- [x] 3.4 Add config/filter parse unit tests (args + env), including spaced values already present as a single argv/env segment (e.g. `domain=Tool Design & MCP Integration`)

## 4. Boot integration

- [x] 4.1 After `loadQuiz` in `main.ts`, apply filters when non-empty; exit non-zero on empty match with clear message
- [x] 4.2 Log pre/post question counts (and short filter summary) on successful filter
- [x] 4.3 Ensure fingerprint and `Session` use the filtered quiz object only
- [x] 4.4 Optionally forward `"$@"` through `scripts/start-with-tunnel.sh` so CLI filters work under `deno task start:tunnel`

## 5. Docs

- [x] 5.1 Document `QUIZ_FILTER` and `--filter` (multi-entry semantics) in README with **quoted** examples for spaced values and `&` (e.g. `--filter "domain=Tool Design & MCP Integration"`, `QUIZ_FILTER='live=true;domain=…'`)
- [x] 5.2 Explicitly warn that unquoted spaces/`&` break the shell before the app runs; app does not reassemble split tokens
- [x] 5.3 Note question-level `metadata` in the quiz file section and that filters do not rewrite the file

## 6. Verification

- [x] 6.1 Run `deno test -A src/` and fix regressions
- [x] 6.2 Smoke: no filters → full bank; `--filter live=true` on sample bank → expected count; quoted spaced domain filter → expected count; empty/malformed filters → non-zero exit
