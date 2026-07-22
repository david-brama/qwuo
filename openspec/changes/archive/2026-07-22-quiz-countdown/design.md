## Context

Qwuo is host-driven today: QUESTION lasts until the projector **Next** (or **Back**). README and the original live-training proposal state “no timers.” Authors already have quiz-root `config` (known fields only, e.g. `slideMetadataKeys`) and per-question fields validated in `src/quiz.ts` + `quiz.schema.json`. Session state is in-memory with JSON snapshots (`SNAPSHOT_VERSION` 2); projector/player poll `/api/state`.

Training rooms often want a visible countdown without making every quiz timed. Defaults should live on the quiz; exceptions on individual questions.

## Goals / Non-Goals

**Goals:**

- Schema + load support for quiz default and per-question override (`countdownSeconds`).
- Clear resolution: override if present, else default, else no timer.
- Server-authoritative deadline during QUESTION; both UIs show remaining time.
- On expiry, same outcome as host leaving QUESTION (unanswered → 0, phase → CORRECT).
- Restore mid-QUESTION without silently granting a full new timer or locking forever.
- Backward compatible: omit fields → behavior identical to today.

**Non-Goals:**

- Per-choice or per-player timers; speed-based scoring bonuses.
- Host UI to edit durations at runtime (authoring stays in `quiz.json`).
- Mandatory countdown on all quizzes.
- Sub-second precision or synchronized wall-clock NTP beyond server `Date.now()`.
- Auto-advance through CORRECT / EXPLAIN / LEADERBOARD (only QUESTION expiry).
- CMS/editor; client-only timers without server authority.

## Decisions

### 1. Field name and placement

- **Decision:** Use integer seconds field **`countdownSeconds`**:
  - Quiz default: `config.countdownSeconds` (optional).
  - Per question: top-level `questions[].countdownSeconds` (optional), not under `metadata` (pacing is first-class, like `explain`).
- **Values:** non-negative JSON integers (`0`, `1`, `2`, …). Reject floats, strings, negatives, `NaN`, booleans.
- **Semantics of `0`:** explicitly **disabled** countdown for that level (not “instant skip”). Effective duration `0` ⇒ no timer (host-paced).
- **Omitted / null:** “not set” at that level (fall through).
- **Alternatives considered:**
  - `timer` / `timeLimit` objects → more flexible later, heavier for v1.
  - Metadata key `countdown` → free-form and easy to mistype; filters already own metadata.
  - Milliseconds → awkward for authors; seconds match training UX.

### 2. Effective duration resolution

```ts
function effectiveCountdownSeconds(quiz: Quiz, question: Question): number | null {
  if (question.countdownSeconds !== undefined) return question.countdownSeconds;
  if (quiz.config?.countdownSeconds !== undefined) return quiz.config.countdownSeconds;
  return null; // no countdown configured
}
// Active timer only when effective !== null && effective > 0
```

| Question field | Config default | Effective |
|----------------|----------------|-----------|
| omitted        | omitted        | none      |
| omitted        | `30`           | `30`      |
| omitted        | `0`            | none      |
| `45`           | `30`           | `45`      |
| `0`            | `30`           | none      |
| `0`            | omitted        | none      |

- Export a small helper from `quiz.ts` for session + tests.
- **Fingerprint:** do **not** include `config.countdownSeconds` or per-question `countdownSeconds` (pacing/presentation; same spirit as `config` / `metadata`).

### 3. Schema and load

- **`quiz.schema.json`:**
  - `config.properties.countdownSeconds`: `{ "type": "integer", "minimum": 0 }`
  - `question.properties.countdownSeconds`: same
  - Descriptions note override + `0` = disabled
- **Runtime** remains authoritative (schema alone does not prove integer at load for all tooling): `parseQuizConfig` and question parsing validate and retain known fields only on config (`slideMetadataKeys` + `countdownSeconds`).
- Types:

  ```ts
  type QuizConfig = {
    slideMetadataKeys: string[];
    countdownSeconds?: number; // only set when author provided
  };
  type Question = {
    /* existing */
    countdownSeconds?: number;
  };
  ```

- Empty `config: {}` still yields `{ slideMetadataKeys: [] }` without `countdownSeconds` key (or `countdownSeconds` undefined).

### 4. Server-authoritative deadline

- **Decision:** On every transition **into** QUESTION (LOBBY→QUESTION, LEADERBOARD→QUESTION, and Back into QUESTION from CORRECT), compute effective seconds. If active (`> 0`), set:

  ```ts
  questionDeadlineMs = Date.now() + effective * 1000
  ```

  else `questionDeadlineMs = null`. Clear deadline when leaving QUESTION for any reason.

