## Context

`quiz.json` already carries:

- **Root `metadata`**: a catalog/authoring bag — `credential`, `domains[]`, `use_cases[]`, `note`.
- **Per-question `metadata`**: free-form keys used in practice as `id`, `domain`, `use-case`, `task-statement`, `live`.

Today both are typed as opaque `object` with `additionalProperties: true` in `quiz.schema.json`, and `validateQuiz` only checks “object or absent.” Catalog lists are documentation-only; nothing ensures a question’s `domain` appears in root `domains`. The projector never receives question metadata, so slides cannot show domain / use-case without hardcoding.

Startup filters (`question-filter`) already depend on open per-question keys and must keep working for non-catalog keys (`live`, `id`, …).

## Goals / Non-Goals

**Goals:**

- Bake the root metadata **catalog** shape into schema + runtime validation so authors get clear structure and fail-fast on out-of-catalog string values when catalogs are declared.
- Add quiz-level **`config`** that lists which question metadata keys to show on the projector slide, in display order.
- Thread that config + current-question values into projector state and render them on QUESTION / CORRECT / EXPLAIN.
- Keep fingerprint policy: catalogs and slide config are not gameplay identity.

**Non-Goals:**

- Enforcing a closed set of per-question metadata keys (filters need open keys).
- Validating every catalog entry is used by at least one question.
- Player UI metadata display.
- CMS/editor UI; schema + load + projector only.
- Changing filter match semantics.
- Requiring root `metadata` or `config` on every quiz file.

## Decisions

### 1. Root `metadata` is a soft catalog, not a closed schema of only known keys

- **Decision:** Document well-known catalog properties on root `metadata`:
  - `domains`: array of non-empty strings (allowed values for question `metadata.domain`)
  - `use_cases`: array of non-empty strings (allowed values for question `metadata.use-case`)
  - `credential`, `note`: optional strings (authoring only; no per-question counterpart required)
  - `additionalProperties: true` so other authoring fields remain valid
- **Runtime:** When a catalog array is present (including empty array), every question that sets the paired key with a **string** value MUST use a member of that array (exact string match, including internal spaces). Missing paired key on a question is OK. Non-string values for the paired key fail validation when a catalog is present (catalogs are string enums). When the catalog property is **omitted**, no membership check runs for that pair (backward compatible with free-form quizzes).
- **Pairing table (fixed, documented):**

  | Root catalog key | Question metadata key |
  |------------------|------------------------|
  | `domains`        | `domain`               |
  | `use_cases`      | `use-case`             |

- **Alternatives considered:**
  - Hard-require catalogs always → breaks minimal fixtures/tests.
  - Generic `metadata.enums: { "domain": [...] }` → more flexible but forces rewriting existing `quiz.json`; reject for now, pair known plural/singular names used in the bank.
  - JSON Schema `enum` generated per file → schema file is static; membership is runtime validation (schema documents shape of catalogs as string arrays).

### 2. Root `config` object for slide metadata keys

- **Decision:** Optional root field:

  ```ts
  config?: {
    /** Ordered question.metadata keys to show on projector slides */
    slideMetadataKeys?: string[];
  };
  ```

- Omitted / `null` `config` → no config (same as today). Empty object OK. Non-object rejected.
- `slideMetadataKeys`: optional array of non-empty strings; order is display order. Duplicate keys rejected. Unknown keys (never appear on any question) are allowed at load (author may stage keys); at render time missing values on the current question are skipped.
- Future config knobs can extend the same object; unknown `config` properties may be retained (shallow) or ignored—**retain shallow copy of known fields only** for now (`slideMetadataKeys`), drop unknown config keys at load (consistent with only preserving known root fields).
- **Schema:** declare `config` with `slideMetadataKeys` array of strings; `additionalProperties: true` on config optional for forward-compat documentation, but runtime keeps only known keys.
- **Fingerprint:** exclude entire `config` (and continue excluding `metadata`).

### 3. Projector payload shape

- **Decision:** Extend `projectorState().question` (when non-null) with:

  ```ts
  slideMetadata: Array<{ key: string; value: string }>
  ```

  Built by walking `quiz.config?.slideMetadataKeys ?? []` and, for each key, if `currentQuestion.metadata?.[key]` is a displayable scalar (string / number / boolean), push `{ key, value: String(v) }`. Skip missing keys, `null`, objects, and arrays (no JSON dump on slides).
- Also expose `slideMetadataKeys` at the top level of projector state (the configured list) only if useful for CSS/debug—**prefer only the resolved `slideMetadata` array on the question** to keep the client dumb.
- **Phases:** Show metadata whenever `question` is non-null (QUESTION, CORRECT, EXPLAIN, LEADERBOARD-with-question? — today LEADERBOARD has `question: null` because phase check is LOBBY|END only… actually looking at code: question is null only for LOBBY and END. LEADERBOARD still has current question object. Spec: show on QUESTION, CORRECT, EXPLAIN primarily; if LEADERBOARD also gets the question payload, showing a small meta line is fine and requires no special case—render whenever `question.slideMetadata?.length`.
- **Player state:** unchanged (do not leak authoring tags to phones by default).

### 4. Schema vs runtime split

- **JSON Schema:** documents structure (types, array-of-string catalogs, config shape). Does **not** cross-link question values to root catalogs (JSON Schema cannot easily express “value ∈ root.domains” across instances without custom keywords).
- **`validateQuiz`:** enforces catalog membership and config shape; remains source of truth at startup (existing pattern for `correct` in range).

### 5. Sample `quiz.json`

- Add:

  ```json
  "config": {
    "slideMetadataKeys": ["domain", "use-case"]
  }
  ```

- Keep existing root `metadata` catalogs; validation will pass because question values already match.

### 6. UI presentation

- Projector: compact meta row above question text (or under phase label)—key as muted label, value as readable text; multiple keys separated consistently (chips or ` · `-separated pairs). Plain text escape values (not Markdown). Professional training look per existing projector style.

## Risks / Trade-offs

- **[Risk] Catalog/key naming drift** (`use_cases` vs `use-case`) → Mitigation: fixed pairing table in spec + code comments; error messages name both keys.
- **[Risk] Strict catalog breaks WIP questions with new domains** → Mitigation: catalogs optional; omit `domains` to disable check; or add value to catalog first.
- **[Risk] Non-string metadata on slide keys** → Mitigation: skip non-scalars at render; authors use strings for display fields.
- **[Trade-off] Only two catalog pairs initially** → Enough for current bank; extend pairing table later without changing `config`.
- **[Trade-off] Schema cannot enforce membership** → Document that runtime validation is authoritative (same as `correct` bounds).

## Migration Plan

1. Ship schema + validator accepting old files (no `config`, free-form metadata without catalogs).
2. Add `config` to repo `quiz.json`.
3. No snapshot version bump (fingerprint unchanged for content; config/metadata already excluded).
4. Rollback: remove `config` from JSON / revert code; older processes ignore unknown root keys today except they already drop them—safe.

## Open Questions

- None blocking; if a third catalog pair is needed later (`task-statements` ↔ `task-statement`), extend the pairing table in a follow-up.
