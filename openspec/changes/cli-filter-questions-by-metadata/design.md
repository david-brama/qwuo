## Context

Quiz files already carry per-question `metadata` (e.g. `domain`, `use-case`, `live`, `task-statement`, `id`) in real banks such as `quiz.json`, but `validateQuiz` drops every question-level field except `text` / `choices` / `correct` / `explain`. Root-level `metadata` is retained; question-level is not.

Config is env-driven today (`loadConfig` in `src/config.ts`); `main.ts` does not parse `Deno.args`. Hosts start via `deno task start` / `start:tunnel` with env vars. Operators need a way to run a **subset** of a large bank for a given room without editing the JSON.

Session construction takes a `Quiz` and builds shuffled `playQuestions` of the same length; persistence fingerprints `title` + play-affecting question fields and requires snapshot `effectiveQuestions.length === quiz.questions.length`. Any filter must therefore produce the `Quiz` object that Session and fingerprint both use.

## Goals / Non-Goals

**Goals:**

- Retain optional per-question `metadata` objects through load (same object rules as root metadata).
- Let the host pass **multiple** metadata filter entries at startup (CLI and env).
- Apply filters after full-file validation, before session create / fingerprint / snapshot restore.
- Preserve relative file order of questions that match.
- Fail fast on malformed filters or an empty match set.
- Keep no-filter boot behavior identical for play (aside from metadata retention on the in-memory model).

**Non-Goals:**

- Filtering by quiz-root metadata.
- Deep JSONPath / nested key paths (only top-level keys on each question’s `metadata`).
- Regex, inequality, or range operators (equality / membership only).
- Runtime re-filter after the process is up (no API to change the bank mid-session).
- Rendering question metadata on player/projector.
- Changing phase machine, scoring, shuffle, or snapshot file format beyond using the filtered question list as the session quiz.
- A full general-purpose CLI framework beyond the flags needed here.

## Decisions

### 1. Retain question-level `metadata` on load

- **Decision:** Extend `Question` with optional `metadata?: Record<string, unknown>`. Rules mirror root metadata: omit/null → absent; non-object (array/primitive) → validation error; `{}` retained; shallow-copy top-level bag.
- **Rationale:** Filters cannot run on data that is discarded; authors already write this field in bank files.
- **Alternatives:** Filter by re-reading raw JSON outside `validateQuiz` → two parsers, drift risk.

### 2. Filter applies to the playable `Quiz`, not a side list

- **Decision:** After `loadQuiz`, if any filters are configured, replace `quiz.questions` with the ordered matching subset (new array; do not mutate individual question objects). Title and root `metadata` stay from the file. That object is what `quizFingerprint`, `Session`, and restore all use.
- **Rationale:** Session already assumes `quiz.questions.length` is the room length; no Session API change.
- **Fingerprint:** Continues to hash title + question play fields of the **filtered** quiz. Different filter → different fingerprint → stale snapshot for another subset is rejected (start fresh). Question `metadata` stays **out** of the fingerprint payload (same as root metadata).
- **Alternatives:** Keep full quiz on `Session` and a separate index list → more surface area for off-by-one bugs in advance/answer.

### 3. Filter entry shape and multi-entry semantics

- **Decision:** Each entry is `key=value` where `key` is a non-empty metadata property name and `value` is the remainder of the string after the first `=` (may contain `=` and whitespace).
- **Multiple entries:**
  - Group entries by `key`.
  - **AND** across different keys: a question must satisfy every key group.
  - **OR** within the same key: a question matches the key if it matches **any** value listed for that key.
- **Example:** `--filter live=true --filter domain=A --filter domain=B` → `live` is true **and** (`domain` is A **or** B).
- **No filters:** all validated questions kept (current behavior).
- **Rationale:** Matches how hosts think (“live questions in these two domains”) without a mini query language.
- **Alternatives:** Pure OR of all entries → too loose; pure AND of every pair including duplicate keys → cannot express multi-value OR without a different syntax.

### 4. Whitespace in keys/values and shell quoting

Real banks use spaced strings extensively (`domain`, `use-case`, `task-statement`). The app never sees the shell command line—only already-split `Deno.args` / env strings—so **correct quoting is an operator requirement**, and the parser must not destroy internal spaces once the string arrives.

