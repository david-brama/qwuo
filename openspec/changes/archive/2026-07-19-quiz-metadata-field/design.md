## Context

Quiz content is loaded once at startup via `loadQuiz` → `validateQuiz` in `src/quiz.ts`. The JSON Schema in `quiz.schema.json` documents the same shape. Today the root allows `additionalProperties: true` in the schema, but the TypeScript validator only keeps `title` and `questions`—any extra root keys (including a hypothetical `metadata`) are silently discarded.

Session restore fingerprints quiz content in `quizFingerprint` (`src/persist.ts`) using only title + question fields that affect play. Player/projector UIs never see a free-form bag of author data.

Authors and tooling want an explicit, optional bag for non-gameplay data without inventing per-field schema churn for every CMS/export need.

## Goals / Non-Goals

**Goals:**

- Accept optional root `metadata` as a plain JSON object with arbitrary nested JSON values.
- Retain `metadata` on the in-memory `Quiz` after validation/load.
- Keep JSON Schema and runtime validator aligned.
- Fail fast with a clear error when `metadata` is present but not an object (including arrays).
- Leave existing quizzes without `metadata` valid and behavior-identical.

**Non-Goals:**

- Rendering or exposing `metadata` in player/projector UI.
- Validating the *contents* of `metadata` (no required keys, no schema-of-schemas).
- Per-question `metadata` (only root-level for this change).
- Hot-reload or mutating metadata after load.
- Changing scoring, phases, routing, or persistence file format beyond fingerprint policy below.

## Decisions

### 1. Shape and optionality

- **Decision:** Root field `metadata?: Record<string, unknown>` (JSON object). Omitted or `null` means “no metadata” (treat as absent; do not store `null` on `Quiz`). Empty object `{}` is valid and retained.
- **Reject:** arrays, strings, numbers, booleans at the `metadata` value itself.
- **Rationale:** “Arbitrary object” matches authoring bags; arrays-as-root are ambiguous vs object maps; null-as-absent matches optional `explain` style elsewhere.
- **Alternatives considered:**
  - Free-form any JSON value at root `metadata` → harder to consume consistently; object is the usual bag.
  - Require `metadata` always present → breaks every existing quiz file for no benefit.

### 2. Depth / value types under `metadata`

- **Decision:** Nested values MAY be any JSON type (object, array, string, number, boolean, null). No further structural validation. Deep-clone via structured clone or `JSON.parse(JSON.stringify(...))` is unnecessary if we only read from parsed JSON and never mutate shared input; assign the object reference from the parsed root after type check, or shallow-copy one level for a stable owned bag—prefer **assign after confirming plain object** (same pattern as other fields: we already build new structures for questions). For safety and immutability habits, **shallow-copy the top-level metadata object** (`{ ...meta }`) so callers cannot mutate the parsed root through `quiz.metadata`; nested objects remain shared references (acceptable for load-once config).
- **Rationale:** Keep validator tiny; authors own content risk inside the bag.

### 3. TypeScript model

```ts
export type Quiz = {
  title: string;
  questions: Question[];
  metadata?: Record<string, unknown>;
};
```

- Only set `metadata` on the returned object when a non-null object was provided (omit property when absent).
- **Rationale:** Optional property is clearer than `metadata: undefined` sprawl in tests/snapshots.

### 4. JSON Schema

- Add optional `metadata` property: `{ "type": "object", "additionalProperties": true }` (draft 2020-12; no `propertyNames` restriction).
- Do **not** put `metadata` in `required`.
- Keep root `additionalProperties: true` as today (schema remains permissive for unknown keys; runtime still only preserves known fields + metadata).

### 5. Fingerprint / session restore

- **Decision:** **Exclude `metadata` from `quizFingerprint`.**
- **Rationale:** Fingerprint exists to detect play-affecting content changes (title, questions, answers). Authoring tags or CMS ids changing should not invalidate an in-progress session snapshot. Aligns with “metadata is not gameplay.”
- **Alternatives considered:** Include metadata in hash → safer if some future code branches on metadata for scoring; premature and surprising for authors editing tags mid-session file on disk (anyway content is fixed for process lifetime).

### 6. Surfaces and APIs

- **Decision:** No HTTP/SSE/UI payload changes in this change. `Session` already holds `quiz: Quiz`; if something later needs metadata it can read `session.quiz.metadata`. Do not broadcast metadata to players by default (could leak internal author notes).

## Risks / Trade-offs

- **[Risk] Large or hostile metadata payloads** → Mitigation: load is trusted local file at startup (same trust model as quiz content); no network ingest of quiz JSON in this app.
- **[Risk] Authors expect unknown root keys to round-trip** → Mitigation: only `metadata` is the supported extension point; document that other extra keys remain dropped.
- **[Risk] Nested mutation of shared objects** → Mitigation: shallow-copy top-level metadata; treat quiz as immutable after load (existing convention).
- **[Trade-off] No content schema for metadata** → Flexibility now; if a standard key set emerges later, add optional well-known keys without removing the open object.

## Migration Plan

1. Ship validator + schema + tests.
2. Existing `quiz.json` files without `metadata` need no edit.
3. Authors add `"metadata": { ... }` when needed.
4. Rollback: revert validator/schema; files with `metadata` still parse as JSON and either fail unknown-strict paths (none today) or simply drop the field again—no on-disk session format change if fingerprint excludes metadata.

## Open Questions

- None blocking implementation. Per-question metadata can be a follow-up if needed.
