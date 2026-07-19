## Context

Live training quiz loads a fixed `quiz.json` once at process start. Each question has `choices[]` and a `correct` index into that array. Today the session exposes those arrays unchanged to projector and player state, and participant answers store the choice index as shown.

Authors commonly put the right answer first. Players can exploit position instead of reading options. Shuffle must keep host and all players on the **same** order for a room, keep scoring correct, and survive snapshot restore (answers are indices into the order that was live when they answered).

Constraints:

- Single in-process `Session`; no multi-room complexity.
- Snapshot already stores per-participant `answers: questionIndex → choiceIndex`.
- `quizFingerprint` hashes canonical loaded quiz content (title, questions text/choices/correct/explain) and must **not** change solely because a session shuffled.
- `Session.fromHydrate` / `sessionFromSnapshot` currently call `new Session(quiz)` then overlay phase/participants — any shuffle-in-constructor must not run again on restore.

## Goals / Non-Goals

**Goals:**

- Shuffle each question’s choices once when a **new** session starts (construct) or the host **resets** to empty LOBBY.
- Remap `correct` so it always indexes the shuffled `choices`.
- Projector and player APIs expose the same effective choices/correct for the session.
- Persist effective choice order (and remapped correct) in the session snapshot; restore without reshuffling.
- Keep on-disk `quiz.json` and `loadQuiz` / validation unchanged.
- Unit-test shuffle purity, scoring after shuffle, and restore stability.

**Non-Goals:**

- Per-player different order (anti-cheat isolation).
- Optional per-quiz or per-question “lock order” flags (can add later).
- Shuffling question order (only choice order within a question).
- Rewriting `explain` text that refers to authoring letters (A)/(B) by file order.
- Client-side shuffle; order is server-authoritative.
- Changing scoring formula, phases, or join rules.

## Decisions

### 1. Session owns an effective play quiz; fingerprint stays canonical

- **Choice:** `loadQuiz` still returns the authoring-order `Quiz`. `main.ts` continues to fingerprint that object. `Session` holds a **deep-copied** playable question list (`choices` + `correct` possibly reordered) used for `answer`, `projectorState`, and `playerState`. Title/metadata remain from the loaded quiz.
- **Why:** Separates “identity of content file” from “presentation order this room is using.” Avoids fingerprint thrash and keeps restore matching the file.
- **Alternatives:** Shuffle the shared in-memory quiz at boot (breaks multi-session future and couples fingerprint to order); store only permutation vectors (more indirection, easy to desync `correct`).

### 2. When to shuffle

- **Choice:** Shuffle on `new Session(quiz)` and on `session.reset()`. Do **not** shuffle on `Session.fromHydrate` / `sessionFromSnapshot`.
- **Why:** New room or host “new training” gets a fresh order; mid-session restart must keep indices valid.
- **Alternatives:** Shuffle once per process lifetime (stale order across reset); shuffle on every LOBBY→QUESTION (changes order under already-joined players who saw a previous cycle — unnecessary).

### 3. Algorithm

- **Choice:** Independent Fisher–Yates per question, using `crypto.getRandomValues` (or Deno-safe equivalent) for index picks. Pure helper e.g. `shuffleQuestionChoices(question: Question): Question` in `quiz.ts` (or small `shuffle.ts`) that returns new `{ text, choices, correct, explain }` without mutating the input.
- **Why:** Unbiased permutation; easy to unit test with a seeded/injected RNG if we pass `randomInt` for tests.
- **Alternatives:** `Array.sort(() => Math.random() - 0.5)` (biased); fixed rotate-by-N (predictable).

### 4. Snapshot shape

- **Choice:** Extend `SessionSnapshot` / hydrate with the **effective** questions’ `choices` and `correct` for every question index (parallel array to the loaded quiz length). On restore, build the session’s playable questions from the snapshot when present and length/text-aligned with the loaded quiz; if missing (old snapshots) or misaligned, treat as restore failure equivalent to mismatch → new empty session **or** fall back to reshuffle only when there are **no** participants/answers (prefer: require effective questions in new snapshot version).
- **Why:** Answers are indices into effective choices; without storing order, restore is wrong.
- **Snapshot version:** Bump `SNAPSHOT_VERSION` (e.g. `1` → `2`) and include `effectiveQuestions: { choices: string[]; correct: number }[]` (text/explain can be taken from loaded quiz to avoid duplication, but storing full playable `Question[]` is acceptable and simpler). Prefer storing full effective `questions` array matching `Question` shape used in play so hydrate is self-contained for scoring fields.
- **Alternatives:** Encode only `number[]` permutations; smaller but must re-apply to loaded quiz carefully.

### 5. `fromHydrate` construction path

- **Choice:** Stop blindly shuffling inside a path used by restore. Pattern:

  - `constructor(quiz)` → copy + shuffle → set playable questions.
  - `fromHydrate(quiz, state)` → copy quiz title/metadata; set playable questions from `state.effectiveQuestions` (or full questions); apply phase/participants; **no** RNG.

- **Why:** Fixes the “constructor always shuffles” footgun.
- **Alternatives:** `new Session(quiz, { shuffle: false })` then assign — easier to misuse.

### 6. UI layer

- **Choice:** No client-side reordering. Player/projector already render `state.question.choices` and highlight `correct` from API. Specs only lock the contract that both surfaces show session order.
- **Why:** Single source of truth; feedback `correctIndex` already returned from `answer()`.

### 7. Tests

- Inject RNG or mock `randomInt` so shuffle is deterministic in tests.
- Assert: after shuffle, multiset of choice strings equals original; `choices[correct]` equals original correct text.
- Assert: two `new Session` calls can differ in order (probabilistic or forced RNG).
- Assert: snapshot round-trip preserves effective choices and answer indices still score correctly.
- Assert: `reset()` produces a new shuffle (with controlled RNG).

## Risks / Trade-offs

- **[Risk] Old v1 snapshots lack effective order** → **Mitigation:** Version bump; invalid/old version fails restore → empty LOBBY (same as corrupt/mismatch path). Document one-time loss of in-flight sessions on upgrade.
- **[Risk] `explain` text references authoring positions (A)/(B)** → **Mitigation:** Non-goal; authors should describe options by content. Optional future: strip letter hints.
- **[Risk] Identical consecutive shuffles** → **Mitigation:** Acceptable; rare for ≥3 choices. Tests use injected RNG, not “must differ.”
- **[Risk] Hydrate/snapshot size grows slightly** → **Mitigation:** Negligible for training quiz sizes.
- **[Trade-off] Shared room order vs per-player order** → Shared is correct for instructor-led discussion pointing at “the second option.”

## Migration Plan

1. Implement helper + session playable questions + tests.
2. Bump snapshot version; write/read `effectiveQuestions`.
3. Deploy/restart: in-flight v1 snapshots won’t restore (empty LOBBY); operators use normal fresh start.
4. Rollback: revert code; v2 snapshots won’t load on old code (same empty-LOBBY guard) — acceptable for ad-hoc tool.

## Open Questions

- None blocking. Optional follow-up: quiz-level `"shuffleChoices": false` escape hatch if a question set is order-sensitive (e.g. “all of the above” patterns) — defer unless authors request it.