- **Decision — preserve internal whitespace:** After obtaining each `key=value` string (from one argv token or one `QUIZ_FILTER` segment):
  - Split on the **first** `=` only.
  - `key`: trim **leading/trailing** whitespace only (so `"  domain  =…"` still works); key MUST remain non-empty; **internal** spaces in a key are kept if present.
  - `value`: trim **leading/trailing** whitespace only; **internal** spaces, `&`, punctuation, and further `=` characters are preserved exactly for matching.
- **Decision — no extra unquoting layer:** Do not strip shell quotes inside the value (the shell already removed them). Do not interpret `\n` escapes unless we add that later.
- **CLI quoting (document as canonical):**
  - Prefer one argv token for the whole entry so spaces stay inside the value:
    - `--filter "domain=Tool Design & MCP Integration"`
    - `--filter='use-case=Customer Support Resolution Agent'`
    - `--filter=domain=Tool Design & MCP Integration` is **wrong** unquoted (`&` and spaces break the shell); use  
      `--filter="domain=Tool Design & MCP Integration"` instead.
  - Repeatable flags, each quoted independently:
    ```bash
    deno run -P main.ts -- \
      --filter live=true \
      --filter "domain=Tool Design & MCP Integration" \
      --filter "domain=Prompt Engineering & Structured Output"
    ```
- **Env quoting:**
  - Quote the entire assignment; use `;` between entries (not spaces as separators):
    ```bash
    export QUIZ_FILTER='live=true;domain=Tool Design & MCP Integration'
    ```
  - Values that contain `;` cannot use the env multi-entry form reliably → use repeated `--filter` instead (already a known limitation).
- **Matching interaction:** String equality uses the value **after** leading/trailing trim, compared to the question field **as stored** (no trim of the JSON string). Authors should not rely on leading/trailing spaces in JSON metadata; internal spaces must match exactly (e.g. single spaces in domain names).
- **Rationale:** Bank data is human-readable phrases; shell word-splitting is the main footgun, not the matcher.
- **Alternatives considered:** Require URL-encoding or `\ ` escapes in values → worse UX; forbid spaces → incompatible with existing `quiz.json`.

### 5. Value matching rules

- **Decision:** Compare against the question’s `metadata[key]` only (missing metadata object or missing key → no match for that key).
  - **string / number / boolean / null:** match if the filter value (after leading/trailing trim per §4) equals a canonical form of the field:
    - strings: exact equality with the stored string (no case-folding; internal whitespace significant).
    - booleans: filter value must be `true` or `false` (case-sensitive lowercase) matching the boolean.
    - numbers: filter value must parse as the same number (`Number(value)` finite and `===` field), or exact decimal string equal to `String(field)`.
    - null: filter value must be the literal `null`.
  - **array:** match if **any element** is a scalar that matches the filter value under the rules above (membership). Nested objects inside arrays do not match.
  - **object** (non-array): no match for equality filters in this version (hosts should filter on scalar/array fields).
- **Rationale:** Covers `live: true`, spaced domain strings, and possible `tags: ["intro"]` without inventing operators.
- **Alternatives:** JSON-literal values only → worse CLI UX for simple strings; case-insensitive → surprising for IDs.

### 6. CLI flags and env (both)

- **Decision:** Support both, merged into one filter list:
  1. **CLI (primary for “options”):** repeatable `--filter <key=value>` or `--filter=<key=value>`. Parsed from `Deno.args` in config load (or a small `parseCliArgs` helper called from `loadConfig` / `main`). Each `<key=value>` MUST already be a single argv element when it contains whitespace (host quoting).
  2. **Env:** `QUIZ_FILTER` — zero or more entries separated by `;`. Each segment trimmed (segment edges only); empty segments ignored. Example (quoted for the shell):  
     `QUIZ_FILTER='live=true;domain=Tool Design & MCP Integration'`.
  3. **Merge order:** env entries first, then CLI entries (CLI can add constraints on top of a base env). Same multi-entry AND/OR rules over the combined list.
- **Unknown CLI tokens:** if any arg is present and is not a recognized `--filter` form, fail fast with usage (avoid silent ignore of typos). When `Deno.args` is empty, no CLI error. A bare word that was meant to be part of an unquoted value (e.g. host forgot quotes and shell split `Design` into its own argv) MUST surface as unknown-operand / malformed rather than silently dropping it.
- **Rationale:** Env keeps `deno task` / Docker parity with existing config style; repeatable flags match “multiple entries” ergonomics and avoid `;` inside values for the common path.
- **Alternatives:** Env-only → weaker fit for the stated “CLI options” request; CLI-only → awkward under the tunnel script unless it forwards args (script can `exec` with `"$@"` later; document that).