- Schedule a single `setTimeout` (or equivalent) for the remaining ms; on fire, if still QUESTION for the same `questionIndex` / generation token, call the same internal path as host advance (QUESTION→CORRECT), then durable-save if hooks exist.
- Clear timeout on host advance/back, soft reset, or process teardown.
- **Generation token / question epoch:** increment when entering QUESTION so a late timeout cannot advance a later question.

- **State payloads** (projector + player) while phase is QUESTION and deadline set:

  ```ts
  countdown: {
    totalSeconds: number;      // effective duration for this question
    deadlineMs: number;        // epoch ms (server clock)
  } | null
  ```

  Clients compute remaining as `max(0, ceil((deadlineMs - Date.now()) / 1000))` and re-render locally between polls. Prefer absolute deadline over “remaining seconds only” so poll jitter does not jump the clock backward as badly.

- **Host Next before expiry:** normal advance; cancel timer.
- **Back into QUESTION:** **restart** full effective duration (simple rule; do not resume partial). Document this.
- **Answers after expiry:** phase already left QUESTION (or is leaving); answer API rejects non-QUESTION as today. Race: answer in flight as timer fires — existing single-answer / phase checks apply; no special casing required beyond “advance is authoritative.”

### 5. Auto-advance wiring

- Session owns timer logic; HTTP layer already durable-saves after `advance()`. Expose something like `session.onPhaseChange` or have the boot/HTTP bootstrap register:

  ```ts
  session.setCountdownHooks({ onAutoAdvance: () => durableSave(session) })
  ```

  so expiry persists without projector polling being required.

- Soft reset → LOBBY clears deadline and cancels timer.

### 6. Persistence

- Add optional `questionDeadlineMs: number | null` on snapshot (and hydrate state).
- **Version:** keep `SNAPSHOT_VERSION = 2` if field is optional; missing field on load ⇒ `null` and, if phase is QUESTION with effective countdown > 0, **recompute** `deadlineMs = now + effective` (fresh full timer on upgrade path) **or** treat as no deadline until next enter. Prefer: if phase === QUESTION and effective > 0 and snapshot has no deadline → start a **new** full countdown from restore time (acceptable degradation for old snapshots).
- If snapshot has `questionDeadlineMs` in the past and phase is still QUESTION → on hydrate, immediately run expiry advance (or set deadline to now and let timer fire on next tick) so rooms do not stick open forever after long downtime.
- If deadline is in the future → reschedule timeout for remaining ms.
- Fingerprint unchanged by countdown fields; no quiz mismatch from adding timers to JSON alone if only config/question countdown changed… wait: fingerprint currently ignores config and metadata but includes question text/choices/correct/explain. Adding `countdownSeconds` on questions without including it means restore still matches — good for pacing-only edits. If we want pacing-only edits to keep the room, that matches proposal.

### 7. UI

- **Projector:** large remaining time during QUESTION (e.g. top of slide or near phase label); hide when `countdown` is null or phase ≠ QUESTION. Optional urgency style under last ~5s (CSS only).
- **Player:** compact remaining time above choices during QUESTION while answering; still show after answered until phase changes (optional—prefer keep visible so late joiners/answered players see pace).
- No new API routes; poll continues to drive phase transitions after auto-advance.
- Accessibility: numeric text, not color-only.

### 8. Sample content and docs

- `quiz.json`: set a modest default e.g. `config.countdownSeconds: 30` (or 45); optionally override one long scenario question higher / one short lower. Do not force every existing fixture in tests to add fields.
- README: replace “No timers” with optional countdown model and resolution table.

## Risks / Trade-offs

- **[Risk] setTimeout drift / process sleep** → Mitigation: deadline is absolute; clients and expiry re-check `Date.now()` vs deadline; on wake, overdue QUESTION advances immediately.
- **[Risk] Multi-tab host + auto-advance** → Mitigation: single in-memory session; both tabs poll and see CORRECT; double-advance is already phase-safe.
- **[Risk] Authors set very large values** → Mitigation: no hard max in v1 (or soft max e.g. 3600 in validate if desired); document common ranges. Optional max can be added later without schema break if documented as implementation limit.
- **[Risk] Back restarts full timer** feels harsh → Mitigation: simple and predictable; resume-partial can be a follow-up if hosts ask.
- **[Trade-off] Client clock skew** vs server → Remaining display may be off by seconds; phase change is server-driven so scoring stays fair.
- **[Trade-off] Auto-advance without host** changes the “fully host-driven” product promise → Only when countdown configured; default omit preserves old behavior.

## Migration Plan

1. Ship schema + validator accepting old files (no countdown fields).
2. Implement session timer + UI; optional snapshot field.
3. Add default to sample `quiz.json` when ready for demos.
4. Rollback: omit countdown fields / revert code; old processes ignore unknown keys today on questions via additionalProperties but runtime drops unknown config keys—safe.

## Open Questions

- None blocking. Optional later: host “+15s” control; max bound; resume-partial on Back.
