## Context

The live quiz session already tracks every participant’s answers as a `Map<questionIndex, choiceIndex>` and exposes host-only `projectorState()` with `participantCount`, phase, and current question. The projector status line shows joins and question progress, but not engagement.

Hosts need two derived numbers while running a room:

1. How many participants are **active** (still participating by answering).
2. Of those active participants, how many have **already answered the current question**.

Both can be computed from existing in-memory answer maps; no new player APIs or durable fields are required.

## Goals / Non-Goals

**Goals:**

- Normative definition of **active user** aligned with the product rule: answered at least **2 of the last 4** questions (any recorded choice counts).
- Stable windowing rules for early session, mid-session, LOBBY/END, and after reset/filter rebuild.
- Projector state fields + UI for global active count and per-current-question “active answered” count.
- Unit-tested pure logic so UI only renders server numbers.

**Non-Goals:**

- Changing scoring, leaderboard, join, or answer rules.
- Player UI showing active metrics.
- Persist-time storage of active counts (derive on read).
- Configurable window size or threshold (fixed 4 / 2 for this change).
- “Online” presence / websocket heartbeats; activity is answer-based only.
- Historical charts or per-past-question active breakdown on the projector (only current question’s active-answered count plus session-level active total).

## Decisions

### 1. Window: last four playable question indices ending at the reference index

**Decision:** Define the engagement window as the contiguous playable indices:

`[max(0, ref - 3), ref]` inclusive — at most four indices.

**Reference index `ref`:**

| Phase | `ref` |
| --- | --- |
| `QUESTION`, `CORRECT`, `EXPLAIN`, `LEADERBOARD` | current `questionIndex` |
| `LOBBY` | no window → active count **0**, no current-question answered metric |
| `END` | last playable index `questionCount - 1` (if `questionCount > 0`), else empty |

**Rationale:** “Last 4 questions” means the current question and up to three immediately preceding ones in play order. Including the current index during `QUESTION` lets someone become active by answering the current question if they already answered one of the prior three (or two including current). LOBBY has no “current” engagement context after reset clears answers; active is zero until play resumes.

**Alternatives considered:**

- Window only over *completed* questions (exclude current until leave `QUESTION`): under-counts mid-question engagement; host wants live “active answered” on the current slide.
- Always use global last four ever asked even after reset: reset already clears answer maps; keeping zero-after-reset is simpler and matches roster-kept / answers-cleared semantics.

### 2. Active threshold: ≥ 2 answers in the window

**Decision:** A participant is **active** iff the number of window indices for which `participant.answers.has(index)` is **≥ 2**. Correctness does not matter. Missing keys (no answer) do not count. Choice value is ignored.

If the window length is **&lt; 2** (e.g. only question 0 so far), **no** participant can be active yet.

**Rationale:** Matches the stated rule; early-session behavior falls out naturally.

### 3. “Active users who answered this question”

**Decision:** When phase has a current question (`QUESTION` / `CORRECT` / `EXPLAIN` / `LEADERBOARD`), count participants who are **active under the same window** and also `answers.has(questionIndex)`.

When there is no current question (`LOBBY` / `END` without exposing a question object), expose `activeAnsweredCount` as `0` or omit only if UI hides it — prefer always sending `0` for a stable JSON shape when `question` is null, and still send `activeUserCount` (END may be non-zero).

**Field names on `projectorState()`:**

- `activeUserCount: number` — always present
- `activeAnsweredCount: number` — always present; meaningful when `question` is non-null; `0` in LOBBY; on END equals how many active users answered the last question if useful, or `0` if we treat END as no current question UI — **choose:** on END, `activeAnsweredCount` is `0` (no current question slide); `activeUserCount` still uses last-index window so host sees final engagement at session end.

### 4. Compute on read in session layer

**Decision:** Implement pure functions (e.g. `engagementWindow(ref, questionCount)`, `isActive(participant, window)`, aggregations) used by `projectorState()`. Do not cache in snapshot.

**Rationale:** Answer maps already change on answer/advance/reset; derivation is O(participants × 4).

### 5. Projector UI placement

**Decision:**

- **Global active count:** show near existing participant chrome (status line / lobby wait area), e.g. `N active` alongside joins, so it is visible across phases including LOBBY (`0`) and END.
- **Active answered on question:** on phases that show the current question (`QUESTION`, `CORRECT`, `EXPLAIN` at minimum; LEADERBOARD optional but recommended for consistency while `question` payload exists — LEADERBOARD currently focuses on ranks; show the answered metric on QUESTION/CORRECT/EXPLAIN where the host times advance; still include in state for all non-null question phases). Prefer a compact line under the question or near the countdown: `K / N active answered`.

**Rationale:** Host uses QUESTION phase most for pacing; CORRECT/EXPLAIN still useful if they delayed.

### 6. Reset, filters, back navigation

**Decision:**

- **Reset** clears answer maps → window empty of answers → `activeUserCount = 0`.
- **Runtime filter rebuild** in LOBBY also clears answers (existing behavior) → same.
- **Host Back** into a prior `QUESTION` does not clear answers; window moves with `questionIndex`; a participant who answered Q2–Q4 remains active when viewing Q4; if Back to Q1, window is only indices available around Q1.

No special cases beyond recomputing from maps + index.

### 7. Player state

**Decision:** Do not add these fields to `playerState`.

## Risks / Trade-offs

- **[Risk] Ambiguity of “last 4” vs completed-only** → Mitigation: lock definition in specs with explicit scenarios (Q0 only, Q0–Q2, mid-session Q7, LOBBY, END).
- **[Risk] Late joiners never become active until two answers** → Acceptable; matches rule; they still appear in `participantCount`.
- **[Risk] Host confuses active with joined** → Mitigation: label UI “active” distinctly from “joined” / “participants”.
- **[Risk] After Back, window shrinks and active count drops** → Documented; correct under rolling window; avoids sticky active forever.
- **[Trade-off] Fixed 2-of-4** → Simple ops story; change later if product wants config.

## Migration Plan

- Deploy with code only; no snapshot version bump.
- Old clients ignore new JSON fields; new projector UI requires matching server.
- Rollback: revert commit; no data migration.

## Open Questions

- None blocking; END-phase `activeAnsweredCount = 0` is a product default above. If hosts want final “answered last Q” on END screen, a small follow-up can set `ref` window display without changing active definition.