### 7. Where parsing and filtering live

- **Decision:**
  - `loadConfig()` (or sibling) returns `filters: MetadataFilter[]` (`{ key: string; value: string }[]`).
  - Pure `filterQuestionsByMetadata(questions, filters): Question[]` in `src/quiz.ts` (unit-tested).
  - `main.ts`: `loadQuiz` → optional filter → if filters non-empty and result empty, `Deno.exit(1)` with count of source questions and filter summary → else assign filtered quiz → fingerprint → session as today.
- **Logging:** On successful filter, log one line: e.g. `Filter: N → M questions (filters: …)` so the host sees the subset size next to the existing title line (include full spaced values in the summary).
- **Rationale:** Keep HTTP/session free of filter knowledge.

### 8. Schema and copy helpers

- **Decision:** Add optional `metadata` on `$defs.question` in `quiz.schema.json`. `copyQuestion` / shuffle helpers **preserve** `metadata` when present (shuffle still only reorders choices). Snapshots need not persist question metadata (play fields only remain enough); restore length checks use filtered quiz length.
- **Rationale:** Metadata is authoring/filter input, not required in snapshot v2 shape.

### 9. Tunnel / permissions

- **Decision:** Add `QUIZ_FILTER` to `deno.json` permissions `env` list. Document forwarding CLI args with quotes intact:  
  `deno run -P main.ts -- --filter live=true --filter "domain=Tool Design & MCP Integration"`  
  (and optionally update `start-with-tunnel.sh` to pass through `"$@"` if cheap—include as implementation task if script already exec’s deno).
- **Rationale:** Deno permission allowlists will block new env otherwise; `"$@"` preserves per-arg quoting through the wrapper.

## Risks / Trade-offs

- **[Risk] Values containing `;` break env form** → Mitigation: document limitation; prefer repeatable `--filter` for complex values.
- **[Risk] Domain / use-case strings contain spaces and `&`** → Mitigation: README shows double- or single-quoted `--filter "key=value with spaces & ampersands"` and quoted `QUIZ_FILTER='…'`; parser preserves internal whitespace; unquoted split tokens fail as unknown args instead of wrong matches.
- **[Risk] Hosts trim or normalize spaces differently than JSON** → Mitigation: exact match on stored strings; only trim filter key/value edges; document copy-paste from quiz metadata.
- **[Risk] Host restores snapshot from a previous full-bank run after filtering** → Mitigation: fingerprint includes question set; mismatch starts fresh (existing path). Opposite: same filter + same file restores correctly.
- **[Risk] `SESSION_FRESH` / pointer reuse with different filters** → Mitigation: fingerprint mismatch handles wrong content; host may still reuse session id path—acceptable, same as editing quiz text.
- **[Risk] Typos in metadata keys yield empty set** → Mitigation: error message lists applied filters and source question count; do not start with zero questions.
- **[Trade-off] No nested key paths** → Simpler v1; banks already use flat keys.
- **[Trade-off] Strict CLI (unknown args fail)** → Safer than silent ignore; may surprise if users pass deno-style noise—only parse args after `--` when present, or parse only `--filter*` and allow no other app flags yet. **Refine:** If `Deno.args` contains `--`, only parse operands after the last leading option break per Deno convention; recognize solely `--filter` / `--filter=*`. Any other operand after that point is an error. Args before a lone `--` that look like filters still count when users pass `main.ts --filter …` without `--`.

## Migration Plan

1. Ship load retention + filter + config; default with no filters unchanged for play.
2. Existing snapshots for full banks remain valid when started **without** filters on the same file content.
3. No quiz file migration required; banks that already embed question `metadata` start working for filters automatically once load retains it.
4. Rollback: unset filters / revert deploy; files unchanged.

## Open Questions

- None blocking: AND-across-keys / OR-within-key, CLI+env merge, and fingerprint-on-filtered-quiz are decided above. If hosts later need OR across keys, add an explicit syntax in a follow-up rather than changing defaults.
